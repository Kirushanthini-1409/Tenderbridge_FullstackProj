import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../services/supabase.js';
import TenderBridgeLogo from '../../components/common/TenderBridgeLogo.jsx';
import BridgeGraphic from '../../components/common/BridgeGraphic.jsx';

export default function BusinessLogin() {
  const { signIn, signOut, isConfigured, loading: authLoading, session, role, roleResolved } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [resending, setResending] = useState(false);
  const mismatchHandled = useRef(false);

  async function rejectWrongRole(actualRole) {
    if (mismatchHandled.current) return;
    mismatchHandled.current = true;
    const accountType = actualRole === 'ORGANIZATION' ? 'Organization' : actualRole === 'ADMIN' ? 'Admin' : 'another';
    setError(`This account has ${accountType} access. Sign in here with a Business account, or use the matching sign-in page.`);
    try { await signOut(); } catch { /* Keep the role mismatch visible if the auth service is temporarily unavailable. */ }
  }

  useEffect(() => {
    if (!session) {
      mismatchHandled.current = false;
      return;
    }
    if (authLoading || !roleResolved) return;
    if (role === 'BUSINESS') navigate('/business/dashboard', { replace: true });
    else void rejectWrongRole(role);
  }, [authLoading, session, roleResolved, role, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Please provide your work email and password.');
      return;
    }
    setBusy(true);
    setError('');
    setResendMessage('');

    try {
      const data = await signIn(email.trim(), password);
      if (data.role !== 'BUSINESS') {
        await rejectWrongRole(data.role);
        return;
      }
      navigate('/business/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    setError('');
    setResendMessage('');
    if (!email.trim()) {
      setError('Enter your work email above first to resend confirmation.');
      return;
    }
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: new URL('/login/business', window.location.origin).toString() },
      });
      if (resendError) throw resendError;
      setResendMessage('Verification email sent! Check your inbox to confirm your account.');
    } catch (resendError) {
      setError(resendError.message || 'Could not resend the confirmation email.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-split-layout">
      {/* Left Panel: Branded Hero (Matching Reference 02) */}
      <section className="auth-hero-panel" aria-label="Business Workspace Information">
        <div className="auth-hero-top">
          <div className="auth-hero-brand">
            <TenderBridgeLogo variant="business" theme="dark" size="lg" to="/" />
          </div>

          <h1 className="auth-hero-heading">
            Business <span className="auth-hero-accent">workspace</span>
          </h1>
          <p className="auth-hero-subheading">
            Discover private tenders, prepare applications and track every outcome.
          </p>
        </div>

        {/* Bridge graphic with glowing cyber nodes */}
        <BridgeGraphic variant="business" />

        {/* 3 Key Feature Badges */}
        <div className="auth-feature-list">
          <div className="auth-feature-item">
            <div className="auth-feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <div className="auth-feature-text">
              <strong>Tender discovery</strong>
              <p>Find relevant private tenders from trusted contracting organisations.</p>
            </div>
          </div>

          <div className="auth-feature-item">
            <div className="auth-feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div className="auth-feature-text">
              <strong>Secure document vault</strong>
              <p>Store, manage and collaborate on your tender documents securely.</p>
            </div>
          </div>

          <div className="auth-feature-item">
            <div className="auth-feature-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </div>
            <div className="auth-feature-text">
              <strong>Application tracking</strong>
              <p>Track progress, view outcomes and plan your next opportunity.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Right Panel: Business Sign In Form */}
      <main className="auth-form-panel">
        <div className="auth-form-container">
          {/* Mobile-only logo */}
          <div style={{ display: 'none', marginBottom: '24px' }} className="mobile-only-logo">
            <TenderBridgeLogo variant="business" theme="light" size="md" to="/" />
          </div>

          <div className="auth-form-header">
            <h2 className="auth-form-title">Business sign in</h2>
            <p className="auth-form-subtitle">Sign in to your business account.</p>
          </div>

          {/* Feedback & Alert Notices */}
          {!isConfigured && (
            <div className="auth-notice auth-notice-error" role="alert">
              Authentication is not configured. Set the Supabase credentials in your environment.
            </div>
          )}

          {error && (
            <div className="auth-notice auth-notice-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {resendMessage && (
            <div className="auth-notice auth-notice-success" role="status">
              <span>{resendMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Work email field */}
            <div className="auth-form-group">
              <label htmlFor="business-email" className="auth-label">Work email address</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                </span>
                <input
                  id="business-email"
                  type="email"
                  autoComplete="email"
                  required
                  className="auth-input"
                  placeholder="name@yourcompany.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="auth-form-group">
              <label htmlFor="business-password" className="auth-label">Password</label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input
                  id="business-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="auth-input has-toggle"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-toggle-pwd-btn"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember me & Forgot Password */}
            <div className="auth-options-row">
              <label className="auth-checkbox-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                <span>Remember me on this device</span>
              </label>
              <button
                type="button"
                className="auth-text-link"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                onClick={() => alert('Password reset is managed through your administrator or Supabase dashboard.')}
              >
                Forgot password?
              </button>
            </div>

            {/* Primary Submit Button */}
            <button
              type="submit"
              className="btn-auth-submit"
              disabled={busy || !isConfigured}
            >
              {busy ? (
                <>Signing in to business workspace…</>
              ) : (
                <>
                  <span>Sign in to business workspace</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>
              )}
            </button>
          </form>

          {/* Resend confirmation button if unverified */}
          {error.toLowerCase().includes('confirm') && (
            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="btn-auth-secondary"
                onClick={handleResendConfirmation}
                disabled={resending}
              >
                {resending ? 'Sending verification email…' : 'Resend confirmation email'}
              </button>
            </div>
          )}

          {/* Divider OR */}
          <div className="auth-divider">
            <span>OR</span>
          </div>

          {/* Secondary CTA: Create Account */}
          <div style={{ textAlign: 'center' }}>
            <span style={{ display: 'block', fontSize: '14px', color: '#1e293b', fontWeight: 650, marginBottom: '10px' }}>
              New business to TenderBridge?
            </span>
            <Link to="/register/business" className="btn-auth-secondary">
              <span>Create a business account</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>

          {/* Crosslink to Organization Sign In */}
          <div className="auth-crosslink-wrap">
            <span>Looking for the organization workspace?</span>
            <Link to="/login/organization">
              <span>Organization sign in</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>

          {/* Crosslink to Admin Sign In */}
          <div className="auth-crosslink-wrap" style={{ marginTop: '8px' }}>
            <span>Platform administrator?</span>
            <Link to="/login/admin">
              <span>Admin sign in</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>

          {/* Legal Footer Links */}
          <footer className="auth-footer-links">
            <div className="auth-footer-nav">
              <a href="#privacy">Privacy policy</a>
              <span>|</span>
              <a href="#terms">Terms of service</a>
              <span>|</span>
              <a href="#support">Support</a>
            </div>
            <div>
              <a href="#contact" className="auth-text-link" style={{ fontSize: '12px' }}>Need help? Contact support →</a>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
