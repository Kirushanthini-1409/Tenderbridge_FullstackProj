import { formatDate } from '../../utils/formatters.js';

export default function PartnerCompanyCard({ partner, onView }) {
  const capabilities = String(partner.offeredCapabilities || '').split(/[,;\n]/).map(value => value.trim()).filter(Boolean);

  return <article className="partner-card">
    <div className="partner-card-header">
      <span className="company-monogram" aria-hidden="true">{(partner.companyName || 'C').slice(0, 1).toUpperCase()}</span>
      <div><p className="partner-card-kicker">Partner listing</p><h3>{partner.companyName || 'Company'}</h3></div>
    </div>
    <div className="partner-capability-section">
      <span className="profile-label">Capabilities offered</span>
      {capabilities.length ? <ul className="capability-list">{capabilities.map((capability, index) => <li key={`${capability}-${index}`}>{capability}</li>)}</ul> : <p className="partner-capabilities-empty">No capabilities supplied.</p>}
    </div>
    <p className="partner-card-date">Listed {formatDate(partner.createdAt)}</p>
    <div className="partner-card-actions">
      <button type="button" className="button button-secondary" onClick={() => onView(partner)}>View profile</button>
      {partner.contactEmail && <a className="button button-primary" href={`mailto:${partner.contactEmail}`}>Contact company</a>}
    </div>
  </article>;
}
