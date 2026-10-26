import { Notice, Panel } from '../common/ProcurementUI.jsx';
import { formatDate } from '../../utils/formatters.js';

export default function AISummaryCard({ summary, metadata = {}, missingInformation = [], source }) {
  const formattedValue = metadata.estimatedValue
    ? `₹${(metadata.estimatedValue / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Lakhs`
    : 'Not specified';

  return (
    <Panel
      title="Tender Summary & Extracted Scope"
      description="Structured summary extracted from the procurement document."
      action={
        source && (
          <span className="nav-group-label" style={{ fontSize: '10px' }}>
            Source: {source === 'GEMINI_AI' ? 'Google Gemini' : 'Rule-based Parser'}
          </span>
        )
      }
    >
      <div style={{ marginBottom: '20px', lineHeight: '1.6', fontSize: '13px', color: '#253a52' }}>
        <p>{summary || 'No summary text available.'}</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <article className="stat-card">
          <span className="stat-label">Category</span>
          <strong className="stat-value" style={{ fontSize: '16px', marginTop: '4px' }}>
            {metadata.category || '—'}
          </strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Issuing Authority</span>
          <strong className="stat-value" style={{ fontSize: '14px', marginTop: '4px', wordBreak: 'break-word' }}>
            {metadata.issuingAuthority || '—'}
          </strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Estimated Value</span>
          <strong className="stat-value" style={{ fontSize: '16px', marginTop: '4px' }}>
            {formattedValue}
          </strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Submission Deadline</span>
          <strong className="stat-value" style={{ fontSize: '14px', marginTop: '4px' }}>
            {metadata.submissionDeadline ? formatDate(metadata.submissionDeadline) : '—'}
          </strong>
        </article>
      </div>

      {missingInformation && missingInformation.length > 0 && (
        <Notice kind="warning">
          <strong>Terms Not Explicitly Found:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
            {missingInformation.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Notice>
      )}

      <p style={{ margin: '14px 0 0', fontSize: '11px', color: '#6b7b8f' }}>
        <em>Note: This summary is generated from available document text to assist your initial screening. Confirm all technical specifications with the official tender notice.</em>
      </p>
    </Panel>
  );
}
