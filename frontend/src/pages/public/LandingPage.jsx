import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { dashboardForRole } from '../../utils/roles.js';
import TenderBridgeLogo from '../../components/common/TenderBridgeLogo.jsx';

export default function LandingPage() {
  const { session, role } = useAuth();
  const navigate = useNavigate();
  const [selectedSector, setSelectedSector] = useState('All sectors');
  const [searchQuery, setSearchQuery] = useState('');

  const sampleTenders = [
    {
      id: '1',
      title: 'Facilities Management Services',
      authority: 'Riverside Health Group',
      location: 'UK (Multiple locations)',
      category: 'Services',
      deadline: '12 Mar 2025',
      badge: 'Invitation only',
      badgeClass: 'badge-invitation',
      icon: '🏢',
      iconBg: '#eff6ff',
    },
    {
      id: '2',
      title: 'IT Infrastructure Renewal',
      authority: 'Northvale Education Trust',
      location: 'England',
      category: 'Technology',
      deadline: '28 Mar 2025',
      badge: 'Open',
      badgeClass: 'badge-open',
      icon: '💻',
      iconBg: '#f0fdf4',
    },
    {
      id: '3',
      title: 'Sustainable Building Solutions',
      authority: 'Central Estates Partnership',
      location: 'UK (Multiple locations)',
      category: 'Facilities & Property',
      deadline: '10 Apr 2025',
      badge: 'Open',
      badgeClass: 'badge-open',
      icon: '🌱',
      iconBg: '#fefce8',
    },
  ];

  const filteredTenders = sampleTenders.filter(t => {
    const matchesSector = selectedSector === 'All sectors' || t.category === selectedSector;
    const matchesQuery = !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.authority.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSector && matchesQuery;
  });

  return (
    <div className="landing-page-root">
      {/* 1. Header / Top Navigation */}
      <header className="landing-nav" role="banner">
        <div className="landing-nav-container">
          <TenderBridgeLogo to="/" size="md" />

          <nav className="landing-nav-links" aria-label="Main Navigation">
            <Link to="/login/business" className="landing-nav-link">
              For Businesses
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </Link>
            <Link to="/login/organization" className="landing-nav-link">
              For Organizations
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </Link>
            <a href="#how-it-works" className="landing-nav-link">How It Works</a>
            <a href="#about" className="landing-nav-link">About</a>
          </nav>

          <div className="landing-nav-actions">
            {session ? (
              <button
                type="button"
                className="btn-nav-primary"
                onClick={() => navigate(dashboardForRole(role))}
              >
                Go to Workspace →
              </button>
            ) : (
              <>
                <Link to="/login/business" className="btn-nav-ghost">Sign in</Link>
                <Link to="/register/business" className="btn-nav-primary">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="landing-hero" aria-labelledby="hero-heading">
        <div className="landing-hero-container">
          {/* Left Hero Content */}
          <div className="hero-content">
            <span className="hero-eyebrow">PRIVATE TENDERS. REAL OPPORTUNITIES.</span>
            <h1 id="hero-heading" className="hero-title">
              Find the right opportunities.
              <span className="hero-title-accent">Build with confidence.</span>
            </h1>
            <p className="hero-subtitle">
              TenderBridge connects businesses with private tenders from organizations, with guided eligibility, clear requirements and direct applications — all in one place.
            </p>
            <div className="hero-cta-group">
              <Link
                to={session ? (role === 'BUSINESS' ? '/business/tenders' : '/org/procurements') : '/login/business'}
                className="btn-hero-primary"
              >
                Explore tenders →
              </Link>
              <Link
                to={session ? (role === 'ORGANIZATION' ? '/org/procurements/new' : '/org/dashboard') : '/login/organization'}
                className="btn-hero-secondary"
              >
                Publish a tender
              </Link>
            </div>
          </div>

          {/* Right Hero Showcase Stack (Matching Reference 01) */}
          <div className="hero-visual-wrap">
            <div className="hero-preview-stack">
              {/* Main Showcase Card: Tenders Preview */}
              <div className="showcase-card">
                <div className="showcase-card-header">
                  <div className="showcase-card-title">
                    <span>Tenders</span>
                    <span className="showcase-count">423 tenders</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>
                    <span>Sort by ▾</span>
                  </div>
                </div>

                <div className="showcase-search-bar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search tenders by keyword, sector or location..."
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12px' }}
                  />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>
                </div>

                <div className="showcase-pills">
                  {['All sectors', 'Facilities & Property', 'Technology', 'Professional Services'].map(sector => (
                    <button
                      type="button"
                      key={sector}
                      className={`showcase-pill ${selectedSector === sector ? 'active' : ''}`}
                      onClick={() => setSelectedSector(sector)}
                    >
                      {sector}
                    </button>
                  ))}
                </div>

                <div className="showcase-list">
                  {filteredTenders.map(tender => (
                    <div key={tender.id} className="showcase-item">
                      <div className="showcase-item-icon" style={{ background: tender.iconBg }}>
                        <span>{tender.icon}</span>
                      </div>
                      <div className="showcase-item-info">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span className={`showcase-badge-pill ${tender.badgeClass}`}>{tender.badge}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Closes {tender.deadline}</span>
                        </div>
                        <strong>{tender.title}</strong>
                        <div className="showcase-item-meta">
                          <span>{tender.authority}</span>
                          <span>•</span>
                          <span>{tender.location}</span>
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating Row: Match Gauge & Progress Stepper */}
              <div className="hero-floating-row">
                {/* Gauge Card */}
                <div className="widget-card">
                  <div className="widget-header">
                    <span>Your eligibility match</span>
                    <span style={{ cursor: 'pointer', color: '#64748b' }}>ℹ</span>
                  </div>
                  <div className="widget-match-gauge">
                    <div className="match-circle">92%</div>
                    <div>
                      <span className="match-status-pill">Strong match</span>
                    </div>
                  </div>
                  <ul className="match-checklist">
                    <li className="checked">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#059669"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Sector match
                    </li>
                    <li className="checked">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#059669"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Location match
                    </li>
                    <li className="checked">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#059669"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Turnover range
                    </li>
                    <li className="checked">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#059669"><path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Relevant experience
                    </li>
                    <li>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #cbd5e1' }} />
                      Additional documentation
                    </li>
                  </ul>
                </div>

                {/* Stepper Card */}
                <div className="widget-card">
                  <div className="widget-header">
                    <span>Application progress</span>
                  </div>
                  <ul className="progress-step-list">
                    <li className="progress-step-item done">
                      <div className="step-marker done">✓</div>
                      <span>Eligibility confirmed</span>
                    </li>
                    <li className="progress-step-item active">
                      <div className="step-marker active">+</div>
                      <span>Prepare application</span>
                    </li>
                    <li className="progress-step-item">
                      <div className="step-marker pending">3</div>
                      <span>Submit application</span>
                    </li>
                    <li className="progress-step-item">
                      <div className="step-marker pending">4</div>
                      <span>Track updates</span>
                    </li>
                  </ul>
                  <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', fontSize: '11px', color: '#047857', fontWeight: 600 }}>
                    Stronger partnerships build brighter futures.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Stat Bar Strip */}
      <section className="landing-stats-strip" aria-label="Key Platform Metrics">
        <div className="stats-container">
          <div className="stat-strip-lead">
            Built for private<br />procurement
          </div>
          <div className="stat-item">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
            </div>
            <div>
              <div className="stat-metric">1,200+</div>
              <div className="stat-caption">Organizations publishing tenders</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div>
              <div className="stat-metric">8,500+</div>
              <div className="stat-caption">Businesses registered</div>
            </div>
          </div>

          <div className="stat-item">
            <div className="stat-icon-wrap">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m11 17 2 2a1 1 0 0 0 1.4 0l4.3-4.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0L13 12.4"/><path d="m3 11 2.6-2.6a1 1 0 0 1 1.4 0l4.3 4.3a1 1 0 0 1 0 1.4L9 16.4a1 1 0 0 1-1.4 0L3 11Z"/></svg>
            </div>
            <div>
              <div className="stat-metric">£3.2B+</div>
              <div className="stat-caption">Opportunities made accessible</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Three-Column Feature Section */}
      <section className="landing-features-section" aria-labelledby="features-heading">
        <div className="features-container">
          <div className="features-grid">
            {/* Feature 01 */}
            <div className="feature-col-card">
              <div className="feature-icon-badge" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <span className="feature-number">01</span>
              <h2 className="feature-heading">Discover opportunities</h2>
              <p className="feature-description">
                Browse private tenders from a wide range of organizations across multiple sectors and regions.
              </p>
              <Link to="/login/business" className="feature-action-link">
                Explore tenders <span>→</span>
              </Link>
            </div>

            {/* Feature 02 */}
            <div className="feature-col-card">
              <div className="feature-icon-badge" style={{ background: '#ecfdf5', color: '#059669' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <span className="feature-number">02</span>
              <h2 className="feature-heading">Understand requirements</h2>
              <p className="feature-description">
                Get clear eligibility guidance, key dates and documentation requirements before you apply.
              </p>
              <a href="#how-it-works" className="feature-action-link">
                See how it works <span>→</span>
              </a>
            </div>

            {/* Feature 03 */}
            <div className="feature-col-card">
              <div className="feature-icon-badge" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </div>
              <span className="feature-number">03</span>
              <h2 className="feature-heading">Apply and track</h2>
              <p className="feature-description">
                Submit your application directly through TenderBridge and track your progress in real time.
              </p>
              <Link to="/register/business" className="feature-action-link">
                Create an account <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 5. How It Works: Two Role Journeys */}
      <section id="how-it-works" className="landing-workflow-section" aria-labelledby="workflow-heading">
        <div className="workflow-header">
          <span className="workflow-eyebrow">A COMPLETE PROCUREMENT PLATFORM</span>
          <h2 id="workflow-heading" className="workflow-title">Designed for both sides of procurement</h2>
          <p className="workflow-subtitle">
            Whether you are responding to commercial tenders or publishing procurement notices, TenderBridge gives you purpose-built workspaces.
          </p>
        </div>

        <div className="workflow-columns">
          {/* For Businesses */}
          <div className="role-track-card role-track-business">
            <span className="role-track-badge">FOR BUSINESSES</span>
            <h3 className="role-track-title">Grow your contracts</h3>
            <p className="role-track-desc">
              Discover opportunities that fit your capabilities, verify requirements before investing time, and manage every proposal in one place.
            </p>
            <ul className="track-step-list">
              <li className="track-step-item">
                <span className="track-step-num">1</span>
                <div className="track-step-text">
                  <strong>Create your business profile</strong>
                  <p>Store your core certifications, turnover, and track record once.</p>
                </div>
              </li>
              <li className="track-step-item">
                <span className="track-step-num">2</span>
                <div className="track-step-text">
                  <strong>Advisory eligibility analysis</strong>
                  <p>Get a clear breakdown of requirements before you begin preparing a bid.</p>
                </div>
              </li>
              <li className="track-step-item">
                <span className="track-step-num">3</span>
                <div className="track-step-text">
                  <strong>Direct application submission & tracking</strong>
                  <p>Apply directly and follow progress through review, shortlisting, and award.</p>
                </div>
              </li>
            </ul>
            <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link to="/login/business" className="btn-hero-primary" style={{ padding: '10px 20px', fontSize: '13px' }}>
                Business Sign In →
              </Link>
              <Link to="/register/business" className="btn-hero-secondary" style={{ padding: '10px 18px', fontSize: '13px' }}>
                Register Business
              </Link>
            </div>
          </div>

          {/* For Organizations */}
          <div className="role-track-card role-track-org">
            <span className="role-track-badge">FOR ORGANIZATIONS</span>
            <h3 className="role-track-title">Streamline your sourcing</h3>
            <p className="role-track-desc">
              Publish structured procurement notices, collect standardized submissions, and communicate decisions with complete auditability.
            </p>
            <ul className="track-step-list">
              <li className="track-step-item">
                <span className="track-step-num">1</span>
                <div className="track-step-text">
                  <strong>Fast tender creation with PDF extraction</strong>
                  <p>Upload your tender document and automatically extract criteria and requirements.</p>
                </div>
              </li>
              <li className="track-step-item">
                <span className="track-step-num">2</span>
                <div className="track-step-text">
                  <strong>Centralized applicant review</strong>
                  <p>Evaluate submissions, manage notes, clarify points, and coordinate your review team.</p>
                </div>
              </li>
              <li className="track-step-item">
                <span className="track-step-num">3</span>
                <div className="track-step-text">
                  <strong>Transparent outcomes</strong>
                  <p>Publish decisions, update notices, and keep all participants clearly informed.</p>
                </div>
              </li>
            </ul>
            <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link to="/login/organization" className="btn-hero-primary" style={{ padding: '10px 20px', fontSize: '13px', background: '#0d9488' }}>
                Organization Sign In →
              </Link>
              <Link to="/register/organization" className="btn-hero-secondary" style={{ padding: '10px 18px', fontSize: '13px' }}>
                Register Organization
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Public Footer */}
      <footer id="about" className="landing-footer" role="contentinfo">
        <div className="landing-footer-container">
          <div className="landing-footer-grid">
            <div className="footer-brand-col">
              <TenderBridgeLogo theme="dark" size="lg" to="/" />
              <p>
                TenderBridge connects private contracting organizations with qualified businesses, bringing transparency, structured requirements, and trust to commercial procurement.
              </p>
            </div>

            <div>
              <h4 className="footer-heading">For Businesses</h4>
              <ul className="footer-nav-list">
                <li><Link to="/login/business">Business sign in</Link></li>
                <li><Link to="/register/business">Create business account</Link></li>
                <li><Link to="/login/business">Tender discovery</Link></li>
                <li><Link to="/login/business">Eligibility guidance</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="footer-heading">For Organizations</h4>
              <ul className="footer-nav-list">
                <li><Link to="/login/organization">Organization sign in</Link></li>
                <li><Link to="/register/organization">Register organization</Link></li>
                <li><Link to="/login/organization">Publish a tender</Link></li>
                <li><Link to="/login/organization">Applicant management</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="footer-heading">Platform</h4>
              <ul className="footer-nav-list">
                <li><a href="#how-it-works">How it works</a></li>
                <li><a href="#about">About TenderBridge</a></li>
                <li><Link to="/login/admin">Admin sign in</Link></li>
                <li><span style={{ color: '#64748b' }}>Verified Role Workspaces</span></li>
              </ul>
            </div>
          </div>

          <div className="landing-footer-bottom">
            <span>© 2026 TenderBridge. All rights reserved.</span>
            <span>Private procurement platform · Built for MSMEs and contracting organizations</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
