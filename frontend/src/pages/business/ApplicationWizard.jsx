import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Field, LoadingState, Notice, PageHeader, Panel } from '../../components/common/ProcurementUI.jsx';
import { tenderService } from '../../services/tenderService.js';
import { applicationsService, documentVaultService, profileService } from '../../services/procurementService.js';
import { explainError } from '../../services/api.js';
import { formatDate } from '../../utils/formatters.js';
import DeadlineCountdown from '../../components/dashboard/DeadlineCountdown.jsx';

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

const DEFAULT_REQUIRED_DOCS = [
  { name: 'Company Registration Certificate', category: 'REGISTRATION' },
  { name: 'Tax Compliance / GST Certificate', category: 'TAX' },
  { name: 'Audited Annual Turnover Statement (Past 3 Years)', category: 'FINANCIAL' },
  { name: 'Past Experience / Client Reference Letters', category: 'EXPERIENCE' },
];

export default function ApplicationWizard() {
  const { tenderId: routeTenderId } = useParams();
  const [searchParams] = useSearchParams();
  const tenderId = routeTenderId || searchParams.get('tenderId');
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Business details, 2: Documents, 3: Review & Submit
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  // Data states
  const [tender, setTender] = useState(null);
  const [existingApp, setExistingApp] = useState(null);
  const [vaultDocs, setVaultDocs] = useState([]);

  // Step 1: Business details state
  const [businessDetails, setBusinessDetails] = useState({
    businessName: '',
    registrationNo: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    location: '',
    annualTurnover: '',
    yearsOfExperience: '',
    proposalSummary: '',
  });

  // Step 2: Selected documents state (map of docName -> vaultDoc object)
  const [selectedDocs, setSelectedDocs] = useState({});

  // Quick vault upload modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [targetReqDoc, setTargetReqDoc] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDocName, setUploadDocName] = useState('');
  const [uploadError, setUploadError] = useState(null);

  // Step 3: Explicit confirmation state
  const [confirmed, setConfirmed] = useState(false);

  // Load tender, profile, documents, and existing application
  useEffect(() => {
    async function loadData() {
      if (!tenderId) {
        setError(new Error('Tender ID is missing. Please start an application from a valid tender.'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [tenderRes, profileRes, vaultRes, appsRes] = await Promise.all([
          tenderService.getById(tenderId),
          profileService.get().catch(() => ({ item: {} })),
          documentVaultService.list().catch(() => ({ items: [] })),
          applicationsService.list().catch(() => ({ items: [] })),
        ]);

        const tenderItem = tenderRes?.item;
        setTender(tenderItem);

        const profileItem = profileRes?.item || {};
        const vaultItems = vaultRes?.items || [];
        setVaultDocs(vaultItems);

        // Find existing application for this tender
        const appsList = appsRes?.items || [];
        const existing = appsList.find(a => a.tenderId === tenderItem?.id || a.tender?.referenceNumber === tenderItem?.referenceNumber);
        setExistingApp(existing || null);

        // If existing application has a snapshot, initialize from snapshot
        if (existing?.submittedSnapshot) {
          const snap = existing.submittedSnapshot;
          setBusinessDetails({
            businessName: snap.businessName || profileItem.businessName || '',
            registrationNo: snap.registrationNo || profileItem.registrationNo || '',
            contactPerson: snap.contactPerson || profileItem.contactPerson || '',
            contactEmail: snap.contactEmail || profileItem.contactEmail || '',
            contactPhone: snap.contactPhone || profileItem.contactPhone || '',
            location: snap.location || profileItem.location || '',
            annualTurnover: snap.annualTurnover !== undefined ? String(snap.annualTurnover) : (profileItem.annualTurnover ? String(profileItem.annualTurnover) : ''),
            yearsOfExperience: snap.yearsOfExperience !== undefined ? String(snap.yearsOfExperience) : (profileItem.yearsOfExperience ? String(profileItem.yearsOfExperience) : ''),
            proposalSummary: snap.proposalSummary || existing.notes || '',
          });
        } else {
          // Pre-populate from business profile
          setBusinessDetails({
            businessName: profileItem.businessName || '',
            registrationNo: profileItem.registrationNo || '',
            contactPerson: profileItem.contactPerson || '',
            contactEmail: profileItem.contactEmail || profileItem.publicContactEmail || '',
            contactPhone: profileItem.contactPhone || '',
            location: profileItem.location || '',
            annualTurnover: profileItem.annualTurnover !== null && profileItem.annualTurnover !== undefined ? String(profileItem.annualTurnover) : '',
            yearsOfExperience: profileItem.yearsOfExperience !== null && profileItem.yearsOfExperience !== undefined ? String(profileItem.yearsOfExperience) : '',
            proposalSummary: existing?.notes || '',
          });
        }

        // Initialize selected documents
        if (Array.isArray(existing?.submittedDocuments) && existing.submittedDocuments.length > 0) {
          const map = {};
          existing.submittedDocuments.forEach(doc => {
            map[doc.requirementName || doc.name] = doc;
          });
          setSelectedDocs(map);
        } else {
          // Auto-match vault documents with required documents
          const requiredList = Array.isArray(tenderItem?.requiredDocuments) && tenderItem.requiredDocuments.length > 0
            ? tenderItem.requiredDocuments.map(d => typeof d === 'string' ? { name: d } : d)
            : DEFAULT_REQUIRED_DOCS;

          const initialSelected = {};
          requiredList.forEach(req => {
            const reqLower = req.name.toLowerCase();
            const matched = vaultItems.find(v => {
              const vName = v.name.toLowerCase();
              const vCat = (v.category || '').toLowerCase();
              return vName.includes(reqLower) || reqLower.includes(vName) ||
                (reqLower.includes('tax') && vCat.includes('tax')) ||
                (reqLower.includes('registration') && vCat.includes('registration')) ||
                (reqLower.includes('turnover') && vCat.includes('financial')) ||
                (reqLower.includes('experience') && vCat.includes('experience'));
            });
            if (matched) {
              initialSelected[req.name] = {
                id: matched.id,
                name: matched.name,
                fileName: matched.fileName,
                fileSize: matched.fileSize,
                category: matched.category,
                uploadedAt: matched.createdAt,
                requirementName: req.name,
              };
            }
          });
          setSelectedDocs(initialSelected);
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [tenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived required documents list
  const requiredDocsList = useMemo(() => {
    if (Array.isArray(tender?.requiredDocuments) && tender.requiredDocuments.length > 0) {
      return tender.requiredDocuments.map(d => typeof d === 'string' ? { name: d } : d);
    }
    return DEFAULT_REQUIRED_DOCS;
  }, [tender]);

  // Document readiness calculation
  const readyDocsCount = useMemo(() => {
    return requiredDocsList.filter(req => Boolean(selectedDocs[req.name])).length;
  }, [requiredDocsList, selectedDocs]);

  const allRequiredDocsSelected = readyDocsCount === requiredDocsList.length;

  // Deadline check
  const deadlinePassed = useMemo(() => {
    if (!tender?.submissionDeadline) return false;
    return new Date() > new Date(tender.submissionDeadline);
  }, [tender]);

  function handleDetailChange(field, val) {
    setBusinessDetails(prev => ({ ...prev, [field]: val }));
  }

  function handleToggleDoc(reqName, vaultDoc) {
    setSelectedDocs(prev => {
      const copy = { ...prev };
      if (copy[reqName]) {
        delete copy[reqName];
      } else {
        copy[reqName] = {
          id: vaultDoc.id,
          name: vaultDoc.name,
          fileName: vaultDoc.fileName,
          fileSize: vaultDoc.fileSize,
          category: vaultDoc.category,
          uploadedAt: vaultDoc.createdAt,
          requirementName: reqName,
        };
      }
      return copy;
    });
  }

  function openUploadForRequirement(reqDoc) {
    setTargetReqDoc(reqDoc);
    setUploadDocName(reqDoc.name);
    setUploadFile(null);
    setUploadError(null);
    setUploadModalOpen(true);
  }

  async function handleQuickUpload(e) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploadingDoc(true);
    setUploadError(null);
    try {
      const res = await documentVaultService.upload(uploadFile, {
        name: uploadDocName.trim() || uploadFile.name,
        category: targetReqDoc?.category || 'PROPOSAL',
      });
      const newDoc = res.item;
      // Add to vault list
      setVaultDocs(prev => [newDoc, ...prev]);
      // Select for the target requirement
      if (targetReqDoc) {
        setSelectedDocs(prev => ({
          ...prev,
          [targetReqDoc.name]: {
            id: newDoc.id,
            name: newDoc.name,
            fileName: newDoc.fileName,
            fileSize: newDoc.fileSize,
            category: newDoc.category,
            uploadedAt: newDoc.createdAt,
            requirementName: targetReqDoc.name,
          },
        }));
      }
      setUploadModalOpen(false);
    } catch (err) {
      setUploadError(explainError(err));
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDownloadDoc(docId) {
    try {
      const blob = await documentVaultService.download(docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      alert(`Could not download file: ${explainError(err)}`);
    }
  }

  async function handleSaveDraft() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        id: existingApp?.id,
        tenderId: tender.referenceNumber || tender.id,
        status: 'INTERESTED',
        notes: businessDetails.proposalSummary || 'Application draft saved in workspace.',
        submittedSnapshot: {
          ...businessDetails,
          savedAt: new Date().toISOString(),
          tenderReference: tender.referenceNumber,
          tenderTitle: tender.title,
        },
        submittedDocuments: Object.values(selectedDocs),
      };
      const res = await applicationsService.createOrUpdate(payload);
      setExistingApp(res.item);
      alert('Application draft saved successfully. You can return to continue anytime.');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitFinal(e) {
    e.preventDefault();
    if (!confirmed) {
      alert('Please check the explicit confirmation checkbox before submitting.');
      return;
    }
    if (deadlinePassed) {
      alert('The submission deadline for this tender has passed.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const snapshot = {
        ...businessDetails,
        annualTurnover: businessDetails.annualTurnover ? Number(businessDetails.annualTurnover) : null,
        yearsOfExperience: businessDetails.yearsOfExperience ? Number(businessDetails.yearsOfExperience) : null,
        tenderReference: tender.referenceNumber,
        tenderTitle: tender.title,
        issuingAuthority: tender.issuingAuthority,
        submissionDeadline: tender.submissionDeadline,
        submittedAt: new Date().toISOString(),
      };

      const payload = {
        id: existingApp?.id,
        tenderId: tender.referenceNumber || tender.id,
        status: 'SUBMITTED',
        notes: businessDetails.proposalSummary || 'Official submission via TenderBridge.',
        submissionDate: new Date().toISOString(),
        submittedSnapshot: snapshot,
        submittedDocuments: Object.values(selectedDocs),
      };

      const res = await applicationsService.createOrUpdate(payload);
      setSuccessResult(res.item);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading application workspace..." />;
  if (error && !tender) return <ErrorState error={error} onRetry={() => navigate('/business/tenders')} />;

  // ── Success Confirmation Screen ──────────────────────────────────────────────
  if (successResult) {
    return (
      <section className="panel" style={{ maxWidth: 680, margin: '40px auto', padding: '36px 30px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>
          ✓
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          Application Submitted Successfully!
        </h1>
        <p style={{ fontSize: 14, color: '#475569', margin: '0 0 24px', lineHeight: 1.5 }}>
          Your bid proposal and verified document credentials have been recorded. A dated snapshot of your credentials has been locked for this tender.
        </p>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '18px 24px', textAlign: 'left', marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11, textTransform: 'uppercase' }}>Reference Number</span>
              <strong style={{ fontSize: 15, fontFamily: 'monospace', color: '#0f172a' }}>
                {successResult.referenceNo || 'APP-2026-SUBMITTED'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11, textTransform: 'uppercase' }}>Submission Timestamp</span>
              <strong style={{ color: '#0f172a' }}>
                {formatDate(successResult.submissionDate || new Date())}
              </strong>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11, textTransform: 'uppercase' }}>Tender</span>
              <span style={{ color: '#0f172a', fontWeight: 500 }}>{tender?.title}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: 11, textTransform: 'uppercase' }}>Current Status</span>
              <span style={{ display: 'inline-block', background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
                SUBMITTED
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          <Link to="/business/applications" className="button button-primary" style={{ padding: '10px 20px' }}>
            Go to Application Tracker &rarr;
          </Link>
          <Link to="/business/tenders" className="button button-secondary">
            Discover more tenders
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Top Navigation & Header */}
      <div style={{ marginBottom: 16 }}>
        <Link to="/business/applications" style={{ fontSize: 13, color: '#0284c7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          &larr; Back to applications
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', margin: '8px 0 4px', lineHeight: 1.25 }}>
          Apply to {tender?.title || 'Tender Opportunity'}
        </h1>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          Ref: <strong style={{ color: '#334155' }}>{tender?.referenceNumber || 'N/A'}</strong> &nbsp;|&nbsp;
          Procuring entity: <strong style={{ color: '#334155' }}>{tender?.issuingAuthority || 'Private Procuring Authority'}</strong> &nbsp;|&nbsp;
          <span style={{ color: '#16a34a', fontWeight: 600 }}>Open tender</span>
        </div>
      </div>

      {deadlinePassed && (
        <Notice kind="error">
          <strong>The deadline for this tender has passed.</strong> Submissions are closed, but you can review your saved draft or past records.
        </Notice>
      )}

      {error && <Notice kind="error">{explainError(error)}</Notice>}

      {/* Stepping bar matching 08_Application_Wizard.png */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0 28px', gap: 20 }}>
        {/* Step 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setStep(1)}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: step >= 1 ? (step > 1 ? '#16a34a' : '#0284c7') : '#cbd5e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
            {step > 1 ? '✓' : '1'}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: step === 1 ? '#0284c7' : '#1e293b' }}>1. Business details</div>
            <div style={{ fontSize: 11, color: step > 1 ? '#16a34a' : '#64748b' }}>{step > 1 ? 'Complete' : 'In progress'}</div>
          </div>
        </div>

        <div style={{ width: 40, height: 2, background: step > 1 ? '#16a34a' : '#cbd5e1' }} />

        {/* Step 2 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setStep(2)}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: step >= 2 ? (step > 2 ? '#16a34a' : '#0284c7') : '#cbd5e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
            {step > 2 ? '✓' : '2'}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: step === 2 ? '#0284c7' : '#1e293b' }}>2. Documents</div>
            <div style={{ fontSize: 11, color: step > 2 ? '#16a34a' : step === 2 ? '#0284c7' : '#64748b' }}>
              {step > 2 ? 'Complete' : step === 2 ? 'In progress' : 'Pending'}
            </div>
          </div>
        </div>

        <div style={{ width: 40, height: 2, background: step > 2 ? '#16a34a' : '#cbd5e1' }} />

        {/* Step 3 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setStep(3)}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: step === 3 ? '#0284c7' : '#cbd5e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
            3
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: step === 3 ? '#0284c7' : '#1e293b' }}>3. Review & submit</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{step === 3 ? 'In progress' : 'Pending'}</div>
          </div>
        </div>
      </div>

      {/* 2-Column Grid (Wizard Content & Sidebar) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>
        {/* Main Step Content */}
        <div>
          {/* STEP 1: Business Details */}
          {step === 1 && (
            <Panel
              title="Confirm & Adjust Business Information"
              description="Details pre-filled from your business profile. You can correct parameters specifically for this application."
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Business name" required>
                  <input
                    type="text"
                    value={businessDetails.businessName}
                    onChange={e => handleDetailChange('businessName', e.target.value)}
                    placeholder="Enterprise legal name"
                    required
                  />
                </Field>

                <Field label="Registration / Tax ID (GST / CIN / Reg No)">
                  <input
                    type="text"
                    value={businessDetails.registrationNo}
                    onChange={e => handleDetailChange('registrationNo', e.target.value)}
                    placeholder="e.g. U74999MH2018PTC123456"
                  />
                </Field>

                <Field label="Primary contact person" required>
                  <input
                    type="text"
                    value={businessDetails.contactPerson}
                    onChange={e => handleDetailChange('contactPerson', e.target.value)}
                    placeholder="Authorized signatory / bidder contact"
                    required
                  />
                </Field>

                <Field label="Contact email" required>
                  <input
                    type="email"
                    value={businessDetails.contactEmail}
                    onChange={e => handleDetailChange('contactEmail', e.target.value)}
                    placeholder="Official bidding email"
                    required
                  />
                </Field>

                <Field label="Contact phone number" required>
                  <input
                    type="tel"
                    value={businessDetails.contactPhone}
                    onChange={e => handleDetailChange('contactPhone', e.target.value)}
                    placeholder="+91 XXXXX XXXXX"
                    required
                  />
                </Field>

                <Field label="Operating address / HQ" required>
                  <input
                    type="text"
                    value={businessDetails.location}
                    onChange={e => handleDetailChange('location', e.target.value)}
                    placeholder="City, State"
                    required
                  />
                </Field>

                <Field label="Annual turnover (₹ in Lakhs)">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={businessDetails.annualTurnover}
                    onChange={e => handleDetailChange('annualTurnover', e.target.value)}
                    placeholder="e.g. 250"
                  />
                </Field>

                <Field label="Years of experience">
                  <input
                    type="number"
                    min="0"
                    value={businessDetails.yearsOfExperience}
                    onChange={e => handleDetailChange('yearsOfExperience', e.target.value)}
                    placeholder="e.g. 7"
                  />
                </Field>
              </div>

              <div style={{ marginTop: 14 }}>
                <Field label="Brief proposal note / Executive remarks">
                  <textarea
                    rows={4}
                    value={businessDetails.proposalSummary}
                    onChange={e => handleDetailChange('proposalSummary', e.target.value)}
                    placeholder="Highlight specific relevant experience, methodology, or key equipment/capacity for this procurement..."
                  />
                </Field>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                <button type="button" className="button button-secondary" onClick={handleSaveDraft} disabled={submitting}>
                  Save draft
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setStep(2)}
                  disabled={!businessDetails.businessName || !businessDetails.contactPerson || !businessDetails.contactEmail}
                >
                  Continue to documents &rarr;
                </button>
              </div>
            </Panel>
          )}

          {/* STEP 2: Document Selection & Vault Integration */}
          {step === 2 && (
            <Panel
              title="Select required business documents"
              description="Choose documents from your secure vault. You can reuse previously uploaded files or upload new ones."
            >
              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                {requiredDocsList.map((req, idx) => {
                  const selected = selectedDocs[req.name];
                  // Matching candidate from vault if not yet selected
                  const candidate = vaultDocs.find(v => {
                    const reqLower = req.name.toLowerCase();
                    const vName = v.name.toLowerCase();
                    return vName.includes(reqLower) || reqLower.includes(vName);
                  });

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        borderRadius: 10,
                        border: selected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        background: selected ? '#f0f9ff' : '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(selected)}
                          onChange={() => {
                            if (selected) {
                              handleToggleDoc(req.name, null);
                            } else if (candidate) {
                              handleToggleDoc(req.name, candidate);
                            } else {
                              openUploadForRequirement(req);
                            }
                          }}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                          📄
                        </div>
                        <div>
                          <strong style={{ fontSize: 14, color: '#0f172a' }}>{req.name}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            {selected ? (
                              <>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '1px 6px', borderRadius: 4 }}>
                                  ✓ Attached ({selected.fileName})
                                </span>
                                <span style={{ fontSize: 11, color: '#64748b' }}>
                                  From your document vault
                                </span>
                              </>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#b91c1c', background: '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>
                                ! Not provided &nbsp;•&nbsp; Required for this tender
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {selected ? (
                          <>
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={() => handleDownloadDoc(selected.id)}
                            >
                              👁 Preview
                            </button>
                            <button
                              type="button"
                              className="button button-secondary"
                              style={{ fontSize: 12, padding: '4px 10px', color: '#dc2626' }}
                              onClick={() => handleToggleDoc(req.name, null)}
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="button button-secondary"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            onClick={() => openUploadForRequirement(req)}
                          >
                            + Upload to vault
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Preservation Notice Box matching Reference 08 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 8,
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 18, color: '#2563eb' }}>ℹ</div>
                <div>
                  <strong style={{ fontSize: 13, color: '#1e40af' }}>
                    A dated copy of selected files and business details is preserved with your submission.
                  </strong>
                  <div style={{ fontSize: 12, color: '#1e3a8a', marginTop: 2 }}>
                    The documents and your current business details will be securely stored and timestamped as part of your application.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" className="button button-secondary" onClick={() => setStep(1)}>
                  &larr; Back to details
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="button button-secondary" onClick={handleSaveDraft} disabled={submitting}>
                    Save draft
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => setStep(3)}
                    disabled={!allRequiredDocsSelected}
                  >
                    Continue to review &rarr;
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {/* STEP 3: Review & Submit */}
          {step === 3 && (
            <Panel
              title="Review Application & Explicit Confirmation"
              description="Review your submitted snapshot. Once submitted, an official application reference and timestamp are generated."
            >
              <form onSubmit={handleSubmitFinal}>
                {/* Submitted Business Snapshot */}
                <h3 style={{ fontSize: 15, color: '#0f172a', margin: '0 0 10px' }}>
                  1. Business Details Snapshot
                </h3>
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 13 }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>BUSINESS NAME</span>
                      <strong style={{ color: '#0f172a' }}>{businessDetails.businessName}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>REGISTRATION / TAX ID</span>
                      <strong style={{ color: '#0f172a' }}>{businessDetails.registrationNo || '—'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>CONTACT PERSON</span>
                      <strong style={{ color: '#0f172a' }}>{businessDetails.contactPerson}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>CONTACT CHANNELS</span>
                      <span style={{ color: '#0f172a' }}>{businessDetails.contactEmail} &nbsp;•&nbsp; {businessDetails.contactPhone}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>OPERATING LOCATION</span>
                      <strong style={{ color: '#0f172a' }}>{businessDetails.location}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>ANNUAL TURNOVER</span>
                      <strong style={{ color: '#0f172a' }}>₹{businessDetails.annualTurnover} Lakhs</strong>
                    </div>
                  </div>
                  {businessDetails.proposalSummary && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#334155' }}>
                      <strong>Proposal Note: </strong> {businessDetails.proposalSummary}
                    </div>
                  )}
                </div>

                {/* Attached Documents Snapshot */}
                <h3 style={{ fontSize: 15, color: '#0f172a', margin: '0 0 10px' }}>
                  2. Attached Document Credentials ({Object.keys(selectedDocs).length} files)
                </h3>
                <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {Object.entries(selectedDocs).map(([reqName, doc], idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <div>
                          <strong style={{ color: '#0f172a' }}>{reqName}</strong>
                          <span style={{ color: '#64748b', marginLeft: 8 }}>({doc.fileName})</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Locked version</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mandatory Explicit Confirmation */}
                <div
                  style={{
                    background: '#fefce8',
                    border: '1px solid #fef08a',
                    borderRadius: 8,
                    padding: '16px 18px',
                    marginBottom: 24,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={e => setConfirmed(e.target.checked)}
                      style={{ width: 20, height: 20, marginTop: 2, cursor: 'pointer' }}
                      required
                    />
                    <span style={{ fontSize: 13, color: '#713f12', lineHeight: 1.5 }}>
                      <strong>Explicit Submission Confirmation:</strong> I confirm that all information provided in this application is accurate and true to the best of my knowledge, and that all attached documents represent authentic, valid corporate records.
                    </span>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="button button-secondary" onClick={() => setStep(2)}>
                    &larr; Back to documents
                  </button>
                  <button
                    type="submit"
                    className="button button-primary"
                    style={{ padding: '10px 24px', fontSize: 14, fontWeight: 700 }}
                    disabled={submitting || !confirmed || deadlinePassed}
                  >
                    {submitting ? 'Submitting Application...' : 'Submit Application &rarr;'}
                  </button>
                </div>
              </form>
            </Panel>
          )}
        </div>

        {/* Right-Hand Sidebar matching 08_Application_Wizard.png */}
        <div>
          {/* 1. Application Checklist Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Application checklist</h3>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              {readyDocsCount} of {requiredDocsList.length} required documents ready
            </div>

            {/* Visual Progress Bar */}
            <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
              <div
                style={{
                  width: `${(readyDocsCount / (requiredDocsList.length || 1)) * 100}%`,
                  height: '100%',
                  background: allRequiredDocsSelected ? '#16a34a' : '#0284c7',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {requiredDocsList.map((req, idx) => {
                const isReady = Boolean(selectedDocs[req.name]);
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: isReady ? '#dcfce7' : '#fee2e2', color: isReady ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                      {isReady ? '✓' : '!'}
                    </div>
                    <span style={{ color: isReady ? '#0f172a' : '#64748b', fontWeight: isReady ? 500 : 400 }}>
                      {req.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Your Profile Details (prefilled) Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Your profile details (prefilled)
              </h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setStep(1)}
              >
                ✎ Edit
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
              <div>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>Business name</span>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{businessDetails.businessName || '—'}</div>
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>Registration / Tax ID</span>
                <div>{businessDetails.registrationNo || '—'}</div>
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>Location</span>
                <div>{businessDetails.location || '—'}</div>
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{ color: '#94a3b8', fontSize: 11 }}>Annual turnover</span>
                <div>₹{businessDetails.annualTurnover || '—'} Lakhs</div>
              </div>
            </div>
          </div>

          {/* 3. Key Information Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>Key information</h3>
            <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span>📅</span>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>Application deadline</span>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{formatDate(tender?.submissionDeadline)}</div>
                  <div style={{ color: '#b91c1c', fontSize: 11 }}><DeadlineCountdown deadline={tender?.submissionDeadline} /></div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span>📄</span>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>Tender reference</span>
                  <div style={{ fontFamily: 'monospace', color: '#0f172a' }}>{tender?.referenceNumber || 'N/A'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span>🏛️</span>
                <div>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>Procuring entity</span>
                  <div style={{ color: '#0f172a' }}>{tender?.issuingAuthority}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Automated Eligibility Indicator Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 8,
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
            }}
          >
            <div style={{ color: '#16a34a', fontSize: 16 }}>✓</div>
            <div style={{ fontSize: 12, color: '#15803d', lineHeight: 1.45 }}>
              <strong>Basic eligibility satisfied:</strong> Automated screening against your profile parameters indicates full capacity to bid on this procurement.
            </div>
          </div>
        </div>
      </div>

      {/* Quick Upload Modal for Missing Documents */}
      {uploadModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#ffffff', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, color: '#0f172a' }}>
              Upload {targetReqDoc?.name || 'Document'} to Vault
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
              Files uploaded here are stored in your Secure Document Vault and automatically attached to this application.
            </p>

            {uploadError && <Notice kind="error">{uploadError}</Notice>}

            <form onSubmit={handleQuickUpload} className="form-stack">
              <Field label="Document label" required>
                <input
                  type="text"
                  value={uploadDocName}
                  onChange={e => setUploadDocName(e.target.value)}
                  placeholder="e.g. GST Registration Certificate"
                  required
                />
              </Field>

              <Field label="Choose file (PDF, PNG, JPG, XLSX - Max 8 MB)" required>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    setUploadFile(f || null);
                    if (f && !uploadDocName) {
                      setUploadDocName(f.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  required
                />
              </Field>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button type="button" className="button button-secondary" onClick={() => setUploadModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={uploadingDoc || !uploadFile}>
                  {uploadingDoc ? 'Uploading...' : 'Upload & Attach'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
