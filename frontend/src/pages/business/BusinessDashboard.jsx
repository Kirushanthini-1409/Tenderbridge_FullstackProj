import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatCard from '../../components/dashboard/StatCard.jsx';
import { PageHeader, LoadingState, EmptyState } from '../../components/common/ProcurementUI.jsx';
import { applicationsService, savedOpportunitiesService } from '../../services/procurementService.js';
import { tenderService } from '../../services/tenderService.js';
import { getRows } from '../../utils/formatters.js';
export default function BusinessDashboard() {
  const [data, setData] = useState({ applications: [], saved: [], tenders: [] }); const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  useEffect(() => { Promise.all([applicationsService.list(), savedOpportunitiesService.list(), tenderService.list({ pageSize: 1 })]).then(([a, s, t]) => setData({ applications: getRows(a), saved: getRows(s), tenders: getRows(t) })).catch(e => setError(e.message)).finally(() => setBusy(false)); }, []);
  return <><PageHeader eyebrow="BUSINESS WORKSPACE" title="Business dashboard" description="A quick view of your procurement activity and the opportunity catalogue." action={<Link className="button button-primary" to="/business/tenders">Browse tenders</Link>} />{error && <p className="notice notice-error" role="alert">{error}</p>}{busy ? <LoadingState label="Loading your workspace…" /> : <><section className="stat-grid"><StatCard label="Applications" value={data.applications.length} detail="Tracked opportunities" /><StatCard label="Saved" value={data.saved.length} detail="Saved for later" /><StatCard label="Catalogue" value={data.tenders.length ? 'Live' : 'Ready'} detail="Browse current opportunities" /></section><section className="panel"><h2>Pick up where you left off</h2><div className="button-row"><Link className="button button-primary" to="/business/applications">Update applications</Link><Link className="button button-secondary" to="/business/profile">Complete business profile</Link><Link className="button button-secondary" to="/business/partners">Find JV partners</Link></div>{!data.applications.length && <EmptyState title="No applications tracked yet">Find a tender and start tracking it when you are interested.</EmptyState>}</section></>}</>;
}
