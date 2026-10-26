import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../services/supabase.js';
import { dashboardForRole } from '../../utils/roles.js';
import TenderBridgeLogo from '../../components/common/TenderBridgeLogo.jsx';
import BridgeGraphic from '../../components/common/BridgeGraphic.jsx';

export default function OrgRegister() {
  const { signUp, isConfigured } = useAuth();
  const navigate = useNavigate();

  // Form fields
  const [contactPerson, setContactPerson] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Status & steps
  const [step, setStep] = useState(1); // 1 = Details, 2 = Verify email
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendMessage, setResendMessage] = useState('');
  const [resending, setResending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!contactPerson.trim()) {
      setError('Please provide the contact person name.');
      return;
    }
    if (!organizationName.trim()) {
      setError('Please provide the legal organization name.');
      return;
    }
    if (!email.trim()) {
      setError('Please provide a valid work email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters with a mix of letters and numbers.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }
    if (!agreedTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setBusy(true);

    try {
      const data = await signUp(email.trim(), password, 'ORGANIZATION', {
        contact_person: contactPerson.trim(),
        organization_name: organizationName.trim(),
      });

      if (data?.session) {
        navigate(dashboardForRole('ORGANIZATION'), { replace: true });
      } else {
        setStep(2);
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Check your connection or details.');
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
        options: { emailRedirectTo: new URL('/login/organization', window.location.origin).toString() },
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
      {/* Left Panel: Branded Stepper (Matching Reference 05) */}
      <section className="auth-hero-panel" aria-label="Organization Registration Progress">
        <div className="auth-hero-top">
          <div className="auth-hero-brand">
            <TenderBridgeLogo variant="organization" theme="dark" size="lg" to="/" />
          </div>

          <h1 className="auth-hero-heading">
            Bring your procurement <span className="auth-hero-accent">online</span>
          </h1>
          <p className="auth-hero-subheading">
            Publish private tenders and manage applicant communication in one trusted workspace.
          </p>

          {/* Stepper Navigation */}
          <div className="auth-stepper">
            <div className={`stepper-item ${step === 1 ? 'active' : 'completed'}`}>
              <div className="stepper-num">{step > 1 ? '✓' : '1'}</div>
              <div className="stepper-content">
                <span className="stepper-title">Account details</span>
                <span className="stepper-desc">Create your account</span>
              </div>
            </div>

            <div className={`stepper-item ${step === 2 ? 'active' : step > 2 ? 'completed' : 'pending'}`}>
              <div className="stepper-num">2</div>
              <div className="stepper-content">
                <span className="stepper-title">Verify email</span>
                <span className="stepper-desc">Confirm your email address</span>
              </div>
            </div>

            <div className="stepper-item pending">
              <div className="stepper-num">3</div>
              <div className="stepper-content">
                <span className="stepper-title">Organization profile</span>
                <span className="stepper-desc">Add your organization details</span>
              </div>
            </div>
          </div>
        </div>

        {/* Illuminated Bridge Visual */}
        <BridgeGraphic variant="organization" />
      </section>

      {/* Right Panel: Organization Account Creation Form */}
      <main className="auth-form-panel">
        <div className="auth-form-container">
          {step === 1 ? (
            <>
              <div className="auth-form-header">
                <h2 className="auth-form-title">Create an organization account</h2>
                <p className="auth-form-subtitle">Register your organization to publish and manage private tenders.</p>
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
                {/* Contact Person */}
                <div className="auth-form-group">
                  <label htmlFor="org-contact-person" className="auth-label">Contact person</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </span>
                    <input
                      id="org-contact-person"
                      type="text"
                      required
                      className="auth-input"
                      placeholder="Your full name"
                      value={contactPerson}
                      onChange={e => setContactPerson(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                </div>

                {/* Legal Organization Name */}
                <div className="auth-form-group">
                  <label htmlFor="org-legal-name" className="auth-label">Legal organization name</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
                    </span>
                    <input
                      id="org-legal-name"
                      type="text"
                      required
                      className="auth-input"
                      placeholder="Exact name of your organization"
                      value={organizationName}
                      onChange={e => setOrganizationName(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                </div>

                {/* Work Email */}
                <div className="auth-form-group">
                  <label htmlFor="org-reg-email" className="auth-label">Work email</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                    </span>
                    <input
                      id="org-reg-email"
                      type="email"
                      autoComplete="email"
                      required
                      className="auth-input"
                      placeholder="name@yourorganization.org"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                </div>

                {/* Create Password */}
                <div className="auth-form-group">
                  <label htmlFor="org-reg-password" className="auth-label">Create password</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <input
                      id="org-reg-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="auth-input has-toggle"
                      placeholder="Create a password"
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
                  <div className="auth-field-hint">
                    Use at least 8 characters with a mix of letters, numbers and symbols.
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="auth-form-group">
                  <label htmlFor="org-reg-confirm" className="auth-label">Confirm password</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </span>
                    <input
                      id="org-reg-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      className="auth-input has-toggle"
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

                {/* Terms Agreement Checkbox */}
                <div style={{ marginBottom: '24px' }}>
                  <label className="auth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={agreedTerms}
                      onChange={e => setAgreedTerms(e.target.checked)}
                      required
                    />
                    <span>
                      I agree to the <a href="#terms" className="auth-text-link">Terms of Service</a> and acknowledge the <a href="#privacy" className="auth-text-link">Privacy Policy</a>.
                    </span>
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  className="btn-auth-submit"
                  disabled={busy || !isConfigured}
                >
                  {busy ? (
                    <>Creating organization account…</>
                  ) : (
                    <>
                      <span>Create organization account</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </>
                  )}
                </button>
              </form>

              {/* Already registered & cross links */}
              <div style={{ textAlign: 'center', marginTop: '22px', fontSize: '13px', color: '#64748b' }}>
                <span>Already registered? </span>
                <Link to="/login/organization" className="auth-text-link">Organization sign in</Link>
                <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                <Link to="/register/business" className="auth-text-link" style={{ color: '#0284c7' }}>Register a business instead</Link>
              </div>

              {/* Shared Platform Info Banner (Matching Reference 05) */}
              <div className="auth-info-banner">
                <svg className="auth-info-banner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>
                  Business and organization accounts share TenderBridge sign-in and data platform; your organization role controls workspace access.
                </span>
              </div>

              {/* Security & Verification Badges */}
              <div className="auth-trust-badges">
                <div className="trust-badge-item">
                  <div className="trust-badge-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div className="trust-badge-text">
                    <strong>Secure by design</strong>
                    <p>Your data is encrypted and protected with industry-standard security.</p>
                  </div>
                </div>

                <div className="trust-badge-item">
                  <div className="trust-badge-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                  <div className="trust-badge-text">
                    <strong>Email verification</strong>
                    <p>We'll send a verification link to your email after you create your account.</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Step 2: Email Verification State */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#ccfbf1', color: '#0f766e', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>

              <h2 className="auth-form-title">Verify your organization email</h2>
              <p className="auth-form-subtitle" style={{ maxWidth: 380, margin: '0 auto 20px' }}>
                We've sent a confirmation link to <strong style={{ color: '#0f172a' }}>{email}</strong>. Open the email and click the confirmation link to activate your organization workspace.
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 340, margin: '0 auto' }}>
                <Link to="/login/organization" className="btn-auth-submit" style={{ textDecoration: 'none' }}>
                  Continue to Organization sign in →
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
