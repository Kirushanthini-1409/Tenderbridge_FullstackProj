import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/dashboard/StatCard.jsx';
import { ErrorState, LoadingState, PageHeader, Panel } from '../../components/common/ProcurementUI.jsx';
import { approvalService } from '../../services/procurementService.js';

const labels = [
  ['Business profiles', 'businesses'], ['Organizations', 'organizations'],
  ['Pending verification', 'pendingVerifications'], ['Verified organizations', 'verifiedOrganizations'],
  ['Tender records', 'tenders'], ['Published private tenders', 'publishedTenders'], ['Applications', 'applications'], ['Results published', 'releasedResults'],
];

export default function AdminDashboard() {
  const [overview, setOverview] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
  async function load() { setLoading(true); setError(null); try { const response = await approvalService.overview(); setOverview(response?.item || {}); } catch (e) { setError(e); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  return <><PageHeader eyebrow="ADMINISTRATION" title="Platform overview" description="Review platform activity, organization verification, and the shared tender catalogue." action={<button className="button button-secondary" onClick={load} disabled={loading}>Refresh</button>} />
    {error && <ErrorState error={error} onRetry={load} />}
    {loading ? <LoadingState label="Loading platform summary…" /> : <section className="stat-grid">{labels.map(([label, key]) => <StatCard key={key} label={label} value={overview?.[key] ?? 0} detail={key === 'businesses' ? 'Saved business profiles' : 'Current database count'} />)}</section>}
    <Panel title="Administration" description="Review access requests, maintain the shared tender catalogue, and inspect recorded administrative actions."><div className="button-row"><Link className="button button-primary" to="/admin/verification-requests">Review verification requests</Link><Link className="button button-secondary" to="/admin/tenders">Manage tenders</Link><Link className="button button-secondary" to="/admin/tenders/new">Add tender</Link><Link className="button button-tertiary" to="/admin/audit">View audit history</Link></div></Panel>
  </>;
}
