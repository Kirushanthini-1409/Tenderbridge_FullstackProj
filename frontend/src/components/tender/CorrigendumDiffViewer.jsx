import { useState } from 'react';
import { EmptyState, Notice, Panel } from '../common/ProcurementUI.jsx';

/**
 * CorrigendumDiffViewer
 * Member 2 — Core Intelligence & Analysis Engine
 *
 * Side-by-side viewer for changes between an original tender notice and a
 * revised corrigendum version.  The component accepts either:
 *
 *   • A pre-computed `comparison` object from the backend's
 *     POST /api/v1/tenders/corrigendum/compare endpoint (when available), OR
 *   • Nothing — it shows a clear unavailable state when the backend endpoint
 *     is not present, rather than calling a non-existent URL.
 *
 * Props:
 *   comparison  {object|null}  Pre-computed diff; null or undefined = not yet run
 *   onCompare   {function|null} Called with (originalText, revisedText) when the
 *                               form is submitted; null = service unavailable
 *   loading     {boolean}      True while a comparison request is in flight
 *   error       {Error|null}   Last comparison error, if any
 */

function renderValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    if (!value.length) return 'None';
    return value
      .map(item => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .join('\n');
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

const colStyle = (tone) => ({
  margin: 0,
  padding: '10px 12px',
  borderRadius: '6px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontSize: '12px',
  lineHeight: '1.55',
  fontFamily: 'inherit',
  ...(tone === 'removed'
    ? { color: '#6f2b2b', background: '#fff7f7' }
    : { color: '#1f5f3b', background: '#f3fbf6' }),
});

const colHeadStyle = (tone) => ({
  margin: '0 0 5px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: tone === 'removed' ? '#6f2b2b' : '#1f5f3b',
});

export default function CorrigendumDiffViewer({
  comparison = null,
  onCompare = null,
  loading = false,
  error = null,
}) {
  const [originalText, setOriginalText] = useState('');
  const [revisedText, setRevisedText] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    onCompare?.(originalText, revisedText);
  }

  const changes = comparison?.changes ?? [];
  const serviceAvailable = typeof onCompare === 'function';

  return (
    <Panel
      title="Corrigendum &amp; Changes"
      description="Compare the original tender notice with a revised corrigendum to identify meaningful changes."
    >
      {serviceAvailable ? (
        /* ── Input form (backend compare endpoint is available) ── */
        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <span className="field-label">Original tender text</span>
              <textarea
                rows="6"
                value={originalText}
                onChange={event => setOriginalText(event.target.value)}
                placeholder="Paste the original tender notice text here."
                required
              />
            </div>
            <div className="field">
              <span className="field-label">Revised corrigendum text</span>
              <textarea
                rows="6"
                value={revisedText}
                onChange={event => setRevisedText(event.target.value)}
                placeholder="Paste the revised corrigendum text here."
                required
              />
            </div>
          </div>
          <div className="button-row">
            <button type="submit" className="button button-primary" disabled={loading}>
              {loading ? 'Comparing…' : 'Compare texts'}
            </button>
          </div>
        </form>
      ) : (
        /* ── Service-unavailable notice ── */
        <Notice kind="info">
          The corrigendum comparison service is not available at this endpoint. To track changes,
          paste text into the official tender portal or compare documents manually.
        </Notice>
      )}

      {/* Error from last request */}
      {error && (
        <Notice kind="error">
          {error?.message || 'The comparison could not be completed. Please try again.'}
        </Notice>
      )}

      {/* Disclaimer from the backend */}
      {comparison?.disclaimer && (
        <Notice kind="info">{comparison.disclaimer}</Notice>
      )}

      {/* Results */}
      {comparison && (
        changes.length > 0 ? (
          <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
            <p style={{ margin: 0, fontSize: '11px', color: '#596d84' }}>
              {changes.length} change{changes.length !== 1 ? 's' : ''} identified between the
              supplied texts.
            </p>
            {changes.map((change, index) => (
              <article
                key={`${change.field ?? index}-${index}`}
                style={{
                  padding: '14px 15px',
                  border: '1px solid #dfe5ec',
                  borderRadius: '9px',
                  background: '#fff',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#102b48' }}>
                  {change.label ?? change.field ?? `Change ${index + 1}`}
                </h3>
                <div className="form-grid">
                  <div>
                    <p style={colHeadStyle('removed')}>Previous</p>
                    <pre style={colStyle('removed')}>{renderValue(change.previousValue)}</pre>
                  </div>
                  <div>
                    <p style={colHeadStyle('added')}>Updated</p>
                    <pre style={colStyle('added')}>{renderValue(change.updatedValue)}</pre>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No changes detected">
            The two texts did not produce identifiable differences in deadline, eligibility
            criteria, required documents, or line-level content.
          </EmptyState>
        )
      )}
    </Panel>
  );
}
