import { useEffect, useMemo, useState } from 'react';
import StatCard from '../../components/dashboard/StatCard.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { EmptyState, Field, FilterBar, LoadingState, Modal, Notice, PageHeader, SearchField } from '../../components/common/ProcurementUI.jsx';
import { explainError } from '../../services/api.js';
import { approvalService } from '../../services/procurementService.js';
import { formatDate, getRows, humanize } from '../../utils/formatters.js';

const typeOf = row => row.type || row.kind || 'Request';
const nameOf = row => row.organizationName || row.businessName || 'Applicant';
const contactOf = row => row.contactPerson || row.email || row.registrationNo || 'Details not supplied';
const hasPendingStatus = row => ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(row.status || '').toUpperCase());

export default function VerificationRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [decisionDialog, setDecisionDialog] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionValidation, setDecisionValidation] = useState(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(getRows(await approvalService.list()));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const types = [...new Set(rows.map(typeOf).filter(value => value !== 'Request'))].sort();
  const statuses = [...new Set(rows.map(row => row.status).filter(Boolean))].sort();
  const counts = {
    pending: rows.filter(hasPendingStatus).length,
    approved: rows.filter(row => String(row.status || '').toUpperCase() === 'APPROVED').length,
    rejected: rows.filter(row => String(row.status || '').toUpperCase() === 'REJECTED').length,
  };
  const visible = useMemo(() => rows.filter(row => {
    const searchable = `${nameOf(row)} ${row.contactPerson || ''} ${row.email || row.contactEmail || ''} ${row.registrationNo || ''}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase())
      && (status === 'ALL' || row.status === status)
      && (type === 'ALL' || typeOf(row) === type);
  }), [rows, query, status, type]);
  const hasActiveFilters = Boolean(query.trim()) || status !== 'ALL' || type !== 'ALL';

  function clearFilters() {
    setQuery('');
    setStatus('ALL');
    setType('ALL');
  }

  function openRequest(row) {
    setDecisionError(null);
    setDecisionDialog(null);
    setSelected(row);
  }

  function startDecision(status) {
    setDecisionError(null);
    setDecisionValidation(null);
    setDecisionNote(status === 'APPROVED' ? 'Verification documents and credentials confirmed.' : '');
    setDecisionDialog({ open: true, status });
  }

  async function submitDecision(event) {
    if (event) event.preventDefault();
    if (!selected || decisionBusy || !decisionDialog) return;
    if (decisionDialog.status === 'REJECTED' && !decisionNote.trim()) {
      setDecisionValidation('A reason is required when rejecting a verification request.');
      return;
    }
    setDecisionBusy(true);
    setDecisionError(null);
    try {
      await approvalService.decide(selected.id, {
        status: decisionDialog.status,
        decisionNote: decisionNote.trim() || undefined,
      });
      setSuccessNotice(`Verification request for "${nameOf(selected)}" has been ${decisionDialog.status.toLowerCase()}.`);
      setDecisionDialog(null);
      setSelected(null);
      await load();
    } catch (requestError) {
      setDecisionError(requestError);
    } finally {
      setDecisionBusy(false);
    }
  }

  return <>
    {successNotice && <Notice kind="success">{successNotice}</Notice>}
    <PageHeader eyebrow="ADMINISTRATION WORKSPACE" title="Verification requests" description="Review organization and procurement submissions provided to the approval queue." action={<button type="button" className="button button-secondary" onClick={load} disabled={loading}>Refresh queue</button>} />
    <section className="stat-grid stat-grid-three" aria-label="Approval summary">
      <StatCard label="Pending" value={loading || error ? '—' : counts.pending} detail="Awaiting review" />
      <StatCard label="Approved" value={loading || error ? '—' : counts.approved} detail="Returned by the queue" />
      <StatCard label="Rejected" value={loading || error ? '—' : counts.rejected} detail="Returned by the queue" />
    </section>
    <section className="panel approval-queue-panel">
      <div className="panel-header">
        <div><h2>Approval queue</h2><p>Applicant and verification details are shown as supplied by the service.</p></div>
        {hasActiveFilters && <button type="button" className="button button-secondary" onClick={clearFilters}>Clear filters</button>}
      </div>
      <div className="approval-filter-layout"><FilterBar>
        <SearchField label="Search requests" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search organization or contact" />
        <Field label="Type"><select value={type} onChange={event => setType(event.target.value)}><option value="ALL">All types</option>{types.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></Field>
        <Field label="Status"><select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{statuses.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></Field>
      </FilterBar></div>

      {loading ? <LoadingState label="Loading requests…" /> : error ? <AdminUnavailable error={error} onRetry={load} /> : visible.length ? <>
        <div className="table-scroll approval-table"><table className="data-table"><thead><tr><th scope="col">Applicant / organization</th><th scope="col">Type</th><th scope="col">Submitted</th><th scope="col">Verification</th><th scope="col">Status</th><th scope="col">Review</th></tr></thead><tbody>
          {visible.map((row, index) => <tr key={row.id || `${nameOf(row)}-${index}`}>
            <td><strong>{nameOf(row)}</strong><span className="table-secondary">{contactOf(row)}</span></td>
            <td>{humanize(typeOf(row))}</td><td>{formatDate(row.createdAt || row.submittedAt)}</td>
            <td>{Array.isArray(row.documents) && row.documents.length ? `${row.documents.length} supporting documents` : 'No document data'}</td>
            <td><StatusBadge status={row.status} /></td><td><button type="button" className="button button-secondary" onClick={() => openRequest(row)}>Review record</button></td>
          </tr>)}
        </tbody></table></div>
        <div className="approval-cards">{visible.map((row, index) => <ApprovalCard key={row.id || `${nameOf(row)}-${index}`} row={row} onView={openRequest} />)}</div>
      </> : rows.length ? <EmptyState title="No requests match those filters">Try a different search, type, or status, or clear filters to see the full queue.</EmptyState> : <EmptyState icon={<ReviewIcon />} title="No requests to review">Verification requests will appear here when the approval queue is connected.</EmptyState>}
    </section>
    {selected && <Modal title={nameOf(selected)} description="Information supplied for verification." onClose={() => { if (!decisionBusy) setSelected(null); }}>
      <div className="detail-grid"><Detail label="Request type" value={humanize(typeOf(selected))} /><Detail label="Organization type" value={selected.organizationType} /><Detail label="Status" value={humanize(selected.status || '')} /><Detail label="Authorized representative / contact" value={selected.contactPerson} /><Detail label="Email" value={selected.email || selected.contactEmail} /><Detail label="Phone" value={selected.contactPhone} /><Detail label="Registration number" value={selected.registrationNo} /><Detail label="Address" value={selected.address} /><Detail label="Submitted" value={formatDate(selected.createdAt || selected.submittedAt)} /></div>
      {Array.isArray(selected.documents) && selected.documents.length > 0 && <div className="document-list"><h3>Supporting documents</h3>{selected.documents.map((document, index) => {
        const link = safeDocumentUrl(document.url);
        return link ? <a key={document.id || index} href={link} target="_blank" rel="noreferrer">{document.name || `Document ${index + 1}`}</a> : <span key={document.id || index}>{document.name || `Document ${index + 1}`}</span>;
      })}</div>}
      {decisionError && <div className="approval-action-note" role="alert"><strong>The decision was not recorded</strong><p>{explainError(decisionError)}</p></div>}
      <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={decisionBusy} onClick={() => setSelected(null)}>Close</button><button type="button" className="button button-danger" disabled={decisionBusy || !hasPendingStatus(selected)} onClick={() => startDecision('REJECTED')}>Reject</button><button type="button" className="button button-primary" disabled={decisionBusy || !hasPendingStatus(selected)} onClick={() => startDecision('APPROVED')}>Approve</button></div>
        </Modal>}
    {decisionDialog && selected && (
      <Modal
        title={decisionDialog.status === 'REJECTED' ? 'Reject verification request' : 'Approve verification request'}
        description={`Decision for ${nameOf(selected)} (${humanize(typeOf(selected))})`}
        onClose={() => { if (!decisionBusy) setDecisionDialog(null); }}
      >
        <form onSubmit={submitDecision} className="form-stack">
          {decisionError && <div className="approval-action-note" role="alert"><strong>Action failed</strong><p>{explainError(decisionError)}</p></div>}
          {decisionValidation && <Notice kind="error">{decisionValidation}</Notice>}
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5, margin: '0 0 12px' }}>
            {decisionDialog.status === 'REJECTED'
              ? 'Please specify the reason for rejecting this verification request. This note is preserved in the audit log and visible to the applicant.'
              : 'Confirm approval for this verification request. This grants the organization verified status and updates platform credentials.'}
          </p>
          <label className="field">
            <span className="field-label">
              {decisionDialog.status === 'REJECTED' ? 'Reason for rejection (mandatory)' : 'Approval notes (optional)'}
            </span>
            <textarea
              rows={4}
              maxLength={3000}
              required={decisionDialog.status === 'REJECTED'}
              value={decisionNote}
              onChange={e => { setDecisionNote(e.target.value); setDecisionValidation(null); }}
              placeholder={decisionDialog.status === 'REJECTED' ? 'e.g. Incomplete registration credentials or unverified tax documents...' : 'e.g. All legal documents and business registration details confirmed.'}
              autoFocus
            />
          </label>
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" disabled={decisionBusy} onClick={() => setDecisionDialog(null)}>Cancel</button>
            <button
              type="submit"
              className={decisionDialog.status === 'REJECTED' ? 'button button-danger' : 'button button-primary'}
              disabled={decisionBusy}
            >
              {decisionBusy ? 'Saving…' : (decisionDialog.status === 'REJECTED' ? 'Confirm Rejection' : 'Confirm Approval')}
            </button>
          </div>
        </form>
      </Modal>
    )}
  </>;
}

function ApprovalCard({ row, onView }) {
  const documentCount = Array.isArray(row.documents) ? row.documents.length : null;
  return <article className="approval-card">
    <div className="approval-card-heading"><div><h3>{nameOf(row)}</h3><p>{contactOf(row)}</p></div>{row.status && <StatusBadge status={row.status} />}</div>
    <dl className="approval-card-details"><div><dt>Type</dt><dd>{humanize(typeOf(row))}</dd></div><div><dt>Submitted</dt><dd>{formatDate(row.createdAt || row.submittedAt)}</dd></div><div><dt>Verification</dt><dd>{documentCount ? `${documentCount} documents` : 'No document data'}</dd></div></dl>
    <button type="button" className="button button-secondary" onClick={() => onView(row)}>Review record</button>
  </article>;
}

function AdminUnavailable({ error, onRetry }) {
  return <div className="admin-unavailable" role="status">
    <span className="empty-icon" aria-hidden="true"><ReviewIcon /></span>
    <h3>Approval queue is unavailable</h3>
    <p>We couldn’t load verification requests. Please try again in a moment.</p>
    <button type="button" className="button button-secondary" onClick={onRetry}>Try again</button>
    <details className="integration-details"><summary>Integration details</summary><p>{explainError(error)}</p></details>
  </div>;
}

function ReviewIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 3.5V8h4M9 12h6M9 16h3"/></svg>;
}

function Detail({ label, value }) {
  return <div className="detail-item"><dt>{label}</dt><dd>{value || '—'}</dd></div>;
}

function safeDocumentUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
