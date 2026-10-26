import { Link } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge.jsx';
import { formatDate } from '../../utils/formatters.js';
export default function TenderCard({ tender }) {
  const ref = tender.id || tender.referenceNumber;
  return <article className="opportunity-card"><div className="opportunity-card-top"><span className="opportunity-category">{tender.category || 'Procurement'}</span><StatusBadge status={tender.status || 'ACTIVE'} /></div><h3>{tender.title}</h3><p className="opportunity-source">{tender.issuingAuthority || 'Authority not specified'}</p><dl className="opportunity-details"><div><dt>Reference</dt><dd>{tender.referenceNumber || '—'}</dd></div><div><dt>Deadline</dt><dd>{formatDate(tender.submissionDeadline)}</dd></div><div><dt>Value</dt><dd>{tender.estimatedValue == null ? 'Not listed' : `₹${Number(tender.estimatedValue).toLocaleString('en-IN')}`}</dd></div></dl><Link className="button button-primary" to={`/business/tenders/${encodeURIComponent(ref)}`}>View opportunity</Link></article>;
}
