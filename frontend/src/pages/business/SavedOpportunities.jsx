import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import StatCard from '../../components/dashboard/StatCard.jsx';
import { EmptyState, ErrorState, Field, FilterBar, LoadingState, Modal, PageHeader, SearchField } from '../../components/common/ProcurementUI.jsx';
import { explainError } from '../../services/api.js';
import { applicationsService, savedOpportunitiesService } from '../../services/procurementService.js';
import { formatDate, getRows, humanize } from '../../utils/formatters.js';
import { hideSampleSaved, sampleSavedRecords } from '../../utils/sampleData.js';
import { useRefreshOnVisibility } from '../../hooks/useRefreshOnVisibility.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const deadlineFilters = [
  ['ALL', 'All deadlines'],
  ['NEXT_7_DAYS', 'Due in 7 days'],
  ['NEXT_30_DAYS', 'Due in 30 days'],
  ['PAST', 'Past deadline'],
  ['NONE', 'No deadline'],
];

const tenderFor = item => item.tender || item;
const categoryFor = tender => tender.category || tender.type || '';
const deadlineFor = tender => tender.submissionDeadline;
const savedTitleFor = tender => tender.title || 'Tender opportunity';
const reminderFor = state => ({
  DUE_WITHIN_7_DAYS: 'Deadline within 7 days',
  DUE_WITHIN_30_DAYS: 'Deadline within 30 days',
  PAST_DUE: 'Deadline passed',
  UPCOMING: 'Upcoming deadline',
  CLOSED: 'Tender closed',
  NO_DEADLINE: 'No deadline listed',
}[state] || '');
const deadlineTimestamp = value => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};
const safeTenderLink = value => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export default function SavedOpportunities() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [deadline, setDeadline] = useState('ALL');
  const [sort, setSort] = useState('deadline');

  async function load(background = false) {
    if (!background) setLoading(true);
    setError(null);
    try {
      const items = getRows(await savedOpportunitiesService.list());
      setRows(items.length ? items : sampleSavedRecords());
    } catch (requestError) {
      setError(requestError);
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useRefreshOnVisibility(() => load(true));

  const categories = [...new Set(rows.map(item => categoryFor(tenderFor(item))).filter(Boolean))].sort();
  const statuses = [...new Set(rows.map(item => tenderFor(item).status).filter(Boolean))].sort();
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const now = Date.now();
    return rows.filter(item => {
      const tender = tenderFor(item);
      const tenderCategory = categoryFor(tender);
      const source = tender.issuingAuthority || '';
      const reference = tender.referenceNumber || '';
      const searchable = `${savedTitleFor(tender)} ${source} ${reference} ${tenderCategory}`.toLowerCase();
      const rawDeadline = deadlineFor(tender);
      const timestamp = deadlineTimestamp(rawDeadline);
      const daysUntilDeadline = timestamp !== null ? Math.ceil((timestamp - now) / DAY_MS) : null;
      const matchesDeadline = deadline === 'ALL'
        || (deadline === 'NEXT_7_DAYS' && daysUntilDeadline !== null && daysUntilDeadline >= 0 && daysUntilDeadline <= 7)
        || (deadline === 'NEXT_30_DAYS' && daysUntilDeadline !== null && daysUntilDeadline >= 0 && daysUntilDeadline <= 30)
        || (deadline === 'PAST' && daysUntilDeadline !== null && daysUntilDeadline < 0)
        || (deadline === 'NONE' && timestamp === null);
      return (!needle || searchable.includes(needle))
        && (category === 'ALL' || tenderCategory === category)
        && (status === 'ALL' || tender.status === status)
        && matchesDeadline;
    }).sort((firstItem, secondItem) => {
      const first = tenderFor(firstItem);
      const second = tenderFor(secondItem);
      if (sort === 'value' && first.estimatedValue != null && second.estimatedValue != null) {
        return Number(second.estimatedValue) - Number(first.estimatedValue);
      }
      const firstDate = deadlineTimestamp(deadlineFor(first));
      const secondDate = deadlineTimestamp(deadlineFor(second));
      if (firstDate === null && secondDate === null) return 0;
      if (firstDate === null) return 1;
      if (secondDate === null) return -1;
      return sort === 'latest' ? secondDate - firstDate : firstDate - secondDate;
    });
  }, [rows, query, category, status, deadline, sort]);

  const hasActiveFilters = Boolean(query.trim()) || category !== 'ALL' || status !== 'ALL' || deadline !== 'ALL';

  function clearFilters() {
    setQuery('');
    setCategory('ALL');
    setStatus('ALL');
    setDeadline('ALL');
    setSort('deadline');
  }

  async function remove(tenderId) {
    setActionError(null);
    setRemovingId(tenderId);
    try {
      const item = rows.find(row => (row.tenderId || tenderFor(row).id) === tenderId);
      if (item?.isSample) hideSampleSaved(tenderFor(item).referenceNumber);
      else await savedOpportunitiesService.toggle(tenderId);
      await load();
    } catch (requestError) {
      setActionError(requestError);
    } finally {
      setRemovingId(null);
    }
  }

  async function trackSample(tender) {
    setActionError(null);
    try {
      await applicationsService.createOrUpdate({ tenderId: tender.referenceNumber, status: 'INTERESTED', notes: 'Added from the sample opportunity list. This is not a bid submission.' });
      setActionError({ message: 'Sample tender added to your real application tracker as Interested. No bid was submitted.' });
    } catch (requestError) { setActionError(requestError); }
  }

  async function saveTender(event) {
    event.preventDefault();
    if (saveBusy) return;
    const form = new FormData(event.currentTarget);
    const tenderReference = String(form.get('tenderReference') || '').trim();
    setSaveBusy(true);
    setSaveError(null);
    try {
      await savedOpportunitiesService.save(tenderReference);
      setSaveOpen(false);
      await load();
    } catch (requestError) {
      setSaveError(requestError);
    } finally {
      setSaveBusy(false);
    }
  }

  return <>
    <PageHeader eyebrow="BUSINESS WORKSPACE" title="Saved opportunities" description="Keep tenders you’re considering together so you can revisit their details and deadlines." action={<div className="button-row"><button type="button" className="button button-primary" onClick={() => { setSaveError(null); setSaveOpen(true); }}>Save a tender</button><button type="button" className="button button-secondary" onClick={load} disabled={loading}>Refresh</button></div>} />

    <section className="stat-grid stat-grid-two" aria-label="Saved opportunity summary">
      <StatCard label="Total saved" value={loading || error ? '—' : rows.length} detail="Opportunities in your shortlist" />
      <StatCard label="Categories" value={loading || error ? '—' : categories.length} detail="Represented in your shortlist" />
    </section>

    {actionError && <div className="saved-action-notice" role="alert">
      <div><strong>{actionError.message?.startsWith('Sample tender') ? 'Tracker updated' : 'Your shortlist wasn’t changed'}</strong><p>{actionError.message?.startsWith('Sample tender') ? actionError.message : 'The save service couldn’t complete this request.'}</p>
        <details><summary>Integration details</summary><p>{explainError(actionError)}</p></details>
      </div>
      <button type="button" className="button button-tertiary" onClick={() => setActionError(null)}>Dismiss</button>
    </div>}

    <section className="panel saved-opportunities-panel">
      <div className="panel-header">
        <div><h2>Your shortlist</h2><p>Review each tender’s source, category, and submission deadline.</p></div>
        {hasActiveFilters && <button type="button" className="button button-secondary" onClick={clearFilters}>Clear filters</button>}
      </div>

      <div className="saved-filter-layout"><FilterBar>
        <SearchField label="Search saved opportunities" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, source, or reference" />
        <Field label="Category"><select value={category} onChange={event => setCategory(event.target.value)}><option value="ALL">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
        <Field label="Status"><select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{statuses.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></Field>
        <Field label="Deadline"><select value={deadline} onChange={event => setDeadline(event.target.value)}>{deadlineFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Sort by"><select value={sort} onChange={event => setSort(event.target.value)}><option value="deadline">Nearest deadline</option><option value="latest">Latest deadline</option><option value="value">Estimated value</option></select></Field>
      </FilterBar></div>

      {loading ? <LoadingState label="Loading saved opportunities…" /> : error ? <SavedUnavailable error={error} onRetry={load} /> : visible.length ? <div className="opportunity-grid">
        {visible.map((item, index) => {
          const tender = tenderFor(item);
          const id = item.tenderId || tender.id;
          const title = savedTitleFor(tender);
          const tenderLink = safeTenderLink(tender.officialLink);
          return <article className="opportunity-card" key={item.id || id || `${title}-${index}`}>
            <div className="opportunity-card-top">
              <span className="saved-indicator"><BookmarkIcon />{item.isSample ? 'Sample record' : 'Saved'}</span>
              {tender.status && <StatusBadge status={tender.status} />}
            </div>
            {item.unseenVersionCount > 0 && <p className="saved-update-badge" role="status">{item.unseenVersionCount} new tender update{item.unseenVersionCount === 1 ? '' : 's'}</p>}
            <p className="opportunity-category">{categoryFor(tender) || 'Procurement opportunity'}</p>
            <h3>{title}</h3>
            <p className="opportunity-source">{tender.issuingAuthority || 'Source not provided'}</p>
            <dl className="opportunity-details">
              {tender.referenceNumber && <div><dt>Reference</dt><dd>{tender.referenceNumber}</dd></div>}
              <div><dt>Deadline</dt><dd>{formatDate(deadlineFor(tender))}{item.reminderState && <span className={`deadline-reminder deadline-reminder-${item.reminderState.toLowerCase()}`}>{reminderFor(item.reminderState)}</span>}</dd></div>
              <div><dt>Eligibility</dt><dd>{tender.eligibilityCriteria ? 'Criteria available — view details to evaluate' : 'Not yet evaluated'}</dd></div>
            </dl>
            <div className="opportunity-actions">
              <Link className="button button-primary" to={`/business/tenders/${encodeURIComponent(tender.referenceNumber || id)}`}>View details</Link>
              {tenderLink && <a className="button button-secondary" href={tenderLink} target="_blank" rel="noreferrer">Official notice ↗</a>}
              {item.isSample && <button type="button" className="button button-secondary" onClick={() => trackSample(tender)}>Track opportunity</button>}
              <button type="button" className="button button-tertiary" disabled={!id || removingId === id} onClick={() => remove(id)}>{removingId === id ? 'Removing…' : 'Remove saved'}</button>
            </div>
          </article>;
        })}
      </div> : rows.length ? <EmptyState icon={<SearchIcon />} title="No matching opportunities">No saved tenders match your search or filters. Adjust your criteria or clear filters to see your shortlist.</EmptyState> : <EmptyState icon={<BookmarkIcon />} title="No saved opportunities yet">Use “Save a tender” to add an item with its catalogue reference or ID.</EmptyState>}
    </section>
    {saveOpen && <Modal title="Save a tender" description="Add a tender from the shared catalogue to your shortlist." onClose={() => { if (!saveBusy) setSaveOpen(false); }}>
      <form className="form-stack" onSubmit={saveTender}>
        {saveError && <ErrorState error={saveError} />}
        <Field label="Tender reference or ID"><input name="tenderReference" required maxLength="200" autoFocus placeholder="Enter the catalogue reference" /></Field>
        <p className="supporting-copy">The tender must already exist in the shared catalogue. If it isn’t found, ask the catalogue owner to load it first.</p>
        <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={saveBusy} onClick={() => setSaveOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saveBusy}>{saveBusy ? 'Saving…' : 'Save tender'}</button></div>
      </form>
    </Modal>}
  </>;
}

function SavedUnavailable({ error, onRetry }) {
  return <div className="saved-unavailable" role="status">
    <span className="empty-icon" aria-hidden="true"><BookmarkIcon /></span>
    <h3>Saved opportunities are unavailable</h3>
    <p>We couldn’t load your shortlist. Please try again in a moment.</p>
    <button type="button" className="button button-secondary" onClick={onRetry}>Try again</button>
    <details className="integration-details"><summary>Integration details</summary><p>{explainError(error)}</p></details>
  </div>;
}

function BookmarkIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 4.75A1.75 1.75 0 0 1 8.25 3h7.5a1.75 1.75 0 0 1 1.75 1.75V21l-5.5-3.5L6.5 21V4.75Z" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>;
}
