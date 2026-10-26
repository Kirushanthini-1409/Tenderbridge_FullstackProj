import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApplicationTrackerTable from '../../components/dashboard/ApplicationTrackerTable.jsx';
import StatCard from '../../components/dashboard/StatCard.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { EmptyState, ErrorState, Field, FilterBar, LoadingState, Modal, Notice, PageHeader, SearchField } from '../../components/common/ProcurementUI.jsx';
import { applicationsService } from '../../services/procurementService.js';
import { explainError } from '../../services/api.js';
import { formatDate, getRows, humanize } from '../../utils/formatters.js';
import { useRefreshOnVisibility } from '../../hooks/useRefreshOnVisibility.js';
import DeadlineCountdown from '../../components/dashboard/DeadlineCountdown.jsx';
import ApplicationClarifications from '../../components/applications/ApplicationClarifications.jsx';

const statuses = [
  'DRAFT',
  'INTERESTED',
  'SUBMITTED',
  'UNDER_REVIEW',
  'UNDER_EVALUATION',
  'SHORTLISTED',
  'AWARDED',
  'NOT_SELECTED',
  'REJECTED',
  'WITHDRAWN',
  'CLOSED',
];

const deadlineOf = row => row?.tender?.submissionDeadline || row?.submissionDeadline;
const titleOf = row => row?.tender?.title || row?.tenderTitle || 'Tender';

const stageFor = status => {
  if (['INTERESTED', 'DRAFT', 'RECEIVED'].includes(status)) return 0;
  if (['SUBMITTED', 'UNDER_REVIEW', 'UNDER_EVALUATION'].includes(status)) return 1;
  return 2; // SHORTLISTED, AWARDED, NOT_SELECTED, REJECTED, WITHDRAWN, CLOSED
};

