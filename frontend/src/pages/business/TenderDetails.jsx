import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AISummaryCard from '../../components/tender/AISummaryCard.jsx';
import EligibilityBreakdown from '../../components/tender/EligibilityBreakdown.jsx';
import RequiredDocChecklist from '../../components/tender/RequiredDocChecklist.jsx';
import DeadlineCountdown from '../../components/dashboard/DeadlineCountdown.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import {
  EmptyState, ErrorState, Field, LoadingState, Notice, PageHeader, Panel,
} from '../../components/common/ProcurementUI.jsx';
import { explainError } from '../../services/api.js';
import { aiService } from '../../services/aiService.js';
import { tenderService } from '../../services/tenderService.js';
import { applicationsService, savedOpportunitiesService, organizationProcurementService } from '../../services/procurementService.js';
import { formatDate, humanize } from '../../utils/formatters.js';

function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatVersionValue(value) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

export default function TenderDetails() {
  const { id } = useParams();

  // ── Tender record state ────────────────────────────────────────────────────
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Active tab: 'requirements' | 'faqs' | 'updates' ────────────────────────
  const [activeTab, setActiveTab] = useState('requirements');

  // ── AI / deterministic extraction state ────────────────────────────────────
  const [tenderText, setTenderText] = useState('');
  const [tenderFile, setTenderFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [extractError, setExtractError] = useState(null);
  const [showExtractor, setShowExtractor] = useState(false);

  // ── Eligibility evaluation state ───────────────────────────────────────────
  const [evaluation, setEvaluation] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState(null);

  // ── Actions & UI state ─────────────────────────────────────────────────────
  const [saved, setSaved] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState(null);
  const [openingPdf, setOpeningPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [existingApp, setExistingApp] = useState(null);
  const [faqItems, setFaqItems] = useState([]);
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqError, setFaqError] = useState(null);
  const [faqBusy, setFaqBusy] = useState(false);
  const [faqSuccess, setFaqSuccess] = useState('');
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(null);
  const [activityRetry, setActivityRetry] = useState(0);

  async function loadTender() {
    setLoading(true);
    setError(null);
    try {
      const data = await tenderService.getById(id);
      setTender(data?.item ?? null);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTender();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check saved & application status
  useEffect(() => {
    if (!tender?.id) return undefined;
    let active = true;
    Promise.all([
      savedOpportunitiesService.list().catch(() => ({ items: [] })),
      applicationsService.list().catch(() => ({ items: [] })),
    ]).then(([savedData, appData]) => {
      if (!active) return;
      const reference = tender.referenceNumber;
      const isSaved = (savedData?.items || []).some(row => row.tenderId === tender.id || row.tender?.referenceNumber === reference);
      setSaved(isSaved);
      if (isSaved) savedOpportunitiesService.acknowledge(tender.id).catch(() => {});
      const matched = (appData?.items || []).find(row => row.tenderId === tender.id || row.tender?.referenceNumber === reference);
      setExistingApp(matched || null);
    }).catch(() => {});
    return () => { active = false; };
  }, [tender?.id, tender?.referenceNumber]);

  useEffect(() => {
    if (!tender?.id) return undefined;
    let active = true;
    const tenderKey = tender.referenceNumber || tender.id;
    setFaqLoading(true); setVersionsLoading(true); setFaqError(null); setVersionsError(null);
    setFaqItems([]); setVersions([]);
    Promise.allSettled([
      tenderService.getFaqs(tenderKey),
      tenderService.getVersions(tenderKey),
    ]).then(([faqOutcome, versionOutcome]) => {
      if (!active) return;
      if (faqOutcome.status === 'fulfilled') {
        setFaqItems(Array.isArray(faqOutcome.value?.items) ? faqOutcome.value.items : []);
      } else {
        setFaqError(faqOutcome.reason);
      }
      if (versionOutcome.status === 'fulfilled') {
        setVersions(Array.isArray(versionOutcome.value?.items)
          ? versionOutcome.value.items.filter(version => version && typeof version === 'object')
          : []);
      } else {
        setVersionsError(versionOutcome.reason);
      }
    }).finally(() => {
      if (active) { setFaqLoading(false); setVersionsLoading(false); }
    });
    return () => { active = false; };
  }, [tender?.id, tender?.referenceNumber, activityRetry]);

  async function submitTenderQuestion(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const question = String(new FormData(form).get('question') || '').trim();
    if (!question || faqBusy) return;
    setFaqBusy(true); setFaqError(null); setFaqSuccess('');
    try {
      await tenderService.askFaq(tender.referenceNumber || tender.id, question);
      form.reset(); setFaqSuccess('Question sent to the procuring organization for review.');
      const data = await tenderService.getFaqs(tender.referenceNumber || tender.id);
      setFaqItems(Array.isArray(data?.items) ? data.items : []);
    } catch (requestError) { setFaqError(requestError); }
    finally { setFaqBusy(false); }
  }

  // Derived criteria & documents
  const storedCriteria = safeJson(tender?.eligibilityCriteria, null);
  const criteria = extraction?.eligibilityCriteria ?? storedCriteria ?? null;
  const summary = extraction?.summary ?? tender?.description ?? storedCriteria?.summary ?? null;
  const documents = extraction?.requiredDocuments
    ?? (Array.isArray(tender?.requiredDocuments) && tender.requiredDocuments.length > 0 ? tender.requiredDocuments : null)
    ?? safeJson(tender?.requiredDocuments, [])
    ?? [
      'Company Registration / Certificate of Incorporation',
      'GST / Tax Compliance Clearance Certificate',
      'Audited Annual Turnover Statement (Past 3 Years)',
      'Relevant Previous Experience Work Orders / Completion Certificates',
    ];

  // Auto-evaluate eligibility when criteria is present
  useEffect(() => {
    if (!criteria || evaluation || evaluating) return;
    async function autoEval() {
      setEvaluating(true);
      try {
        const data = await tenderService.evaluateEligibility(criteria);
        setEvaluation(data?.item ?? data);
      } catch {
        // Silently allow manual evaluate on error
      } finally {
        setEvaluating(false);
      }
    }
    autoEval();
  }, [criteria]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExtract(event) {
    event.preventDefault();
    setExtracting(true);
    setExtractError(null);
    try {
      const data = tenderFile
        ? await aiService.extractTenderFile(tenderFile)
        : await aiService.extractTender(tenderText);
      setExtraction(data?.item ?? data);
      setEvaluation(null);
    } catch (requestError) {
      setExtractError(requestError);
    } finally {
      setExtracting(false);
    }
  }

  async function handleEvaluate() {
    setEvaluating(true);
    setEvaluationError(null);
    try {
      const data = await tenderService.evaluateEligibility(criteria ?? {});
      setEvaluation(data?.item ?? data);
    } catch (requestError) {
      setEvaluationError(requestError);
    } finally {
      setEvaluating(false);
    }
  }

  async function handleSave() {
    if (!tender || actionBusy) return;
    setActionBusy('save');
    setActionError(null);
    setActionMessage('');
    try {
      if (saved) await savedOpportunitiesService.toggle(tender.referenceNumber || tender.id);
      else await savedOpportunitiesService.save(tender.referenceNumber || tender.id);
      setSaved(prev => !prev);
      setActionMessage(saved ? 'Removed from Saved Opportunities.' : 'Saved to your bookmarked opportunities.');
    } catch (requestError) {
      setActionError(requestError);
    } finally {
      setActionBusy('');
    }
  }

  async function openTenderPdf() {
    setOpeningPdf(true);
    setPdfError(null);
    try {
      const blob = await organizationProcurementService.openTenderPdf(tender.referenceNumber || tender.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) {
      setPdfError(requestError);
    } finally {
      setOpeningPdf(false);
    }
  }

  if (loading) return <LoadingState label="Loading tender details..." />;
  if (error)   return <ErrorState error={error} onRetry={loadTender} />;
  if (!tender) {
    return (
      <EmptyState title="Tender not found">
        This procurement opportunity is not available in the catalogue.
        <div style={{ marginTop: '16px' }}>
          <Link className="button button-secondary" to="/business/tenders">Back to tenders</Link>
        </div>
      </EmptyState>
    );
  }

  const org = tender.organization;
  const isVerified = Boolean(org?.verified);
  const locationDisplay = tender.location || org?.location || 'Pan-India / Regional';

  return (
    <>
      {/* Breadcrumb matching visual reference */}
      <nav style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
        <Link to="/business/tenders" style={{ color: '#0284c7', textDecoration: 'none' }}>
          Discover tenders
        </Link>
        {' '}&rsaquo;{' '}
        <span style={{ color: '#334155', fontWeight: 500 }}>Tender details</span>
      </nav>

      {/* Main Title */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: '0 0 16px', lineHeight: 1.25 }}>
        {tender.title || 'Tender Opportunity'}
      </h1>

      {/* Subheader bar with Organization Trust & Metadata */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '14px 20px',
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              color: '#334155',
              flexShrink: 0,
            }}
          >
            🏛️
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 16, color: '#0f172a' }}>
                {tender.issuingAuthority || org?.name || 'Private Procuring Authority'}
              </strong>
              {isVerified ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#15803d',
                    background: '#dcfce7',
                    border: '1px solid #bbf7d0',
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}
                  title="Verified by platform administrator"
                >
                  ✓ Verified Org
                </span>
              ) : (
                <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>
                  Unverified
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {org?.type || 'Private Organization'} &nbsp;|&nbsp; {locationDisplay}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
          {tender.referenceNumber && (
            <div>
              <span style={{ display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tender reference
              </span>
              <strong style={{ fontSize: 13, fontFamily: 'monospace', color: '#1e293b' }}>
                {tender.referenceNumber}
              </strong>
            </div>
          )}

          <div>
            <span style={{ display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Category
            </span>
            <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>
              {tender.category || 'Procurement'}
            </span>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Status
            </span>
            <StatusBadge status={tender.status || 'Active'} />
          </div>

          <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 16 }}>
            <span style={{ display: 'block', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Closing date
            </span>
            <strong style={{ fontSize: 13, color: '#0f172a' }}>
              {formatDate(tender.submissionDeadline)}
            </strong>
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⏱</span>
              <DeadlineCountdown deadline={tender.submissionDeadline} />
            </div>
          </div>
        </div>
      </div>

      {actionError && <Notice kind="error">{actionError.message || 'Action failed.'}</Notice>}
      {actionMessage && <Notice kind="success">{actionMessage}</Notice>}

      {/* Main 2-Column Grid (Visual Reference 07 Layout) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Overview, Metrics, Files, Tabs */}
        <div>
          {/* Overview Panel */}
          <section className="panel" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, color: '#0f172a', margin: '0 0 12px' }}>Overview</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#334155', margin: '0 0 20px' }}>
              {summary || 'Comprehensive procurement specifications published by the issuing authority. Detailed parameters are outlined in the tender documents.'}
            </p>

            {/* 3 Metric Cards Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  💰 Estimated value
                </span>
                <strong style={{ display: 'block', fontSize: 16, color: '#0f172a', marginTop: 4 }}>
                  {formatCurrency(tender.estimatedValue)}
                </strong>
                <small style={{ color: '#94a3b8', fontSize: 11 }}>indicative only</small>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📅 Project duration
                </span>
                <strong style={{ display: 'block', fontSize: 16, color: '#0f172a', marginTop: 4 }}>
                  {tender.deliveryDuration || 'Not specified in notice'}
                </strong>
                <small style={{ color: '#94a3b8', fontSize: 11 }}>delivery / completion period</small>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📍 Delivery location
                </span>
                <strong style={{ display: 'block', fontSize: 16, color: '#0f172a', marginTop: 4 }}>
                  {locationDisplay}
                </strong>
                <small style={{ color: '#94a3b8', fontSize: 11 }}>procurement scope</small>
              </div>

              {tender.quantity && <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}><span style={{ fontSize: 12, color: '#64748b' }}>📦 Quantity</span><strong style={{ display: 'block', fontSize: 16, color: '#0f172a', marginTop: 4 }}>{tender.quantity}</strong><small style={{ color: '#94a3b8', fontSize: 11 }}>as stated in the notice</small></div>}
              {tender.openingDate && <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}><span style={{ fontSize: 12, color: '#64748b' }}>🗓 Bid opening date</span><strong style={{ display: 'block', fontSize: 16, color: '#0f172a', marginTop: 4 }}>{formatDate(tender.openingDate)}</strong><small style={{ color: '#94a3b8', fontSize: 11 }}>verify against official notice</small></div>}
            </div>
          </section>

          {/* Tender Files & Submission Documents Panel */}
          <section className="panel" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 18, color: '#0f172a', margin: 0 }}>Tender Files & Required Submissions</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Official documents provided by the authority and documents you must prepare.
                </p>
              </div>
              <Link to="/business/vault" className="button button-secondary" style={{ fontSize: 12 }}>
                Open Document Vault →
              </Link>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {/* Official RFP File */}
              {tender.pdfAvailable && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 6, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>
                      PDF
                    </div>
                    <div>
                      <strong style={{ fontSize: 14, color: '#0f172a' }}>Official Tender Specifications & RFP Notice</strong>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Authoritative RFP documentation published by the organization</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button button-primary"
                    style={{ fontSize: 12, padding: '6px 14px' }}
                    onClick={openTenderPdf}
                    disabled={openingPdf}
                  >
                    {openingPdf ? 'Downloading...' : 'Download PDF'}
                  </button>
                </div>
              )}

              {/* Required Documents List */}
              {documents.map((doc, idx) => {
                const name = typeof doc === 'string' ? doc : doc.name;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 16px',
                      border: '1px solid #f1f5f9',
                      borderRadius: 8,
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f0f9ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                        📄
                      </div>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{name}</span>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Mandatory submission requirement</div>
                      </div>
                    </div>
                    <Link
                      to="/business/vault"
                      style={{ fontSize: 12, color: '#0284c7', textDecoration: 'none', fontWeight: 500 }}
                    >
                      Attach from Vault &rarr;
                    </Link>
                  </div>
                );
              })}
            </div>
            {pdfError && <Notice kind="error">{pdfError.message || 'Could not download tender PDF.'}</Notice>}
          </section>

          {/* Tabbed Navigation (Requirements, FAQs, Updates) */}
          <section className="panel" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', gap: 24, marginBottom: 18 }}>
              <button
                type="button"
                onClick={() => setActiveTab('requirements')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '10px 4px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: activeTab === 'requirements' ? '#0284c7' : '#64748b',
                  borderBottom: activeTab === 'requirements' ? '3px solid #0284c7' : '3px solid transparent',
                  marginBottom: -2,
                }}
              >
                Requirements & Criteria
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('faqs')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '10px 4px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: activeTab === 'faqs' ? '#0284c7' : '#64748b',
                  borderBottom: activeTab === 'faqs' ? '3px solid #0284c7' : '3px solid transparent',
                  marginBottom: -2,
                }}
              >
                FAQs & Clarifications
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('updates')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '10px 4px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: activeTab === 'updates' ? '#0284c7' : '#64748b',
                  borderBottom: activeTab === 'updates' ? '3px solid #0284c7' : '3px solid transparent',
                  marginBottom: -2,
                }}
              >
                Updates & Corrigenda
              </button>
            </div>

            {/* Tab 1: Requirements Content */}
            {activeTab === 'requirements' && (
              <div>
                <h3 style={{ fontSize: 15, color: '#0f172a', margin: '0 0 12px' }}>
                  Mandatory Minimum Thresholds
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>MINIMUM TURNOVER</span>
                    <strong style={{ display: 'block', fontSize: 14, color: '#1e293b', marginTop: 4 }}>
                      {criteria?.minTurnover ? `₹${criteria.minTurnover} Lakhs` : 'Not specified in notice'}
                    </strong>
                  </div>
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>MINIMUM EXPERIENCE</span>
                    <strong style={{ display: 'block', fontSize: 14, color: '#1e293b', marginTop: 4 }}>
                      {criteria?.minExperienceYears ? `${criteria.minExperienceYears} Years` : 'Not specified in notice'}
                    </strong>
                  </div>
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>REQUIRED CERTIFICATIONS</span>
                    <strong style={{ display: 'block', fontSize: 14, color: '#1e293b', marginTop: 4 }}>
                      {criteria?.requiredCertifications?.length > 0 ? criteria.requiredCertifications.join(', ') : 'Standard compliance only'}
                    </strong>
                  </div>
                </div>

                <RequiredDocChecklist documents={documents} />
              </div>
            )}

            {/* Tab 2: FAQs & Clarifications Content */}
            {activeTab === 'faqs' && (
              <div className="tender-faq-public">
                <div style={{ background: '#f0f9ff', padding: '12px 16px', borderRadius: 8, border: '1px solid #bae6fd', marginBottom: 16 }}>
                  <strong style={{ color: '#0369a1', fontSize: 13 }}>Tender questions and answers</strong>
                  <p style={{ margin: '4px 0 0', color: '#0c4a6e', fontSize: 12, lineHeight: 1.4 }}>
                    Questions are reviewed by the procuring organization. Published answers are visible to all businesses viewing this tender. Application-specific clarifications remain in your Application Tracker.
                  </p>
                </div>
                {faqSuccess && <Notice kind="success">{faqSuccess}</Notice>}
                {faqError && <ErrorState error={faqError} />}
                {faqLoading ? <LoadingState label="Loading tender questions…" /> : faqItems.length ? <div className="tender-faq-list">{faqItems.map(faq => <article key={faq.id} className="clarification-card">
                  <div className="panel-header"><div><h3>{faq.question}</h3><p>Asked {formatDate(faq.createdAt)}</p></div><StatusBadge status={faq.status} /></div>
                  {faq.status === 'PUBLISHED' ? <p>{faq.answer}</p> : <p className="supporting-copy">{faq.status === 'REJECTED' ? 'The organization reviewed and declined this question.' : 'Your question is awaiting the organization’s review.'}</p>}
                </article>)}</div> : <EmptyState title="No published answers yet">Ask the procuring organization a question, or check again later for new answers.</EmptyState>}
                <form className="form-stack" onSubmit={submitTenderQuestion}>
                  <h3>Ask the procuring organization</h3>
                  <Field label="Your question"><textarea name="question" required maxLength={3000} rows={3} placeholder="Ask about a tender requirement or condition…" /></Field>
                  <button type="submit" className="button button-primary" disabled={faqBusy}>{faqBusy ? 'Sending…' : 'Submit question'}</button>
                </form>
              </div>
            )}

            {/* Tab 3: Updates & Corrigenda Content */}
            {activeTab === 'updates' && (
              <div>
                <div className="panel-header">
                  <div>
                    <h3>Updates &amp; Corrigenda</h3>
                    <p>Review recorded changes to this tender. Check the official notice for authoritative requirements.</p>
                  </div>
                  <button type="button" className="button button-secondary" onClick={() => setActivityRetry(value => value + 1)} disabled={versionsLoading}>
                    {versionsLoading ? 'Refreshing…' : 'Refresh history'}
                  </button>
                </div>
                {versionsError && <><ErrorState error={versionsError} /><button type="button" className="button button-secondary" onClick={() => setActivityRetry(value => value + 1)} disabled={versionsLoading}>Retry update history</button></>}
                {versionsLoading ? <LoadingState label="Loading tender history…" /> : versions.length ? <div className="tender-version-list">{versions.map(version => {
                  const previous = versions.find(item => item.versionNumber === version.versionNumber - 1);
                  const changedFields = Array.isArray(version.changedFields) ? version.changedFields : [];
                  return <article className="clarification-card" key={version.id}>
                    <div className="panel-header"><div><h3>Version {version.versionNumber}</h3><p>{formatDate(version.createdAt)} · {humanize(version.source || 'UPDATE')}</p></div>{version.versionNumber === tender.latestVersionNumber && <StatusBadge status="LATEST" />}</div>
                    {changedFields.length ? <div className="tender-version-changes">{changedFields.map(field => <div key={field}><strong>{humanize(field)}</strong><div className="form-grid"><p><small>Previous</small><br />{formatVersionValue(previous?.snapshot?.[field])}</p><p><small>Updated</small><br />{formatVersionValue(version.snapshot?.[field])}</p></div></div>)}</div> : <p className="supporting-copy">Initial recorded tender version.</p>}
                  </article>;
                })}</div> : <EmptyState title="No tender update history yet">When the organization changes published tender details, version comparisons will appear here.</EmptyState>}
                <Notice kind="info">
                  <strong>Official Tender Documents Govern:</strong> All timelines, requirements, specifications, and submission criteria on TenderBridge are advisory. Always verify requirements against the official tender notice PDF and issuing portal.
                </Notice>
              </div>
            )}
          </section>

          {/* Collapsible Notice Text / AI Extractor for advanced analysis */}
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              className="button button-secondary"
              style={{ width: '100%', fontSize: 13 }}
              onClick={() => setShowExtractor(prev => !prev)}
            >
              {showExtractor ? '▲ Hide Notice Text & Extraction Tools' : '▼ Paste Notice Text / Extract Custom Tender Criteria'}
            </button>

            {showExtractor && (
              <div style={{ marginTop: 14 }}>
                <Panel
                  title="Extract tender information"
                  description="Analyze official notice text or a PDF. Extracted values are advisory and are not saved to the catalogue from this business view."
                >
                  <form className="form-stack" onSubmit={handleExtract}>
                    <Field label="Tender text" hint="Paste notice text or choose a text-based PDF.">
                      <textarea
                        rows={6}
                        value={tenderText}
                        onChange={event => setTenderText(event.target.value)}
                        placeholder="Paste official tender text here..."
                      />
                    </Field>
                    <Field label="Or upload tender PDF">
                      <input type="file" accept="application/pdf,.pdf" onChange={event => setTenderFile(event.target.files?.[0] || null)} />
                    </Field>
                    <div className="button-row">
                      <button className="button button-primary" type="submit" disabled={extracting}>
                        {extracting ? 'Analyzing…' : 'Analyze notice'}
                      </button>
                      {extraction && (
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => { setExtraction(null); setEvaluation(null); }}
                        >
                          Clear extraction
                        </button>
                      )}
                    </div>
                  </form>
                  {extractError && <Notice kind="error">{explainError(extractError)}</Notice>}
                  {extraction && <div className="extraction-result"><Notice kind="warning">{extraction.source === 'GEMINI_AI' ? 'Gemini AI' : 'Deterministic parser'} · overall evidence confidence {Math.round((extraction.overallConfidence || 0) * 100)}%. Review all fields against the official document.</Notice>{extraction.documentProcessing && <p>PDF processing: {extraction.documentProcessing.method} · {extraction.documentProcessing.ocrStatus} · {extraction.documentProcessing.pagesProcessed} page(s). {extraction.documentProcessing.message || ''}</p>}<div className="extraction-evidence-list">{Object.entries(extraction.fieldConfidence || {}).filter(([, score]) => score > 0).map(([field, score]) => <div key={field}><strong>{field.replace(/([A-Z])/g, ' $1')}</strong><span>{Math.round(score * 100)}%</span><p>“{extraction.fieldEvidence?.[field] || 'No supporting quotation could be verified.'}”{extraction.fieldEvidencePages?.[field] ? ` · Page ${extraction.fieldEvidencePages[field]}` : ''}</p></div>)}</div>{extraction.missingInformation?.length > 0 && <p><strong>Missing or unverified:</strong> {extraction.missingInformation.join('; ')}</p>}</div>}
                </Panel>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Eligibility Guidance Card & Actions (Reference 07) */}
        <div style={{ position: 'sticky', top: 20 }}>
          {/* Eligibility Guidance Card */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
              marginBottom: 16,
            }}
          >
            {/* Header Status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 8,
                background:
                  evaluation?.status === 'Eligible'
                    ? '#dcfce7'
                    : evaluation?.status === 'Not Eligible'
                    ? '#fee2e2'
                    : '#fef3c7',
                border: `1px solid ${
                  evaluation?.status === 'Eligible'
                    ? '#bbf7d0'
                    : evaluation?.status === 'Not Eligible'
                    ? '#fecaca'
                    : '#fde68a'
                }`,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 18 }}>
                {evaluation?.status === 'Eligible' ? '✓' : evaluation?.status === 'Not Eligible' ? '✕' : 'ℹ'}
              </div>
              <div>
                <strong
                  style={{
                    fontSize: 13,
                    color:
                      evaluation?.status === 'Eligible'
                        ? '#15803d'
                        : evaluation?.status === 'Not Eligible'
                        ? '#b91c1c'
                        : '#b45309',
                  }}
                >
                  {evaluation
                    ? `Eligibility guidance — ${evaluation.status.toLowerCase()}`
                    : 'Eligibility guidance — ready'}
                </strong>
                <div style={{ fontSize: 11, color: '#475569' }}>
                  Based on your business profile parameters.
                </div>
              </div>
            </div>

            {/* Criteria Breakdown */}
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {evaluation?.criteria ? (
                evaluation.criteria.map((c, idx) => {
                  const isPass = c.status === 'PASS';
                  const isFail = c.status === 'FAIL';
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: isPass ? '#dcfce7' : isFail ? '#fee2e2' : '#fef3c7',
                            color: isPass ? '#15803d' : isFail ? '#b91c1c' : '#b45309',
                          }}
                        >
                          {isPass ? 'Meets' : isFail ? 'Below threshold' : 'Review needed'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35 }}>
                        {c.explanation}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 8px', color: '#64748b', fontSize: 12 }}>
                  {evaluating ? 'Analyzing your qualifications...' : 'Click below to screen your profile.'}
                </div>
              )}
            </div>

            {/* Advisory disclaimer callout */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 11,
                color: '#64748b',
                lineHeight: 1.4,
                marginBottom: 16,
                padding: '8px 10px',
                background: '#f8fafc',
                borderRadius: 6,
              }}
            >
              <span>ℹ</span>
              <span>
                <strong>Advisory only:</strong> Confirm all conditions in the official tender documents. Eligibility guidance is non-binding and does not guarantee acceptance.
              </span>
            </div>

            {/* Action Buttons matching Reference 07 */}
            <div style={{ display: 'grid', gap: 8 }}>
              <Link
                to={`/business/apply/${encodeURIComponent(tender.referenceNumber || tender.id)}`}
                className="button button-primary"
                style={{ width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}
              >
                {existingApp
                  ? (existingApp.status === 'SUBMITTED' ? 'View / Edit Application ✓' : 'Continue Application →')
                  : 'Start application →'}
              </Link>

              <button
                type="button"
                className="button button-secondary"
                style={{ width: '100%', padding: '8px 16px', fontSize: 13 }}
                onClick={handleSave}
                disabled={Boolean(actionBusy)}
              >
                {actionBusy === 'save' ? 'Saving...' : saved ? 'Saved in opportunities ✓' : '🔖 Save tender'}
              </button>

              <button
                type="button"
                className="button button-secondary"
                style={{ width: '100%', fontSize: 12 }}
                onClick={handleEvaluate}
                disabled={evaluating}
              >
                {evaluating ? 'Evaluating...' : '↻ Re-check Eligibility'}
              </button>

              {tender.officialLink && (
                <a
                  className="button button-secondary"
                  style={{ width: '100%', textAlign: 'center', fontSize: 12 }}
                  href={tender.officialLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open official portal ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      </>
  );
}
