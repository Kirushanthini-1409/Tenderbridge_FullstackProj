import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/dashboard/StatCard.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { EmptyState, LoadingState, PageHeader, Panel } from '../../components/common/ProcurementUI.jsx';
import OrganizationIntegrationState from '../../components/private_org/OrganizationIntegrationState.jsx';
import { organizationProcurementService } from '../../services/procurementService.js';
import { formatDate, getRows } from '../../utils/formatters.js';

export default function OrgDashboard() {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
  async function load() { setLoading(true); setError(null); try { setRows(getRows(await organizationProcurementService.listMine())); } catch (requestError) { setError(requestError); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const statusCount = status => rows.filter(row => String(row.status || '').toUpperCase() === status).length;
  const published = statusCount('PUBLISHED') + statusCount('ACTIVE');
  const drafts = statusCount('DRAFT');
  const completed = statusCount('CLOSED') + statusCount('COMPLETED');

  return <>
    <PageHeader eyebrow="ORGANIZATION WORKSPACE" title="Procurement overview" description="Manage opportunities your organization shares with suppliers." action={<Link className="button button-primary" to="/org/procurements/new">Create procurement</Link>} />
    <section className="stat-grid" aria-label="Procurement summary"><StatCard label="Total listings" value={loading || error ? '—' : rows.length} detail="All organization listings" /><StatCard label="Published" value={loading || error ? '—' : published} detail="Active or published status" /><StatCard label="Drafts" value={loading || error ? '—' : drafts} detail="Where draft status is supplied" /><StatCard label="Closed / completed" value={loading || error ? '—' : completed} detail="Where terminal status is supplied" /></section>
    <Panel title="Recent listings" description="The latest opportunities created by your organization." action={<Link className="text-link" to="/org/procurements">Manage all</Link>}>
      {loading ? <LoadingState label="Loading organization listings…" /> : error ? <OrganizationIntegrationState title="Organization listings are unavailable" description="We couldn’t load your recent procurements. Please try again." error={error} onRetry={load} /> : rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">Procurement</th><th scope="col">Status</th><th scope="col">Deadline</th><th scope="col">Created</th></tr></thead><tbody>{rows.slice(0, 5).map((row, index) => <tr key={row.id || `${row.title || 'listing'}-${index}`}><td><strong>{row.title || 'Untitled procurement'}</strong><span className="table-secondary">{row.category || 'Category not supplied'}</span></td><td><StatusBadge status={row.status} /></td><td>{formatDate(row.submissionDeadline)}</td><td>{formatDate(row.createdAt)}</td></tr>)}</tbody></table></div> : <EmptyState title="No procurements created">Start by adding an opportunity for suppliers to review.<Link className="button button-primary" to="/org/procurements/new">Create procurement</Link></EmptyState>}
    </Panel>
  </>;
}
