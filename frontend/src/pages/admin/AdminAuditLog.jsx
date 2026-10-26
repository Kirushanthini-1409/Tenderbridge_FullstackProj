import { useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/common/ProcurementUI.jsx';
import { approvalService } from '../../services/procurementService.js';
import { formatDate, getRows, humanize } from '../../utils/formatters.js';

export default function AdminAuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true); setError(null);
    try { setRows(getRows(await approvalService.auditEvents())); }
    catch (requestError) { setError(requestError); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => `${row.action} ${row.entityType} ${row.entityId} ${row.actorAuthId}`.toLowerCase().includes(needle));
  }, [rows, query]);

  return <>
    <PageHeader eyebrow="ADMINISTRATION WORKSPACE" title="Audit history" description="Review recent verification decisions, application reviews, tender result releases, and administrative changes." action={<button className="button button-secondary" onClick={load} disabled={loading}>Refresh log</button>} />
    <section className="panel">
      <div className="panel-header"><div><h2>Recent recorded actions</h2><p>Showing up to the 200 latest events stored by the API.</p></div><label className="field"><span className="field-label">Search actions</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Action, record, or account ID" /></label></div>
      {loading ? <LoadingState label="Loading audit events…" /> : error ? <ErrorState error={error} onRetry={load} /> : visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>When</th><th>Action</th><th>Record</th><th>Actor</th><th>Details</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td><strong>{humanize(row.action)}</strong><span className="table-secondary">{row.actorRole}</span></td><td>{humanize(row.entityType)}<span className="table-secondary">{row.entityId}</span></td><td>{row.actorAuthId}</td><td><details><summary>View event</summary><pre className="audit-metadata">{JSON.stringify(row.metadata || {}, null, 2)}</pre></details></td></tr>)}</tbody></table></div> : <EmptyState title={rows.length ? 'No events match your search' : 'No audit events yet'}>{rows.length ? 'Try a shorter search phrase.' : 'Administrative decisions and result releases will appear here.'}</EmptyState>}
    </section>
  </>;
}
