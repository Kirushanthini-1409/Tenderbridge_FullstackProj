import StatusBadge from '../common/StatusBadge.jsx';
import { Notice, Panel } from '../common/ProcurementUI.jsx';

export default function EligibilityBreakdown({ evaluation, onEvaluate, loading = false, extractedCriteria = null }) {
  if (!evaluation) {
    return (
      <Panel
        title="Eligibility Analysis"
        description="Screen your business profile against this tender's mandatory requirements."
      >
        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
          {extractedCriteria && <div style={{ textAlign: 'left', marginBottom: 18 }}>
            <h3 style={{ marginTop: 0 }}>Extracted eligibility criteria</h3>
            {extractedCriteria.minTurnover != null && <p>Minimum annual turnover: ₹{Number(extractedCriteria.minTurnover).toLocaleString('en-IN')} lakh</p>}
            {extractedCriteria.minExperienceYears != null && <p>Minimum experience: {extractedCriteria.minExperienceYears} years</p>}
            {extractedCriteria.requiredCertifications?.length > 0 && <p>Certifications: {extractedCriteria.requiredCertifications.join(', ')}</p>}
            {extractedCriteria.locationRestrictions?.length > 0 && <p>Location restrictions: {extractedCriteria.locationRestrictions.join(', ')}</p>}
            {extractedCriteria.minTurnover == null && extractedCriteria.minExperienceYears == null && !extractedCriteria.requiredCertifications?.length && !extractedCriteria.locationRestrictions?.length && <p>No specific eligibility criteria were identified in the provided text.</p>}
          </div>}
          <p style={{ color: '#56677b', fontSize: '13px', marginBottom: '16px' }}>
            Click below to run our deterministic eligibility screening using your saved business profile.
          </p>
          {onEvaluate && (
            <button
              type="button"
              className="button button-primary"
              onClick={onEvaluate}
              disabled={loading}
            >
              {loading ? 'Evaluating…' : 'Evaluate My Eligibility'}
            </button>
          )}
        </div>
      </Panel>
    );
  }

  const { status, summary, criteria = [], missingInformation = [], disclaimer } = evaluation;

  return (
    <Panel
      title="Eligibility Evaluation"
      description="Deterministic screening based on your business profile parameters."
      action={
        onEvaluate && (
          <button
            type="button"
            className="button button-secondary"
            onClick={onEvaluate}
            disabled={loading}
          >
            {loading ? 'Re-evaluating…' : 'Re-check Eligibility'}
          </button>
        )
      }
    >
      {/* Overall Status Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderRadius: '8px',
          background:
            status === 'Eligible'
              ? '#edf7f1'
              : status === 'Not Eligible'
              ? '#fdf2f2'
              : '#fef9ec',
          border: `1px solid ${
            status === 'Eligible'
              ? '#bfe5cf'
              : status === 'Not Eligible'
              ? '#f7c5c5'
              : '#f9e2af'
          }`,
          marginBottom: '20px',
        }}
      >
        <div>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#596d84', fontWeight: 700 }}>
            Overall Eligibility Result
          </span>
          <p style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: '#172b43' }}>
            {summary}
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          <StatusBadge status={status}>{status}</StatusBadge>
        </div>
      </div>

      {/* Criteria Breakdown Grid */}
      <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#102b48', margin: '0 0 12px' }}>
        Evaluated Criteria Breakdown
      </h3>

      <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
        {criteria.map((criterion, index) => {
          const isPass = criterion.status === 'PASS';
          const isFail = criterion.status === 'FAIL';
          return (
            <div
              key={index}
              style={{
                padding: '14px 16px',
                border: '1px solid #dfe5ec',
                borderRadius: '8px',
                background: '#ffffff',
                borderLeft: `4px solid ${
                  isPass ? '#21754e' : isFail ? '#a43b3b' : '#8a6416'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px', color: '#172b43' }}>{criterion.name}</strong>
                <StatusBadge status={criterion.status}>{criterion.status}</StatusBadge>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '8px',
                  fontSize: '11px',
                  color: '#53677f',
                  marginBottom: '8px',
                  background: '#f8fafb',
                  padding: '8px 12px',
                  borderRadius: '6px',
                }}
              >
                <div>
                  <span>Tender Required: </span>
                  <strong style={{ color: '#172b43' }}>
                    {Array.isArray(criterion.requiredValue)
                      ? criterion.requiredValue.join(', ')
                      : criterion.name.includes('Turnover')
                      ? `₹${criterion.requiredValue} Lakhs`
                      : criterion.name.includes('Experience')
                      ? `${criterion.requiredValue} Years`
                      : String(criterion.requiredValue ?? '—')}
                  </strong>
                </div>
                <div>
                  <span>Your Profile: </span>
                  <strong style={{ color: '#172b43' }}>
                    {criterion.businessValue === null || criterion.businessValue === undefined
                      ? 'Not specified in profile'
                      : Array.isArray(criterion.businessValue)
                      ? criterion.businessValue.join(', ') || 'None'
                      : criterion.name.includes('Turnover')
                      ? `₹${criterion.businessValue} Lakhs`
                      : criterion.name.includes('Experience')
                      ? `${criterion.businessValue} Years`
                      : String(criterion.businessValue)}
                  </strong>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: '#40536a', lineHeight: '1.45' }}>
                {criterion.explanation}
              </p>
            </div>
          );
        })}
      </div>

      {/* Missing Information Notice */}
      {missingInformation && missingInformation.length > 0 && (
        <Notice kind="warning">
          <strong>Missing or Unresolved Information:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
            {missingInformation.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Notice>
      )}

      {/* Disclaimer */}
      {disclaimer && (
        <p style={{ margin: '14px 0 0', fontSize: '11px', color: '#6b7b8f', lineHeight: '1.4' }}>
          <strong>Notice:</strong> {disclaimer}
        </p>
      )}
    </Panel>
  );
}
