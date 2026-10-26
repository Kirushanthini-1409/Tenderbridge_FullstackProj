import { useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, Field, LoadingState, PageHeader, Panel, SearchField } from '../../components/common/ProcurementUI.jsx';
import { partnerDirectoryService } from '../../services/procurementService.js';

const rows = value => Array.isArray(value?.items) ? value.items : [];
const formatTurnover = value => value == null ? 'Not shared' : `₹${new Intl.NumberFormat('en-IN').format(Number(value))} / year`;

export default function JVPartnerDirectory() {
  const [directory, setDirectory] = useState([]);
  const [saved, setSaved] = useState([]);
  const [tab, setTab] = useState('directory');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [all, mine] = await Promise.all([partnerDirectoryService.list(), partnerDirectoryService.listSaved()]);
      setDirectory(rows(all)); setSaved(rows(mine));
    } catch (requestError) { setError(requestError); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const savedIds = useMemo(() => new Set(saved.map(item => item.partner?.id || item.partnerProfileId)), [saved]);
  const visible = (tab === 'saved' ? saved.map(item => item.partner).filter(Boolean) : directory)
    .filter(company => `${company.businessName} ${company.category} ${company.location} ${(company.certifications || []).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));

  async function toggle(company) {
    setBusyId(company.id); setError(null);
    try {
      if (savedIds.has(company.id)) await partnerDirectoryService.removeSaved(company.id);
      else await partnerDirectoryService.save(company.id);
      const mine = await partnerDirectoryService.listSaved(); setSaved(rows(mine));
    } catch (requestError) { setError(requestError); }
    finally { setBusyId(''); }
  }

  return <>
    <PageHeader eyebrow="BUSINESS WORKSPACE" title="JV partner directory" description="Browse companies that chose to share their business details and save potential partners for later." action={<button className="button button-secondary" onClick={load} disabled={loading}>Refresh</button>} />
    <Panel title="Partner companies" description="Partner discovery is user-driven. Contact information appears only when a company has explicitly shared it.">
      <div className="filter-layout">
        <Field label="View"><select value={tab} onChange={event => setTab(event.target.value)}><option value="directory">Directory</option><option value="saved">Saved partners</option></select></Field>
        <SearchField label="Search partners" value={query} onChange={event => setQuery(event.target.value)} placeholder="Company, category, location, certification" />
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {loading ? <LoadingState label="Loading partner directory…" /> : visible.length ? <div className="partner-grid">{visible.map(company => <article className="partner-company-card" key={company.id}>
        <div className="partner-company-card-heading"><div><h3>{company.businessName?.replace(/^\[SAMPLE\]\s*/, '')}</h3><p>{company.category || 'Category not provided'}</p></div></div>
        <dl className="detail-grid"><Detail label="Turnover" value={formatTurnover(company.annualTurnover)} /><Detail label="Experience" value={company.yearsOfExperience == null ? 'Not shared' : `${company.yearsOfExperience} years`} /><Detail label="Location" value={company.location} /><Detail label="Certifications" value={company.certifications?.join(', ') || 'Not listed'} /></dl>
        {company.publicContactEmail && <p><a href={`mailto:${company.publicContactEmail}`}>{company.publicContactEmail}</a></p>}
        <button className={savedIds.has(company.id) ? 'button button-secondary' : 'button button-primary'} disabled={busyId === company.id} onClick={() => toggle(company)}>{busyId === company.id ? 'Saving…' : savedIds.has(company.id) ? 'Remove from saved' : 'Save partner'}</button>
      </article>)}</div> : <EmptyState title={tab === 'saved' ? 'No saved partners yet' : 'No shared companies found'}>{tab === 'saved' ? 'Save companies from the directory to keep them here.' : 'Businesses appear when they complete a profile and opt in to sharing.'}</EmptyState>}
    </Panel>
  </>;
}

function Detail({ label, value }) { return <div className="detail-item"><dt>{label}</dt><dd>{value || '—'}</dd></div>; }
