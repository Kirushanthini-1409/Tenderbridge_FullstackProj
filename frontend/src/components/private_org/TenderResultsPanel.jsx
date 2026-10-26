import { useEffect, useState } from 'react';
import StatusBadge from '../common/StatusBadge.jsx';
import { ErrorState, LoadingState, Notice, Field } from '../common/ProcurementUI.jsx';
import { organizationProcurementService } from '../../services/procurementService.js';
import { getRows } from '../../utils/formatters.js';

const ignoredStatuses = new Set(['DRAFT', 'INTERESTED', 'WITHDRAWN']);
const finalStatuses = new Set(['AWARDED', 'NOT_SELECTED', 'REJECTED', 'CLOSED']);

export default function TenderResultsPanel({ procurement }) {
  const [applications, setApplications] = useState([]);
  const [published, setPublished] = useState(null);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true); setError(null);
    try {
      const [applicationResponse, resultResponse] = await Promise.all([
        organizationProcurementService.listApplications(procurement.id),
        organizationProcurementService.getResults(procurement.id),
      ]);
      setApplications(getRows(applicationResponse));
      const item = resultResponse?.item || null;
      setPublished(item);
      setSummary(item?.summary || '');
    } catch (loadError) { setError(loadError); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [procurement.id]);
  const submitted = applications.filter(item => !ignoredStatuses.has(item.status));
  const waiting = submitted.filter(item => !finalStatuses.has(item.status));
  const ready = submitted.length > 0 && waiting.length === 0;

  async function publish(event) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true); setError(null); setSuccess('');
    try {
      const response = await organizationProcurementService.publishResults(procurement.id, { summary: summary.trim() });
      setPublished(response.item);
      setSuccess(published ? 'Published results updated.' : 'Results published to applicants.');
    } catch (publishError) { setError(publishError); }
    finally { setBusy(false); }
  }

  return <section className="panel tender-results-panel" aria-label="Tender results">
    <div className="panel-header"><div><h3>Results and award notice</h3><p>Applicants see their final outcome after you publish the result notice.</p></div>{published && <StatusBadge status="RESULTS PUBLISHED" />}</div>
    {loading ? <LoadingState label="Checking application outcomes…" /> : <>
      {error && <ErrorState error={error} onRetry={load} />}
      <div className="detail-grid"><div className="detail-item"><dt>Submitted applications</dt><dd>{submitted.length}</dd></div><div className="detail-item"><dt>Still in review</dt><dd>{waiting.length}</dd></div><div className="detail-item"><dt>Awarded</dt><dd>{applications.filter(item => item.status === 'AWARDED').length}</dd></div></div>
      {!ready && <Notice>{submitted.length ? 'Complete the review outcome for every submitted application before releasing results.' : 'Results become available after at least one business submits an application.'}</Notice>}
      {published && <Notice kind="success">Last published {new Date(published.publishedAt).toLocaleString()}. Applicants can now see the notice and their application outcome.</Notice>}
      {success && <Notice kind="success">{success}</Notice>}
      <form className="form-stack" onSubmit={publish}>
        <Field label="Public result summary"><textarea value={summary} onChange={event => setSummary(event.target.value)} required maxLength={5000} minLength={1} rows={4} placeholder="Summarize the award decision and any next steps for applicants…" /></Field>
        <button type="submit" className="button button-primary" disabled={busy || !ready}>{busy ? 'Publishing…' : published ? 'Update published results' : 'Publish results to applicants'}</button>
      </form>
    </>}
  </section>;
}
