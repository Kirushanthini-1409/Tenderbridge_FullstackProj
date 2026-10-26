import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import DeadlineCountdown from '../../components/dashboard/DeadlineCountdown.jsx';
import { EmptyState, ErrorState, Field, FilterBar, LoadingState, PageHeader, SearchField } from '../../components/common/ProcurementUI.jsx';
import { explainError } from '../../services/api.js';
import { tenderService } from '../../services/tenderService.js';
import { formatDate, getRows } from '../../utils/formatters.js';

function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

const COMMON_CATEGORIES = [
  'Construction & Infrastructure',
  'Computers & IT Products',
  'IT Services & Software',
  'Electrical Equipment & Solar',
  'Healthcare & Medical Equipment',
  'Consulting & Professional Services',
  'Maintenance & Facilities',
  'Textiles & Uniforms',
  'Furniture & Fixtures',
  'Transportation & Logistics',
];

export default function TenderListing() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [status, setStatus] = useState('');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(1);

  // Derive known categories from loaded rows combined with common defaults
  const knownCategories = useMemo(() => {
    const fromRows = rows.map(r => r.category).filter(Boolean);
    return Array.from(new Set([...COMMON_CATEGORIES, ...fromRows])).sort();
  }, [rows]);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: nextPage,
        pageSize: 20,
        ...(query.trim() ? { search: query.trim() } : {}),
        ...(category.trim() ? { category: category.trim() } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(minValue.trim() ? { minValue: Number(minValue.trim()) } : {}),
        ...(maxValue.trim() ? { maxValue: Number(maxValue.trim()) } : {}),
        ...(status.trim() ? { status: status.trim() } : {}),
        ...(deadlineFrom ? { deadlineFrom } : {}),
        ...(deadlineTo ? { deadlineTo } : {}),
      };
      const data = await tenderService.list(params);
      setRows(getRows(data));
      setPagination(data?.pagination ?? { page: nextPage, pageSize: 20 });
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }

  // Load on mount and whenever page changes
  useEffect(() => {
    load(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(event) {
    event.preventDefault();
    setPage(1);
    load(1);
  }

  function clearFilters() {
    setQuery('');
    setCategory('');
    setLocation('');
    setMinValue('');
    setMaxValue('');
    setStatus('');
    setDeadlineFrom('');
    setDeadlineTo('');
    setPage(1);
    setTimeout(() => load(1), 0);
  }

  const hasFilters = Boolean(
    query.trim() ||
    category.trim() ||
    location.trim() ||
    minValue.trim() ||
    maxValue.trim() ||
    status.trim() ||
    deadlineFrom ||
    deadlineTo
  );

  const canGoBack = pagination.page > 1;
  const canGoForward = pagination.totalPages
    ? pagination.page < pagination.totalPages
    : rows.length === pagination.pageSize;

  return (
    <>
      <PageHeader
        eyebrow="BUSINESS WORKSPACE"
        title="Tender Discovery"
        description="Browse published private and institutional procurement opportunities with advisory eligibility guidance."
        action={
          <button type="button" className="button button-secondary" onClick={() => load(page)} disabled={loading}>
            Refresh
          </button>
        }
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Procurement Opportunities</h2>
            <p>Filter by keyword, procurement sector, location, value bracket, and deadlines.</p>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowAdvancedFilters(prev => !prev)}
            >
              {showAdvancedFilters ? 'Simple filters' : 'More filters'}
            </button>
            {hasFilters && (
              <button type="button" className="button button-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <FilterBar>
            <SearchField
              label="Search keywords"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Title, authority, or reference no."
            />
            <Field label="Category / Industry">
              <input
                list="tender-categories-list"
                value={category}
                onChange={event => setCategory(event.target.value)}
                maxLength="100"
                placeholder="All categories"
              />
              <datalist id="tender-categories-list">
                {knownCategories.map(val => <option key={val} value={val} />)}
              </datalist>
            </Field>
            <Field label="Location">
              <input
                type="text"
                value={location}
                onChange={event => setLocation(event.target.value)}
                placeholder="City, state, or region"
              />
            </Field>
            <Field label="Action">
              <button type="submit" className="button button-primary" disabled={loading}>
                Apply filters
              </button>
            </Field>
          </FilterBar>

          {showAdvancedFilters && (
            <div
              style={{
                marginTop: 14,
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              <Field label="Min Estimated Value (₹)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 500000"
                  value={minValue}
                  onChange={e => setMinValue(e.target.value)}
                />
              </Field>

              <Field label="Max Estimated Value (₹)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 10000000"
                  value={maxValue}
                  onChange={e => setMaxValue(e.target.value)}
                />
              </Field>

              <Field label="Tender Status">
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active (Open)</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </Field>

              <Field label="Deadline from">
                <input
                  type="date"
                  value={deadlineFrom}
                  onChange={event => setDeadlineFrom(event.target.value)}
                />
              </Field>

              <Field label="Deadline to">
                <input
                  type="date"
                  value={deadlineTo}
                  onChange={event => setDeadlineTo(event.target.value)}
                />
              </Field>
            </div>
          )}
        </form>

        {loading ? (
          <LoadingState label="Loading tenders..." />
        ) : error ? (
          <TenderUnavailable error={error} onRetry={() => load(page)} />
        ) : rows.length > 0 ? (
          <>
            <div className="opportunity-grid">
              {rows.map((tender, index) => (
                <TenderCard key={tender.id || tender.referenceNumber || `tender-${index}`} tender={tender} />
              ))}
            </div>

            {/* Pagination */}
            <div className="form-submit-bar" style={{ marginTop: 24 }}>
              <span style={{ color: '#66788d', fontSize: '12px' }}>
                Page {pagination.page}
                {pagination.totalPages ? ` of ${pagination.totalPages}` : ''}
                {typeof pagination.total === 'number' ? ` · ${pagination.total} total opportunities` : ''}
              </span>
              <div className="button-row">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!canGoBack || loading}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!canGoForward || loading}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : hasFilters ? (
          <EmptyState icon={<SearchIcon />} title="No matching tenders">
            No tender records matched your search parameters. Try widening your criteria or clearing filters.
          </EmptyState>
        ) : (
          <EmptyState icon={<TenderIcon />} title="No tenders in catalogue">
            The tender catalogue is currently awaiting listings. Published private tenders will appear here.
          </EmptyState>
        )}
      </section>
    </>
  );
}

function TenderCard({ tender }) {
  const href = `/business/tenders/${encodeURIComponent(tender.id || tender.referenceNumber)}`;
  const org = tender.organization;
  const isVerified = Boolean(org?.verified);
  const locationDisplay = tender.location || org?.location;

  return (
    <article className="opportunity-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div className="opportunity-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="opportunity-category" style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155' }}>
            {tender.category || 'General Procurement'}
          </span>
          {tender.status && <StatusBadge status={tender.status} />}
        </div>

        <h3 style={{ margin: '6px 0 8px', fontSize: 16, lineHeight: 1.35, color: '#0f172a' }}>
          <Link to={href} style={{ color: 'inherit', textDecoration: 'none' }}>
            {tender.title || 'Untitled tender opportunity'}
          </Link>
        </h3>

        {/* Issuing Authority & Verification Status */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#475569' }}>
            {tender.issuingAuthority || org?.name || 'Private Procuring Authority'}
          </span>
          {isVerified ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                color: '#15803d',
                background: '#dcfce7',
                border: '1px solid #bbf7d0',
                padding: '1px 6px',
                borderRadius: 10,
              }}
              title="Verified by TenderBridge administration"
            >
              ✓ Verified Org
            </span>
          ) : (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: '#64748b',
                background: '#f1f5f9',
                padding: '1px 6px',
                borderRadius: 10,
              }}
            >
              Unverified
            </span>
          )}
        </div>

        <dl className="opportunity-details" style={{ margin: '10px 0 14px' }}>
          {tender.referenceNumber && (
            <div>
              <dt>Reference</dt>
              <dd style={{ fontFamily: 'monospace', fontSize: 11 }}>{tender.referenceNumber}</dd>
            </div>
          )}
          {locationDisplay && (
            <div>
              <dt>Location</dt>
              <dd>{locationDisplay}</dd>
            </div>
          )}
          <div>
            <dt>Deadline</dt>
            <dd>{formatDate(tender.submissionDeadline)}</dd>
          </div>
          <div>
            <dt>Time left</dt>
            <dd><DeadlineCountdown deadline={tender.submissionDeadline} /></dd>
          </div>
          <div>
            <dt>Est. value</dt>
            <dd style={{ fontWeight: 600 }}>{formatCurrency(tender.estimatedValue)}</dd>
          </div>
        </dl>
      </div>

      <div>
        {/* Advisory guidance indicator */}
        <div
          style={{
            fontSize: 11,
            color: '#0369a1',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 6,
            padding: '5px 8px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 13 }}>ℹ</span>
          <span>Advisory eligibility screening available</span>
        </div>

        <div className="opportunity-actions" style={{ display: 'flex', gap: 8 }}>
          <Link className="button button-primary" to={href} style={{ flex: 1, textAlign: 'center' }}>
            View details & eligibility
          </Link>
          {tender.officialLink && (
            <a
              className="button button-secondary"
              href={tender.officialLink}
              target="_blank"
              rel="noreferrer"
              title="Open issuing authority portal"
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function TenderUnavailable({ error, onRetry }) {
  const needsSignIn = error?.status === 401;
  return (
    <div className="saved-unavailable" role="status">
      <span className="empty-icon" aria-hidden="true"><TenderIcon /></span>
      <h3>{needsSignIn ? 'Sign in to view tenders' : 'Tender catalogue unavailable'}</h3>
      <p>
        {needsSignIn
          ? 'Your account must be confirmed and signed in before the tender list can load.'
          : "We couldn't load the tender list. Please try again in a moment."}
      </p>
      {needsSignIn ? (
        <Link className="button button-primary" to="/login">Go to sign in</Link>
      ) : (
        <button type="button" className="button button-secondary" onClick={onRetry}>Try again</button>
      )}
      {!needsSignIn && (
        <details className="integration-details">
          <summary>Integration details</summary>
          <p>{explainError(error)}</p>
        </details>
      )}
    </div>
  );
}

function TenderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
      <path d="M7 4v5M12 9.5v5M17 15v5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}
