import StatusBadge from '../common/StatusBadge.jsx';
import { formatDate } from '../../utils/formatters.js';

export default function ApplicationTrackerTable({ rows, onSelect }) {
  return <>
    {rows.some(row => row.isSample) && <p className="notice" role="note">Sample records are fictional and do not represent real bid submissions. Update a sample to save your own application.</p>}
    <div className="table-scroll application-table"><table className="data-table"><thead><tr><th scope="col">Tender</th><th scope="col">Organization / source</th><th scope="col">Deadline</th><th scope="col">Current status</th><th scope="col">Last updated</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{rows.map(row => { const title = row.tender?.title || row.tenderTitle || 'Tender'; return <tr key={row.id}><td><strong>{title}</strong><span className="table-secondary">{row.isSample ? 'Sample record · ' : ''}{row.tender?.referenceNumber || row.referenceNumber || row.tenderId || 'Reference unavailable'}</span></td><td>{row.tender?.issuingAuthority || row.issuingAuthority || '—'}</td><td>{formatDate(row.tender?.submissionDeadline || row.submissionDeadline)}</td><td><StatusBadge status={row.status} /></td><td>{formatDate(row.updatedAt || row.submissionDate)}</td><td><button type="button" className="button button-tertiary" aria-label={`View details for ${title}`} onClick={() => onSelect(row)}>Details</button></td></tr>; })}</tbody></table></div>
    <div className="application-cards" aria-label="Tracked applications">{rows.map(row => { const title = row.tender?.title || row.tenderTitle || 'Tender'; return <article className="application-card" key={row.id}>
      <div className="application-card-heading"><div><h3>{title}</h3><span>{row.tender?.referenceNumber || row.referenceNumber || row.tenderId || 'Reference unavailable'}</span></div><StatusBadge status={row.status} /></div>
      <dl className="application-card-details"><div><dt>Organization / source</dt><dd>{row.tender?.issuingAuthority || row.issuingAuthority || '—'}</dd></div><div><dt>Deadline</dt><dd>{formatDate(row.tender?.submissionDeadline || row.submissionDeadline)}</dd></div><div><dt>Last updated</dt><dd>{formatDate(row.updatedAt || row.submissionDate)}</dd></div></dl>
      <button type="button" className="button button-secondary" aria-label={`View details for ${title}`} onClick={() => onSelect(row)}>View details</button>
    </article>; })}</div>
  </>;
}
