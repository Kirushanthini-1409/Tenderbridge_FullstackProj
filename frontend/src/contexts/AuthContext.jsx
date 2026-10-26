import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { setApiTokenProvider } from '../services/api.js';
import { request } from '../services/api.js';
import { normalizeRole } from '../utils/roles.js';

const AuthContext = createContext({
  session: null,
  user: null,
  role: 'BUSINESS',
  roleResolved: false,
  loading: true,
  isConfigured: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
    }),
  ]).finally(() => window.clearTimeout(timer));
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('BUSINESS');
  const [roleResolved, setRoleResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(null);

  function extractRole(u) {
    if (!u) return 'BUSINESS';
    const appMeta = u.app_metadata || {};
    // Workspace permissions are assigned only through trusted Supabase app_metadata.
    return normalizeRole(appMeta.role);
  }

  function acceptSession(nextSession) {
    sessionRef.current = nextSession || null;
    setSession(nextSession || null);
    setUser(nextSession?.user || null);
    setRole(extractRole(nextSession?.user));
    setRoleResolved(!nextSession);
    setLoading(Boolean(nextSession));
  }

  useEffect(() => {
    // Connect token provider to backend API caller
    setApiTokenProvider(async () => {
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    });

    if (!supabase) {
      setLoading(false);
      return;
    }

    let alive = true;
    withTimeout(supabase.auth.getSession(), 12000, 'Session check').then(({ data: { session: currentSession }, error }) => {
      if (alive && !error) acceptSession(currentSession);
      else if (alive) setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Supabase emits TOKEN_REFRESHED when a background tab becomes active.
      // Keep the current route usable; the user's role does not change when a
      // token rotates, and a network delay must not blank the whole workspace.
      if (event === 'TOKEN_REFRESHED' && newSession && sessionRef.current?.user?.id === newSession.user?.id) {
        sessionRef.current = newSession;
        setSession(newSession);
        setUser(newSession.user);
        return;
      }
      acceptSession(newSession);
    });

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) { setLoading(false); return undefined; }
    let active = true;
    // Resolve the workspace against the backend; ADMIN stays a trusted
    // app_metadata role while organizations may register directly.
    withTimeout(request('/api/v1/me'), 12000, 'Account role check').then(({ item }) => {
      if (active) { setRole(normalizeRole(item?.role || session.user?.app_metadata?.role)); setRoleResolved(true); }
    }).catch(() => {
      // Preserve a role already resolved for this account during a transient
      // API outage. On first sign-in the unresolved state remains fail-closed.
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session?.access_token]);

  async function signIn(email, password) {
    if (!supabase) throw new Error('Supabase authentication is not configured in .env.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // Keep protected routes in their loading state until the API resolves role.
    acceptSession(data.session);
    try {
      const { item } = await request('/api/v1/me');
      const effectiveRole = normalizeRole(item?.role || data.user?.app_metadata?.role);
      setRole(effectiveRole);
      setRoleResolved(true);
      setLoading(false);
      return { ...data, role: effectiveRole };
    } catch (error) {
      // A valid Supabase session can still be established while the API is
      // unavailable. Release the route guard and show the API error in Login.
      setRole(extractRole(data.user));
      setRoleResolved(false);
      setLoading(false);
      throw error;
    }
  }

  async function signUp(email, password, desiredRole = 'BUSINESS', metadata = {}) {
    if (!supabase) throw new Error('Supabase authentication is not configured in .env.');
    const safeRole = desiredRole === 'ORGANIZATION' ? 'ORGANIZATION' : 'BUSINESS';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Public registration may request a workspace but can never grant ADMIN.
        data: {
          ...metadata,
          requested_role: safeRole,
        },
        emailRedirectTo: new URL('/login', window.location.origin).toString(),
      },
    });
    if (error) throw error;
    if (data.session) acceptSession(data.session);
    return data;
  }

  async function signOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
    acceptSession(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        role,
        roleResolved,
        loading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
