import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { EmptyState, ErrorState, Field, FilterBar, LoadingState, Modal, Notice, PageHeader, SearchField } from '../../components/common/ProcurementUI.jsx';
import OrganizationIntegrationState from '../../components/private_org/OrganizationIntegrationState.jsx';
import { organizationProcurementService } from '../../services/procurementService.js';
import { formatDate, getRows, humanize } from '../../utils/formatters.js';
import { useRefreshOnVisibility } from '../../hooks/useRefreshOnVisibility.js';
import TenderFaqManager from '../../components/tender/TenderFaqManager.jsx';
import TenderResultsPanel from '../../components/private_org/TenderResultsPanel.jsx';

export default function ManageListings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [statusError, setStatusError] = useState(null);

  async function load(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      setRows(getRows(await organizationProcurementService.listMine()));
    } catch (requestError) {
      setError(requestError);
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useRefreshOnVisibility(() => load(true));

  const statuses = [...new Set(rows.map(row => row.status).filter(Boolean))].sort();
  const visible = useMemo(() => rows.filter(row => {
    const searchable = `${row.title || ''} ${row.category || ''} ${row.referenceNumber || ''}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase()) && (status === 'ALL' || row.status === status);
  }), [rows, query, status]);
  const hasActiveFilters = Boolean(query.trim()) || status !== 'ALL';

  function clearFilters() {
    setQuery('');
    setStatus('ALL');
  }

  function openEditor(row) {
    setSaveError(null);
    setEditing(row);
    setSelected(null);
  }

  async function saveListing(event) {
    event.preventDefault();
    if (!editing || saving) return;
    const form = new FormData(event.currentTarget);
    const optionalNumber = name => form.get(name) === '' ? null : Number(form.get(name));
    const deadline = form.get('submissionDeadline');
    const payload = {
      title: form.get('title').trim(),
      category: form.get('category').trim(),
      description: form.get('description').trim(),
      estimatedValue: optionalNumber('estimatedValue'),
      location: form.get('location').trim() || null,
      submissionDeadline: new Date(deadline).toISOString(),
      openingDate: form.get('openingDate') ? new Date(form.get('openingDate')).toISOString() : null,
      quantity: form.get('quantity').trim() || null,
      deliveryDuration: form.get('deliveryDuration').trim() || null,
      minTurnover: optionalNumber('minTurnover'),
      minExperienceYears: optionalNumber('minExperienceYears'),
      requiredDocuments: form.get('requiredDocuments').split('\n').map(value => value.trim()).filter(Boolean),
      requiredCertifications: form.get('requiredCertifications').split('\n').map(value => value.trim()).filter(Boolean),
      locationRestrictions: form.get('locationRestrictions').split('\n').map(value => value.trim()).filter(Boolean),
    };
    setSaving(true);
    setSaveError(null);
    try {
      await organizationProcurementService.update(editing.id, payload);
      setEditing(null);
      await load();
    } catch (requestError) {
      setSaveError(requestError);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(row) {
    const nextStatus = row.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    setStatusError(null);
    try { await organizationProcurementService.update(row.id, { status: nextStatus }); setSelected(null); await load(); }
    catch (requestError) { setStatusError(requestError); }
  }

  async function openPdf(row) {
    try {
      const blob = await organizationProcurementService.openPdf(row.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noreferrer'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) { setStatusError(requestError); }
  }

  return <>
    <PageHeader eyebrow="ORGANIZATION WORKSPACE" title="Manage listings" description="Review your organization’s procurement opportunities and their publication status." action={<Link className="button button-primary" to="/org/procurements/new">Create procurement</Link>} />
    <section className="panel org-listings-panel">
      <div className="panel-header">
        <div><h2>All procurement listings</h2><p>Review and edit listing details. Publication status is managed by the review workflow.</p></div>
        {hasActiveFilters && <button type="button" className="button button-secondary" onClick={clearFilters}>Clear filters</button>}
      </div>
      <div className="org-listing-filters"><FilterBar>
        <SearchField label="Search listings" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, category, or reference" />
        <Field label="Status"><select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{statuses.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></Field>
      </FilterBar></div>
      {loading ? <LoadingState label="Loading procurement listings…" /> : error ? <OrganizationIntegrationState title="Procurement listings are unavailable" description="We couldn’t load your organization’s listings. Please try again." error={error} onRetry={load} /> : visible.length ? <>
        <div className="table-scroll org-listing-table"><table className="data-table"><thead><tr><th scope="col">Procurement</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Deadline</th><th scope="col">Actions</th></tr></thead><tbody>{visible.map((row, index) => <tr key={row.id || `${row.title || 'listing'}-${index}`}>
          <td><strong>{row.title || 'Untitled procurement'}</strong><span className="table-secondary">{row.category || row.referenceNumber || '—'}</span></td>
          <td><StatusBadge status={row.status} /></td><td>{formatDate(row.createdAt)}</td><td>{formatDate(row.submissionDeadline)}</td>
          <td><div className="table-actions"><button type="button" className="button button-tertiary" onClick={() => setSelected(row)}>View / applicants</button><button type="button" className="button button-tertiary" onClick={() => openEditor(row)}>Edit</button></div></td>
        </tr>)}</tbody></table></div>
        <div className="org-listing-cards">{visible.map((row, index) => <ListingCard key={row.id || `${row.title || 'listing'}-${index}`} row={row} onView={setSelected} onEdit={openEditor} />)}</div>
      </> : rows.length ? <EmptyState title="No listings match your filters">Adjust your search or status filter, or clear the filters to see all listings.</EmptyState> : <EmptyState title="No procurement listings yet" action={<Link className="button button-primary" to="/org/procurements/new">Create procurement</Link>}>Your organization’s opportunities will appear here when listing services are connected.</EmptyState>}
    </section>
    {selected && <Modal title={selected.title || 'Procurement details'} description="Information available in this procurement record." onClose={() => setSelected(null)}>
      <div className="detail-grid"><Detail label="Reference" value={selected.referenceNumber} /><Detail label="Category" value={selected.category} /><Detail label="Status" value={selected.status && humanize(selected.status)} /><Detail label="Location" value={selected.location} /><Detail label="Quantity" value={selected.quantity} /><Detail label="Delivery / completion period" value={selected.deliveryDuration} /><Detail label="Bid opening date" value={formatDate(selected.openingDate)} /><Detail label="Estimated value" value={selected.estimatedValue != null ? String(selected.estimatedValue) : null} /><Detail label="Submission deadline" value={formatDate(selected.submissionDeadline)} /><Detail label="Created" value={formatDate(selected.createdAt)} /></div>
      {selected.extractionMetadata && <section className="panel"><h3>Extraction provenance</h3><p>Source: {selected.extractionMetadata.sourceType || 'Tender notice'} · Extractor: {selected.extractionMetadata.extractor || 'Unknown'} · Evidence confidence: {Math.round((selected.extractionMetadata.overallConfidence || 0) * 100)}% · {humanize(selected.extractionMetadata.reviewStatus || 'NEEDS_REVIEW')}</p>{selected.extractionMetadata.ocrStatus && selected.extractionMetadata.ocrStatus !== 'NOT_APPLICABLE' && <p>OCR: {humanize(selected.extractionMetadata.ocrStatus)} · Pages processed: {selected.extractionMetadata.pagesProcessed || 0}</p>}<div className="extraction-evidence-list">{Object.entries(selected.extractionMetadata.fieldConfidence || {}).filter(([, score]) => score > 0).map(([field, score]) => <div key={field}><strong>{humanize(field)}</strong><span>{Math.round(score * 100)}% · {humanize(selected.extractionMetadata.fieldSources?.[field] || 'EXTRACTED_SUGGESTION')}</span><p>“{selected.extractionMetadata.fieldEvidence?.[field] || 'No verifiable source quotation'}”{selected.extractionMetadata.fieldEvidencePages?.[field] ? ` · Page ${selected.extractionMetadata.fieldEvidencePages[field]}` : ''}</p></div>)}</div>{Array.isArray(selected.extractionMetadata.missingInformation) && selected.extractionMetadata.missingInformation.length > 0 && <p><strong>Missing or unverified information:</strong> {selected.extractionMetadata.missingInformation.join('; ')}</p>}</section>}
      {selected.extractedText && <details className="panel"><summary>Review extracted PDF text</summary><p>{selected.extractedText}</p></details>}
      {statusError && <ErrorState error={statusError} />}
      {selected.pdfFileName && <button type="button" className="button button-secondary" onClick={() => openPdf(selected)}>View uploaded PDF</button>}
      {selected.status === 'PUBLISHED' && <ApplicantsPanel procurement={selected} />}
      {selected.status === 'PUBLISHED' && <TenderResultsPanel procurement={selected} />}
      {selected.status === 'PUBLISHED' && selected.referenceNumber && <TenderFaqManager procurementId={selected.id} tenderId={selected.referenceNumber} />}
      <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setSelected(null)}>Close</button><button type="button" className="button button-primary" onClick={() => changeStatus(selected)}>{selected.status === 'PUBLISHED' ? 'Unpublish tender' : 'Publish tender'}</button></div>
    </Modal>}
    {editing && <Modal title="Edit procurement" description={`${editing.referenceNumber || 'Procurement listing'} · ${humanize(editing.status || '')}`} onClose={() => { if (!saving) setEditing(null); }}>
      <form className="form-stack" onSubmit={saveListing}>
        {saveError && <ErrorState error={saveError} />}
        <Field label="Procurement title"><input name="title" required maxLength="180" defaultValue={editing.title || ''} /></Field>
        <Field label="Category"><input name="category" required maxLength="100" defaultValue={editing.category || ''} /></Field>
        <Field label="Description"><textarea name="description" rows="4" required maxLength="10000" defaultValue={editing.description || ''} /></Field>
        <div className="form-grid">
          <Field label="Estimated value (₹)"><input name="estimatedValue" type="number" min="0" step="any" defaultValue={editing.estimatedValue ?? ''} /></Field>
          <Field label="Location"><input name="location" maxLength="160" defaultValue={editing.location || ''} /></Field>
          <Field label="Quantity"><input name="quantity" maxLength="120" defaultValue={editing.quantity || ''} /></Field>
          <Field label="Submission deadline"><input name="submissionDeadline" type="datetime-local" required defaultValue={toDateTimeLocal(editing.submissionDeadline)} /></Field>
          <Field label="Bid opening date"><input name="openingDate" type="datetime-local" defaultValue={toDateTimeLocal(editing.openingDate)} /></Field>
          <Field label="Delivery / completion period"><input name="deliveryDuration" maxLength="160" defaultValue={editing.deliveryDuration || ''} /></Field>
          <Field label="Minimum turnover (₹ lakhs)"><input name="minTurnover" type="number" min="0" step="any" defaultValue={editing.minTurnover ?? ''} /></Field>
          <Field label="Minimum experience (years)"><input name="minExperienceYears" type="number" min="0" step="1" defaultValue={editing.minExperienceYears ?? ''} /></Field>
          <Field label="Required certifications"><textarea name="requiredCertifications" rows="3" defaultValue={Array.isArray(editing.requiredCertifications) ? editing.requiredCertifications.join('\n') : ''} /></Field>
          <Field label="Location restrictions"><textarea name="locationRestrictions" rows="3" defaultValue={Array.isArray(editing.locationRestrictions) ? editing.locationRestrictions.join('\n') : ''} /></Field>
          <Field label="Required documents"><textarea name="requiredDocuments" rows="4" defaultValue={Array.isArray(editing.requiredDocuments) ? editing.requiredDocuments.join('\n') : ''} /></Field>
        </div>
        <p className="supporting-copy">This updates the listing details only. Review status and document uploads are managed separately.</p>
        <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </Modal>}
  </>;
}

function ApplicantsPanel({ procurement }) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null); const [busy, setBusy] = useState('');
  const [query, setQuery] = useState(''); const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedApplicant, setSelectedApplicant] = useState(null); const [clarifications, setClarifications] = useState([]);
  const [clarificationError, setClarificationError] = useState(null); const [clarificationBusy, setClarificationBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState(''); const [noteSaved, setNoteSaved] = useState(false);
  async function load(background = false) { if (!background) setLoading(true); setError(null); try { setItems(getRows(await organizationProcurementService.listApplications(procurement.id))); } catch (e) { setError(e); } finally { if (!background) setLoading(false); } }
  useEffect(() => { load(); }, [procurement.id]);
  useRefreshOnVisibility(() => load(true));
  async function updateStatus(application, status) { setBusy(application.id); setError(null); try { await organizationProcurementService.reviewApplication(procurement.id, application.id, status); await load(); } catch (e) { setError(e); } finally { setBusy(''); } }
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(application => {
      const haystack = `${application.applicant?.companyName || ''} ${application.applicant?.category || ''} ${application.referenceNo || ''}`.toLocaleLowerCase();
      return (!needle || haystack.includes(needle)) && (statusFilter === 'ALL' || application.status === statusFilter);
    });
  }, [items, query, statusFilter]);
  async function loadClarifications(applicationId) {
    setClarificationError(null);
    try { setClarifications(getRows(await organizationProcurementService.listClarifications(applicationId))); }
    catch (e) { setClarificationError(e); }
  }
  useEffect(() => {
    setClarifications([]); setClarificationError(null); setNoteSaved(false);
    if (selectedApplicant) { setNoteDraft(selectedApplicant.reviewNotes || ''); loadClarifications(selectedApplicant.id); }
  }, [selectedApplicant?.id]);
  async function saveInternalNote(event) {
    event.preventDefault(); if (!selectedApplicant || clarificationBusy) return;
    setClarificationBusy(true); setClarificationError(null); setNoteSaved(false);
    try {
      await organizationProcurementService.updateInternalNotes(procurement.id, selectedApplicant.id, noteDraft);
      setNoteSaved(true); setItems(current => current.map(item => item.id === selectedApplicant.id ? { ...item, reviewNotes: noteDraft } : item));
    } catch (e) { setClarificationError(e); } finally { setClarificationBusy(false); }
  }
  async function createClarification(event) {
    event.preventDefault(); if (!selectedApplicant || clarificationBusy) return;
    const currentForm = event.currentTarget;
    const form = new FormData(currentForm);
    const body = { subject: String(form.get('subject') || '').trim(), message: String(form.get('message') || '').trim(), responseDeadline: form.get('responseDeadline') ? new Date(String(form.get('responseDeadline'))).toISOString() : null };
    setClarificationBusy(true); setClarificationError(null);
    try { await organizationProcurementService.createClarification(procurement.id, selectedApplicant.id, body); currentForm.reset(); await loadClarifications(selectedApplicant.id); }
    catch (e) { setClarificationError(e); } finally { setClarificationBusy(false); }
  }
  async function closeClarification(clarificationId) {
    if (!selectedApplicant || clarificationBusy) return;
    setClarificationBusy(true); setClarificationError(null);
    try { await organizationProcurementService.closeClarification(procurement.id, selectedApplicant.id, clarificationId); await loadClarifications(selectedApplicant.id); }
    catch (e) { setClarificationError(e); } finally { setClarificationBusy(false); }
  }
  async function downloadDocument(doc) {
    try {
      const identifier = doc.id || doc.requirementName || doc.name;
      const blob = await organizationProcurementService.downloadSubmittedDocument(selectedApplicant.id, identifier);
      const url = URL.createObjectURL(blob); const link = globalThis.document.createElement('a');
      link.href = url; link.download = doc.fileName || doc.name || 'submitted-document'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { setClarificationError(e); }
  }
  const reviewTransitions = {
    SUBMITTED: ['RECEIVED', 'UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
    RECEIVED: ['UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
    UNDER_REVIEW: ['RECEIVED', 'UNDER_EVALUATION', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
    UNDER_EVALUATION: ['UNDER_REVIEW', 'SHORTLISTED', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
    SHORTLISTED: ['UNDER_REVIEW', 'UNDER_EVALUATION', 'AWARDED', 'NOT_SELECTED', 'REJECTED'],
  };
  return <>
    <section className="panel">
      <div className="panel-header"><div><h3>Applicants ({items.length})</h3><p>Only applications to this organization’s tender are shown. Documents and conversations are access-controlled.</p></div></div>
      <FilterBar><SearchField label="Search applicants" value={query} onChange={event => setQuery(event.target.value)} placeholder="Business name or application reference" /><Field label="Application status"><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{[...new Set(items.map(item => item.status))].sort().map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></Field></FilterBar>
      {error && <ErrorState error={error} onRetry={load} />}
      {loading ? <LoadingState label="Loading applicants…" /> : visibleItems.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Business</th><th>Application reference</th><th>Submitted</th><th>Status</th><th>Review status</th><th>Details</th></tr></thead><tbody>{visibleItems.map(application => <tr key={application.id}><td><strong>{application.applicant?.companyName || 'Business profile not completed'}</strong><span className="table-secondary">{[application.applicant?.category, application.applicant?.location].filter(Boolean).join(' · ')}</span></td><td>{application.referenceNo || '—'}</td><td>{formatDate(application.submissionDate || application.createdAt)}</td><td><StatusBadge status={application.status} /></td><td><select aria-label={`Review ${application.applicant?.companyName || 'application'}`} disabled={busy === application.id || !reviewTransitions[application.status]} value={application.status} onChange={event => updateStatus(application, event.target.value)}>{[application.status, ...(reviewTransitions[application.status] || [])].map(status => <option key={status} value={status}>{humanize(status)}</option>)}</select></td><td><button type="button" className="button button-secondary" onClick={() => setSelectedApplicant(application)}>Review</button></td></tr>)}</tbody></table></div> : <EmptyState title={items.length ? 'No applicants match these filters' : 'No applicants yet'}>{items.length ? 'Try another name or status.' : 'Submitted applications to this tender will appear here.'}</EmptyState>}
    </section>
    {selectedApplicant && <Modal title={selectedApplicant.applicant?.companyName || 'Application review'} description={`${selectedApplicant.referenceNo || 'Application'} · submitted ${formatDate(selectedApplicant.submissionDate || selectedApplicant.createdAt)}`} onClose={() => setSelectedApplicant(null)}>
      {clarificationError && <ErrorState error={clarificationError} onRetry={() => loadClarifications(selectedApplicant.id)} />}
      <div className="detail-grid"><Detail label="Application status" value={humanize(selectedApplicant.status)} /><Detail label="Business category" value={selectedApplicant.applicant?.category} /><Detail label="Location" value={selectedApplicant.applicant?.location} /><Detail label="Annual turnover" value={selectedApplicant.applicant?.annualTurnover != null ? `₹${selectedApplicant.applicant.annualTurnover} lakhs` : '—'} /><Detail label="Experience" value={selectedApplicant.applicant?.yearsOfExperience != null ? `${selectedApplicant.applicant.yearsOfExperience} years` : '—'} /></div>
      {selectedApplicant.submittedSnapshot && <section className="panel"><h3>Submitted application snapshot</h3><dl className="detail-grid">{Object.entries(selectedApplicant.submittedSnapshot).filter(([key, value]) => typeof value !== 'object' && value != null && key !== 'fileBase64').map(([key, value]) => <Detail key={key} label={humanize(key)} value={String(value)} />)}</dl></section>}
      <section className="panel"><h3>Submitted documents</h3>{Array.isArray(selectedApplicant.submittedDocuments) && selectedApplicant.submittedDocuments.length ? <ul>{selectedApplicant.submittedDocuments.map((doc, index) => <li key={doc.id || `${doc.name}-${index}`}><span>{doc.requirementName || doc.name || doc.fileName || 'Document'}{doc.fileName ? ` · ${doc.fileName}` : ''}</span><button type="button" className="button button-tertiary" onClick={() => downloadDocument(doc)}>Secure download</button></li>)}</ul> : <p>No submitted documents are attached to this application.</p>}</section>
      <section className="panel"><h3>Internal review notes</h3><p>Visible only to this organization’s reviewers; applicants cannot access these notes.</p><form onSubmit={saveInternalNote}><Field label="Private note"><textarea value={noteDraft} onChange={event => setNoteDraft(event.target.value)} maxLength={5000} rows={4} placeholder="Add internal assessment notes…" /></Field><button className="button button-secondary" type="submit" disabled={clarificationBusy}>{clarificationBusy ? 'Saving…' : 'Save internal note'}</button>{noteSaved && <Notice kind="success">Internal note saved.</Notice>}</form></section>
      <section className="panel"><h3>Clarifications</h3><p>Messages are private to this application and its applicant.</p>
        {clarifications.map(item => <article key={item.id} className="clarification-card"><div className="panel-header"><div><h4>{item.subject}</h4><StatusBadge status={item.status} /></div>{item.status === 'RESPONDED' && <button type="button" className="button button-secondary" disabled={clarificationBusy} onClick={() => closeClarification(item.id)}>Close request</button>}</div><p>Response deadline: {item.responseDeadline ? formatDate(item.responseDeadline) : 'No deadline'}</p><ol>{(item.messages || []).map(message => <li key={message.id}><strong>{message.senderRole === 'ORGANIZATION' || message.senderRole === 'ADMIN' ? 'Organization' : 'Applicant'}</strong><small> · {formatDate(message.createdAt)}</small><p>{message.body}</p></li>)}</ol></article>)}
        {['SUBMITTED', 'RECEIVED', 'UNDER_REVIEW', 'UNDER_EVALUATION', 'SHORTLISTED'].includes(selectedApplicant.status) && <form onSubmit={createClarification}><h4>Send clarification request</h4><Field label="Subject"><input name="subject" required maxLength={180} /></Field><Field label="Message"><textarea name="message" required maxLength={5000} rows={4} /></Field><Field label="Response deadline (optional)"><input name="responseDeadline" type="datetime-local" /></Field><button type="submit" className="button button-primary" disabled={clarificationBusy}>{clarificationBusy ? 'Sending…' : 'Send request'}</button></form>}
        {!clarifications.length && <p>No clarification requests yet.</p>}
      </section>
    </Modal>}
  </>;
}

function ListingCard({ row, onView, onEdit }) {
  return <article className="org-listing-card">
    <div className="org-listing-card-heading"><div><h3>{row.title || 'Untitled procurement'}</h3><p>{row.category || row.referenceNumber || 'Procurement listing'}</p></div>{row.status && <StatusBadge status={row.status} />}</div>
    <dl className="org-listing-card-details"><div><dt>Created</dt><dd>{formatDate(row.createdAt)}</dd></div><div><dt>Deadline</dt><dd>{formatDate(row.submissionDeadline)}</dd></div></dl>
    <div className="org-listing-card-actions"><button type="button" className="button button-secondary" onClick={() => onView(row)}>View details</button><button type="button" className="button button-tertiary" onClick={() => onEdit(row)}>Edit</button></div>
  </article>;
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function Detail({ label, value }) {
  return <div className="detail-item"><dt>{label}</dt><dd>{value || '—'}</dd></div>;
}