export default function ApplicationTracker() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [sort, setSort] = useState('deadline');

  // Detail Modal
  const [selected, setSelected] = useState(null);

  // Manual Tracking Modal
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [trackingError, setTrackingError] = useState(null);

  // Withdrawal Modal
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);

  async function load(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const items = getRows(await applicationsService.list()).filter(item => item && typeof item === 'object');
      setRows(items);
    } catch (requestError) {
      setError(requestError);
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useRefreshOnVisibility(() => load(true));

  const categories = [...new Set(rows.map(row => row.tender?.category || row.category).filter(Boolean))].sort();

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      const category = row.tender?.category || row.category || '';
      const source = row.tender?.issuingAuthority || row.issuingAuthority || '';
      const searchable = `${titleOf(row)} ${source} ${category} ${row.tender?.referenceNumber || row.referenceNumber || ''} ${row.referenceNo || ''}`.toLowerCase();
      return (!needle || searchable.includes(needle)) &&
        (statusFilter === 'ALL' || row.status === statusFilter) &&
        (categoryFilter === 'ALL' || category === categoryFilter);
    }).sort((a, b) => {
      const first = sort === 'updated' ? a.updatedAt : deadlineOf(a);
      const second = sort === 'updated' ? b.updatedAt : deadlineOf(b);
      const firstTime = first ? new Date(first).getTime() : Number.MAX_SAFE_INTEGER;
      const secondTime = second ? new Date(second).getTime() : Number.MAX_SAFE_INTEGER;
      return sort === 'latest' || sort === 'updated' ? secondTime - firstTime : firstTime - secondTime;
    });
  }, [rows, query, statusFilter, categoryFilter, sort]);

  const counts = {
    total: rows.length,
    draft: rows.filter(row => ['INTERESTED', 'DRAFT'].includes(row.status)).length,
    submitted: rows.filter(row => row.status === 'SUBMITTED').length,
    underReview: rows.filter(row => ['UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED'].includes(row.status)).length,
    awarded: rows.filter(row => row.status === 'AWARDED').length,
  };

  async function trackTender(event) {
    event.preventDefault();
    if (trackingBusy) return;
    const form = new FormData(event.currentTarget);
    const tenderId = String(form.get('tenderReference') || '').trim();
    setTrackingBusy(true);
    setTrackingError(null);
    try {
      await applicationsService.createOrUpdate({
        tenderId,
        status: 'INTERESTED',
        notes: String(form.get('notes') || '').trim() || null,
      });
      setTrackingOpen(false);
      await load();
    } catch (requestError) {
      setTrackingError(requestError);
    } finally {
      setTrackingBusy(false);
    }
  }

  async function handleConfirmWithdrawal(e) {
    e.preventDefault();
    if (!selected) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await applicationsService.withdraw(selected.id, withdrawReason.trim() || 'Applicant request');
      setWithdrawModalOpen(false);
      setSelected(null);
      await load();
    } catch (err) {
      setWithdrawError(explainError(err));
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleDownloadSubmittedDoc(doc) {
    if (!selected) return;
    const identifier = doc.id || doc.requirementName || doc.name;
    try {
      const blob = await applicationsService.downloadSubmittedDocument(selected.id, identifier);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || `${doc.requirementName || doc.name || 'submitted-document'}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      alert(`Could not download file: ${explainError(err)}`);
    }
  }

  // Check if deadline is passed for selected
  const isSelectedDeadlinePassed = useMemo(() => {
    const dl = deadlineOf(selected);
    if (!dl) return false;
    return new Date() > new Date(dl);
  }, [selected]);

  const canEditSelected = Boolean(
    selected &&
    !selected.isSample &&
    !isSelectedDeadlinePassed &&
    !['WITHDRAWN', 'CLOSED', 'AWARDED'].includes(selected.status)
  );

  const canWithdrawSelected = Boolean(
    selected &&
    !selected.isSample &&
    !isSelectedDeadlinePassed &&
    !['WITHDRAWN', 'CLOSED', 'AWARDED'].includes(selected.status)
  );

  return (
    <>
      <PageHeader
        eyebrow="BUSINESS WORKSPACE"
        title="Application Tracker"
        description="Monitor each procurement opportunity through its complete lifecycle, from draft preparation and submission to evaluation, results, and withdrawal."
        action={
          <div className="button-row">
            <button type="button" className="button button-primary" onClick={() => { setTrackingError(null); setTrackingOpen(true); }}>
              Track a tender
            </button>
            <button type="button" className="button button-secondary" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        }
      />

      <section className="stat-grid" aria-label="Application summary">
        <StatCard label="Total Tracked" value={loading || error ? '—' : counts.total} detail="Applications" />
        <StatCard label="Drafts & Interested" value={loading || error ? '—' : counts.draft} detail="In preparation" />
        <StatCard label="Submitted" value={loading || error ? '—' : counts.submitted} detail="Formally lodged" />
        <StatCard label="In Evaluation" value={loading || error ? '—' : counts.underReview} detail="Under review / shortlisted" />
      </section>

      <section className="workflow-strip" aria-label="Application lifecycle: Interested, then Submitted, then Result">
        <div>
          <span className="workflow-title">Application Lifecycle</span>
          <p className="workflow-caption">Complete stages: Preparation &rarr; Submission &rarr; Evaluation &rarr; Outcome.</p>
        </div>
        <ol className="workflow-steps">
          <li className="workflow-step"><span className="workflow-node" aria-hidden="true">1</span>Preparation</li>
          <li className="workflow-connector" aria-hidden="true" />
          <li className="workflow-step"><span className="workflow-node" aria-hidden="true">2</span>Submitted</li>
          <li className="workflow-connector" aria-hidden="true" />
          <li className="workflow-step"><span className="workflow-node" aria-hidden="true">3</span>Evaluation</li>
          <li className="workflow-connector" aria-hidden="true" />
          <li className="workflow-step"><span className="workflow-node" aria-hidden="true">4</span>Outcome</li>
        </ol>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Tracked Applications</h2>
            <p>Review submission references, deadlines, status updates, and organization messages.</p>
          </div>
        </div>

        <FilterBar>
          <SearchField
            label="Search applications"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search title, source, or reference"
          />
          <Field label="Status">
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="ALL">All statuses</option>
              {statuses.map(status => (
                <option key={status} value={status}>{humanize(status)}</option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
              <option value="ALL">All categories</option>
              {categories.map(category => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </Field>
          <Field label="Sort by">
            <select value={sort} onChange={event => setSort(event.target.value)}>
              <option value="deadline">Nearest deadline</option>
              <option value="latest">Latest deadline</option>
              <option value="updated">Last updated</option>
            </select>
          </Field>
        </FilterBar>

        {loading ? (
          <LoadingState label="Loading your applications…" />
        ) : error ? (
          <ApplicationUnavailable error={error} onRetry={load} />
        ) : visibleRows.length ? (
          <ApplicationTrackerTable rows={visibleRows} onSelect={setSelected} />
        ) : rows.length ? (
          <EmptyState icon={<SearchIcon />} title="No search results">
            No applications match your search and filters. Try adjusting them to see more.
          </EmptyState>
        ) : (
          <EmptyState icon={<ApplicationIcon />} title="No applications tracked yet">
            Browse tenders and click &ldquo;Start application&rdquo; or use &ldquo;Track a tender&rdquo; to begin.
          </EmptyState>
        )}
      </section>

      {/* Comprehensive Application Details Modal */}
      {selected && (
        <Modal
          title={titleOf(selected)}
          description={selected.isSample ? 'Sample demonstration record.' : 'Complete application details, lock snapshot, and status history.'}
          onClose={() => setSelected(null)}
        >
          {/* Top Status & Reference Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
            }}
          >
            <div>
              <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Application Reference
              </span>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                {selected.referenceNo || 'APP-PENDING-SUBMISSION'}
              </div>
            </div>
            <div>
              <StatusBadge status={selected.status} />
            </div>
          </div>

          <div className="detail-grid" style={{ marginBottom: 16 }}>
            <Detail label="Procuring Authority" value={selected.tender?.issuingAuthority || selected.issuingAuthority || '—'} />
            <Detail label="Tender Reference" value={selected.tender?.referenceNumber || selected.referenceNumber || '—'} />
            <Detail label="Procurement Category" value={selected.tender?.category || selected.category || '—'} />
            <Detail label="Submission Deadline" value={formatDate(deadlineOf(selected))} />
            <Detail label="Submission Date" value={formatDate(selected.submissionDate || selected.createdAt)} />
            <Detail label="Last Action" value={formatDate(selected.updatedAt || selected.submissionDate)} />
          </div>

          {!selected.isSample && selected.tenderVersionNumber != null &&
            Number(selected.tender?.latestVersionNumber || 0) > Number(selected.tenderVersionNumber) && (
              <div className="notice notice-warning" role="status" style={{ marginBottom: 16 }}>
                This tender has changed since you submitted this application. Your submission was based on version {selected.tenderVersionNumber}; the current tender is version {selected.tender.latestVersionNumber}. Review the latest tender details before taking any further action.
              </div>
            )}

          <ApplicationTimeline status={selected.status} />

          {selected.tender?.result?.publishedAt && (
            <div className="notice notice-success" role="status" style={{ margin: '16px 0' }}>
              <strong>Tender results published</strong>
              <p style={{ margin: '6px 0 0' }}>{selected.tender.result.summary}</p>
              <small>Published {formatDate(selected.tender.result.publishedAt)}</small>
            </div>
          )}

          {/* Organization Message / Review Notes Callout */}
          {selected.reviewNotes && (
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '12px 16px',
                margin: '16px 0',
              }}
            >
              <strong style={{ fontSize: 13, color: '#1e40af' }}>💬 Organization Message / Review Note:</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#1e3a8a', lineHeight: 1.45 }}>
                {selected.reviewNotes}
              </p>
            </div>
          )}

          {/* Rejection / Withdrawal Reason */}
          {selected.rejectionReason && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '12px 16px',
                margin: '16px 0',
              }}
            >
              <strong style={{ fontSize: 13, color: '#b91c1c' }}>
                {selected.status === 'WITHDRAWN' ? 'Withdrawal Reason:' : 'Outcome / Decision Note:'}
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#991b1b', lineHeight: 1.45 }}>
                {selected.rejectionReason}
              </p>
            </div>
          )}

          {/* Status History Timeline */}
          {Array.isArray(selected.statusHistory) && selected.statusHistory.length > 0 && (
            <div style={{ margin: '18px 0' }}>
              <h4 style={{ fontSize: 13, color: '#1e293b', margin: '0 0 10px', fontWeight: 700 }}>
                Status History & Activity Log
              </h4>
              <div style={{ display: 'grid', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                {selected.statusHistory.map((entry, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 12 }}>
                    <div>
                      <strong style={{ color: '#0f172a' }}>{humanize(entry.status)}</strong>
                      <span style={{ color: '#64748b', marginLeft: 8 }}>{entry.note}</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap', marginLeft: 12 }}>
                      {formatDate(entry.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submitted Snapshot Details */}
          {selected.submittedSnapshot && (
            <div style={{ margin: '18px 0' }}>
              <h4 style={{ fontSize: 13, color: '#1e293b', margin: '0 0 10px', fontWeight: 700 }}>
                Submitted Business Snapshot
              </h4>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Business: </span>
                    <strong>{selected.submittedSnapshot.businessName || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Contact: </span>
                    <strong>{selected.submittedSnapshot.contactPerson || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Email: </span>
                    <span>{selected.submittedSnapshot.contactEmail || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Turnover: </span>
                    <strong>₹{selected.submittedSnapshot.annualTurnover || '—'} Lakhs</strong>
                  </div>
                </div>
                {selected.submittedSnapshot.proposalSummary && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', color: '#475569' }}>
                    <strong>Proposal Remarks: </strong> {selected.submittedSnapshot.proposalSummary}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attached Document Versions */}
          {Array.isArray(selected.submittedDocuments) && selected.submittedDocuments.length > 0 && (
            <div style={{ margin: '18px 0' }}>
              <h4 style={{ fontSize: 13, color: '#1e293b', margin: '0 0 10px', fontWeight: 700 }}>
                Submitted Document Versions ({selected.submittedDocuments.length})
              </h4>
              <div style={{ display: 'grid', gap: 8 }}>
                {selected.submittedDocuments.map((doc, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#f8fafc',
                      borderRadius: 6,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <strong style={{ color: '#0f172a' }}>{doc.requirementName || doc.name}</strong>
                      <span style={{ color: '#64748b', marginLeft: 8 }}>({doc.fileName})</span>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => handleDownloadSubmittedDoc(doc)}
                    >
                      Download file
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!selected.isSample && <ApplicationClarifications applicationId={selected.id} />}

          {/* Applicant Notes */}
          <div className="record-notes">
            <span>{selected.isSample ? 'Sample data' : 'Applicant Notes'}</span>
            <p>{selected.notes || 'No custom notes added.'}</p>
          </div>

          {/* Actions Bar */}
          <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
            <div>
              {canWithdrawSelected && (
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                  onClick={() => {
                    setWithdrawReason('');
                    setWithdrawError(null);
                    setWithdrawModalOpen(true);
                  }}
                >
                  Withdraw application
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="button button-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
              {canEditSelected && (
                <button
                  className="button button-primary"
                  onClick={() => {
                    const tenderRef = selected.tenderId || selected.tender?.referenceNumber;
                    navigate(`/business/apply/${encodeURIComponent(tenderRef)}`);
                  }}
                >
                  Edit / Replace documents &rarr;
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Withdrawal Confirmation Dialog */}
      {withdrawModalOpen && (
        <Modal
          title="Confirm Application Withdrawal"
          description={`Are you sure you want to withdraw your application for "${titleOf(selected)}"?`}
          onClose={() => { if (!withdrawing) setWithdrawModalOpen(false); }}
        >
          {withdrawError && <Notice kind="error">{withdrawError}</Notice>}

          <form onSubmit={handleConfirmWithdrawal} className="form-stack">
            <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, margin: '0 0 14px' }}>
              Withdrawing formally retracts your bid submission from consideration. The application record and its submitted history will be preserved in your archive with a &ldquo;Withdrawn&rdquo; status.
            </p>

            <Field label="Withdrawal reason (optional)">
              <textarea
                rows={3}
                value={withdrawReason}
                onChange={e => setWithdrawReason(e.target.value)}
                placeholder="e.g. Commercial constraints, revised capacity allocation, or bid reassessment..."
              />
            </Field>

            <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="button button-secondary"
                disabled={withdrawing}
                onClick={() => setWithdrawModalOpen(false)}
              >
                Keep application
              </button>
              <button
                type="submit"
                className="button button-primary"
                style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                disabled={withdrawing}
              >
                {withdrawing ? 'Withdrawing...' : 'Confirm Withdrawal'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Track a Tender Modal */}
      {trackingOpen && (
        <Modal
          title="Track a tender"
          description="Enter the reference number or ID from the tender catalogue."
          onClose={() => { if (!trackingBusy) setTrackingOpen(false); }}
        >
          <form className="form-stack" onSubmit={trackTender}>
            {trackingError && <ErrorState error={trackingError} />}
            <Field label="Tender reference or ID">
              <input name="tenderReference" required maxLength="200" autoFocus placeholder="e.g. RSU-2025-017 or tender reference" />
            </Field>
            <Field label="Notes (optional)">
              <textarea name="notes" rows="3" maxLength="5000" placeholder="Why you’re considering this tender" />
            </Field>
            <p className="supporting-copy">The tender must already exist in the shared catalogue.</p>
            <div className="dialog-actions">
              <button type="button" className="button button-secondary" disabled={trackingBusy} onClick={() => setTrackingOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="button button-primary" disabled={trackingBusy}>
                {trackingBusy ? 'Adding…' : 'Add to tracker'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

function ApplicationUnavailable({ error, onRetry }) {
  return (
    <div className="application-unavailable" role="status">
      <span className="empty-icon" aria-hidden="true"><ApplicationIcon /></span>
      <h3>Application data is unavailable</h3>
      <p>We couldn’t load your tracked applications. Please try again in a moment.</p>
      <button className="button button-secondary" onClick={onRetry}>Try again</button>
      <details className="integration-details">
        <summary>Integration details</summary>
        <p>{explainError(error)}</p>
      </details>
    </div>
  );
}

function ApplicationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function ApplicationTimeline({ status }) {
  const active = stageFor(status);
  const stages = ['Preparation', 'Submitted', 'Outcome'];
  return (
    <ol className="detail-timeline" aria-label="Application progress">
      {stages.map((stage, index) => (
        <li key={stage} className={index <= active ? 'complete' : ''} aria-current={index === active ? 'step' : undefined}>
          <span className="timeline-marker" aria-hidden="true" />
          <span>{stage}</span>
          <small>
            {index < active ? 'Complete' : index === active ? humanize(status) : 'Not reached'}
          </small>
        </li>
      ))}
    </ol>
  );
}
