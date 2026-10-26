import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { dashboardForRole } from '../../utils/roles.js';
import { humanize } from '../../utils/formatters.js';
import TenderBridgeLogo from '../../components/common/TenderBridgeLogo.jsx';
import BridgeGraphic from '../../components/common/BridgeGraphic.jsx';

export default function AdminLogin() {
  const { signIn, signOut, isConfigured, loading: authLoading, session, role, roleResolved } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nonAdminUser, setNonAdminUser] = useState(null);

  useEffect(() => {
    if (!authLoading && session && roleResolved) {
      if (role === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        setNonAdminUser({ email: session.user?.email, role });
      }
    }
  }, [authLoading, session, roleResolved, role, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Please provide your administrative email and password.');
      return;
    }
    setBusy(true);
    setError('');
    setNonAdminUser(null);

    try {
      const data = await signIn(email.trim(), password);
      if (data.role === 'ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        setNonAdminUser({ email: email.trim(), role: data.role });
        setError(
          `Access Denied: Account "${email.trim()}" does not have administrator privileges. Only provisioned platform administrators may enter the administration workspace.`
        );
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOutAndRetry() {
    await signOut();
    setNonAdminUser(null);
    setError('');
    setEmail('');
    setPassword('');
  }

  return (
    <div className="auth-split-layout">
      {/* Left Panel: Administrative Governance */}
      <section className="auth-hero-panel" aria-label="Administration Information">
        <div className="auth-hero-top">
          <div className="auth-hero-brand">
            <TenderBridgeLogo variant="business" theme="dark" size="lg" to="/" />
          </div>

          <h1 className="auth-hero-heading">
            System <span className="auth-hero-accent">Administration</span>
          </h1>
          <p className="auth-hero-subheading">
            Restricted operations portal for verification approvals, catalogue management, and platform audit oversight.
          </p>
        </div>

        <BridgeGraphic variant="organization" />

        <div className="auth-feature-list">
          <div className="auth-feature-item">
            <div className="auth-feature-icon">🛡️</div>
            <div>
              <strong>Access-controlled authority</strong>
              <p>Requires trusted server-verified app_metadata administrator credentials.</p>
            </div>
          </div>
          <div className="auth-feature-item">
            <div className="auth-feature-icon">📋</div>
            <div>
              <strong>Immutable audit logging</strong>
              <p>Every administrative action and catalogue change is recorded for auditability.</p>
            </div>
          </div>
          <div className="auth-feature-item">
            <div className="auth-feature-icon">🏢</div>
            <div>
              <strong>Verification queue</strong>
              <p>Review and decide on organization and business onboarding credentials.</p>
            </div>
          </div>
        </div>

        <div className="auth-hero-footer">
          <span>Security Notice</span>
          <p>
            Platform administrator privileges cannot be requested through public registration.
            Accounts must be provisioned directly by a trusted database administrator.
          </p>
        </div>
      </section>

      {/* Right Panel: Admin Sign-In Form */}
      <section className="auth-form-panel" aria-label="Admin Sign In Form">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-badge" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🔒 Protected Portal
            </div>
            <h2 className="auth-title">Admin sign in</h2>
            <p className="auth-subtitle">
              Sign in with your verified platform administrator account to access platform governance controls.
            </p>
          </div>

          {error && (
            <div className="notice notice-error" role="alert" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {nonAdminUser && (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#334155' }}>
                You are currently signed in as <strong>{nonAdminUser.email}</strong> with role <strong>{humanize(nonAdminUser.role)}</strong>.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => navigate(dashboardForRole(nonAdminUser.role))}
                >
                  Go to {humanize(nonAdminUser.role)} Workspace →
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleSignOutAndRetry}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}

          {!nonAdminUser && (
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="field">
                <label className="field-label" htmlFor="admin-email">
                  Administrator email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@tenderbridge.internal"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="field-label" htmlFor="admin-password">
                    Password
                  </label>
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter administrator password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className="form-submit-bar" style={{ marginTop: 20 }}>
                <button
                  type="submit"
                  className="button button-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={busy}
                >
                  {busy ? 'Authenticating…' : 'Enter Admin Workspace →'}
                </button>
              </div>
            </form>
          )}

          <div className="auth-card-footer" style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
            <div>
              <span>Looking for standard workspace? </span>
              <Link to="/login/business" style={{ color: '#0284c7', fontWeight: 600 }}>Business Sign In</Link>
              <span> · </span>
              <Link to="/login/organization" style={{ color: '#0284c7', fontWeight: 600 }}>Organization Sign In</Link>
            </div>
            <div style={{ marginTop: 8 }}>
              <Link to="/" style={{ color: '#94a3b8' }}>&larr; Return to TenderBridge homepage</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
