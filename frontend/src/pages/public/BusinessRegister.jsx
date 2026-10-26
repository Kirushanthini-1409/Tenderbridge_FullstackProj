import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../services/supabase.js';
import { dashboardForRole } from '../../utils/roles.js';
import TenderBridgeLogo from '../../components/common/TenderBridgeLogo.jsx';
import BridgeGraphic from '../../components/common/BridgeGraphic.jsx';

export default function BusinessRegister() {
  const { signUp, isConfigured } = useAuth();
  const navigate = useNavigate();

  // Form states
  const [contactName, setContactName] = useState('');
  const [businessLegalName, setBusinessLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [shareInDirectory, setShareInDirectory] = useState(true);

  // Status & UI flow
  const [step, setStep] = useState(1); // 1 = Account details, 2 = Verify email
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [resending, setResending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!contactName.trim()) {
      setError('Please enter your contact name.');
      return;
    }
    if (!businessLegalName.trim()) {
      setError('Please enter your business legal name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter a valid work email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your password entry.');
      return;
    }
    if (!agreedTerms) {
      setError('You must agree to the Terms of Use and Privacy Policy to proceed.');
      return;
    }

    setBusy(true);

    try {
      const data = await signUp(email.trim(), password, 'BUSINESS', {
        contact_name: contactName.trim(),
        business_legal_name: businessLegalName.trim(),
        share_in_directory: shareInDirectory,
      });

      // If user session is created immediately (auto-confirm enabled)
      if (data?.session) {
        navigate(dashboardForRole('BUSINESS'), { replace: true });
      } else {
        // Move to step 2: Verify email
        setStep(2);
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your information.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    setError('');
    setResendMessage('');
    if (!email.trim() || !supabase) return;
    setResending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: new URL('/login/business', window.location.origin).toString() },
      });
      if (resendError) throw resendError;
      setResendMessage('Verification email resent! Check your inbox.');
    } catch (err) {
      setError(err.message || 'Could not resend the confirmation email.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-split-layout">
      {/* Left Panel: Branded Stepper & Visual (Matching Reference 04) */}
      <section className="auth-hero-panel" aria-label="Business Registration Progress">
        <div className="auth-hero-top">
          <div className="auth-hero-brand">
            <TenderBridgeLogo variant="business" theme="dark" size="lg" to="/" />
          </div>

          <h1 className="auth-hero-heading">
            Turn opportunities into <span className="auth-hero-accent">real outcomes.</span>
          </h1>
          <p className="auth-hero-subheading">
            Find relevant tenders, prepare stronger applications and grow your business with confidence.
          </p>

          {/* Stepper Navigation */}
          <div className="auth-stepper">
            <div className={`stepper-item ${step === 1 ? 'active' : 'completed'}`}>
              <div className="stepper-num">{step > 1 ? '✓' : '1'}</div>
              <div className="stepper-content">
                <span className="stepper-title">Account details</span>
                <span className="stepper-desc">Set up your login and company details</span>
              </div>
            </div>

            <div className={`stepper-item ${step === 2 ? 'active' : step > 2 ? 'completed' : 'pending'}`}>
              <div className="stepper-num">2</div>
              <div className="stepper-content">
                <span className="stepper-title">Verify email</span>
                <span className="stepper-desc">Confirm your work email address</span>
              </div>
            </div>

            <div className="stepper-item pending">
              <div className="stepper-num">3</div>
              <div className="stepper-content">
                <span className="stepper-title">Business profile</span>
                <span className="stepper-desc">Add turnover, experience, and certifications</span>
              </div>
            </div>
          </div>
        </div>

        {/* Illuminated Bridge Visual */}
        <BridgeGraphic variant="business" />

        {/* Triple Icon Highlights */}
        <div className="auth-hero-triple-icons">
          <div className="triple-icon-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <div>
              <strong>Discover</strong>
              <span>relevant tenders</span>
            </div>
          </div>

          <div className="triple-icon-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div>
              <strong>Prepare</strong>
              <span>stronger applications</span>
            </div>
          </div>

          <div className="triple-icon-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            <div>
              <strong>Grow</strong>
              <span>your business</span>
            </div>
          </div>
        </div>
      </section>

      {/* Right Panel: Account Creation Form */}
      <main className="auth-form-panel">
        <div className="auth-form-container">
          {step === 1 ? (
            <>
              <div className="auth-form-header">
                <h2 className="auth-form-title">Create a business account</h2>
                <p className="auth-form-subtitle">Set up a secure account to discover tenders and submit applications.</p>
              </div>

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

              <form onSubmit={handleSubmit} noValidate>
                {/* Contact Name */}
                <div className="auth-form-group">
                  <label htmlFor="bus-contact-name" className="auth-label">Contact name</label>
                  <input
                    id="bus-contact-name"
                    type="text"
                    required
                    className="auth-input no-icon"
                    placeholder="Your full name"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    disabled={busy}
                  />
                </div>

                {/* Business Legal Name */}
                <div className="auth-form-group">
                  <label htmlFor="bus-legal-name" className="auth-label">Business legal name</label>
                  <input
                    id="bus-legal-name"
                    type="text"
                    required
                    className="auth-input no-icon"
                    placeholder="Your business legal name"
                    value={businessLegalName}
                    onChange={e => setBusinessLegalName(e.target.value)}
                    disabled={busy}
                  />
                </div>

                {/* Work Email */}
                <div className="auth-form-group">
                  <label htmlFor="bus-reg-email" className="auth-label">Work email</label>
                  <input
                    id="bus-reg-email"
                    type="email"
                    autoComplete="email"
                    required
                    className="auth-input no-icon"
                    placeholder="name@yourbusiness.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </div>

                {/* Password */}
                <div className="auth-form-group">
                  <label htmlFor="bus-reg-password" className="auth-label">Password</label>
                  <div className="auth-input-wrapper">
                    <input
                      id="bus-reg-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="auth-input no-icon has-toggle"
                      placeholder="Create a strong password"
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

                {/* Confirm Password */}
                <div className="auth-form-group">
                  <label htmlFor="bus-reg-confirm" className="auth-label">Confirm password</label>
                  <div className="auth-input-wrapper">
                    <input
                      id="bus-reg-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      className="auth-input no-icon has-toggle"
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="auth-toggle-pwd-btn"
                      onClick={() => setShowConfirmPassword(v => !v)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Checkbox 1: Terms */}
                <div style={{ marginBottom: '14px' }}>
                  <label className="auth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={agreedTerms}
                      onChange={e => setAgreedTerms(e.target.checked)}
                      required
                    />
                    <span>
                      I agree to the TenderBridge <a href="#terms" className="auth-text-link">Terms of Use</a> and <a href="#privacy" className="auth-text-link">Privacy Policy</a>.
                    </span>
                  </label>
                </div>

                {/* Checkbox 2: JV Partner Directory */}
                <div style={{ marginBottom: '24px' }}>
                  <label className="auth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={shareInDirectory}
                      onChange={e => setShareInDirectory(e.target.checked)}
                    />
                    <div>
                      <span>Include my business in the TenderBridge business partner directory</span>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                        Showcase your expertise to other organizations. You can change this later.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  className="btn-auth-submit"
                  disabled={busy || !isConfigured}
                >
                  {busy ? (
                    <>Creating business account…</>
                  ) : (
                    <>
                      <span>Create business account</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </>
                  )}
                </button>
              </form>

              {/* Already registered */}
              <div style={{ textAlign: 'center', marginTop: '22px', fontSize: '13px', color: '#64748b' }}>
                <span>Already registered? </span>
                <Link to="/login/business" className="auth-text-link">Business sign in</Link>
              </div>

              {/* Cross link to organization registration */}
              <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '13px' }}>
                <Link to="/register/organization" className="auth-text-link" style={{ color: '#0284c7' }}>
                  Register an organization instead
                </Link>
              </div>

              {/* Shared Auth Info Banner (Matching Reference 04) */}
              <div className="auth-info-banner">
                <svg className="auth-info-banner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>
                  Your account uses TenderBridge's shared secure sign-in; business role permissions are applied to your workspace.
                </span>
              </div>
            </>
          ) : (
            /* Step 2: Email Verification State */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>

              <h2 className="auth-form-title">Verify your email</h2>
              <p className="auth-form-subtitle" style={{ maxWidth: 380, margin: '0 auto 20px' }}>
                We've sent a confirmation link to <strong style={{ color: '#0f172a' }}>{email}</strong>. Open the email and confirm your address to activate your workspace.
              </p>

              {resendMessage && (
                <div className="auth-notice auth-notice-success" style={{ textAlign: 'left', marginBottom: '20px' }}>
                  {resendMessage}
                </div>
              )}

              {error && (
                <div className="auth-notice auth-notice-error" style={{ textAlign: 'left', marginBottom: '20px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 320, margin: '0 auto' }}>
                <Link to="/login/business" className="btn-auth-submit" style={{ textDecoration: 'none' }}>
                  Continue to Business sign in →
                </Link>
                <button
                  type="button"
                  className="btn-auth-secondary"
                  onClick={handleResendConfirmation}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : 'Resend confirmation link'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
