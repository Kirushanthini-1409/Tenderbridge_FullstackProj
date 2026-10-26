import { useMemo, useState } from 'react';
import { EmptyState, Notice, Panel } from '../common/ProcurementUI.jsx';

/**
 * RequiredDocChecklist
 * Member 2 — Core Intelligence & Analysis Engine
 *
 * Displays the document list extracted from a tender notice, grouped by
 * category and labelled mandatory or optional.
 *
 * THIS IS A LOCAL PREPARATION CHECKLIST ONLY.
 * TenderBridge does not upload, validate, or verify document ownership or
 * compliance. Users must submit through the official tender portal.
 *
 * Props:
 *   documents  {Array}   Items from the extractor: { name, category, mandatory }
 *                        Plain strings are also accepted and treated as mandatory.
 *   loading    {boolean} When true, shows a loading placeholder.
 */

/** Normalise each entry regardless of whether it's a string or an object. */
function normalise(doc, index) {
  if (typeof doc === 'string') {
    return { id: `str-${index}`, name: doc, category: 'General', mandatory: true };
  }
  return {
    id: `${doc?.name ?? 'doc'}-${doc?.category ?? 'general'}-${index}`,
    name: doc?.name || 'Unnamed document',
    category: doc?.category || 'General',
    mandatory: doc?.mandatory !== false,  // default to mandatory unless explicitly false
  };
}

/** The order in which category sections are shown. Others are appended alphabetically. */
const CATEGORY_ORDER = ['Financial', 'Technical', 'Statutory', 'Legal', 'General'];

function sortedCategories(grouped) {
  const known = CATEGORY_ORDER.filter(c => grouped[c]);
  const rest  = Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...rest];
}

export default function RequiredDocChecklist({ documents = [], loading = false }) {
  const [checked, setChecked] = useState({});

  const items = useMemo(() => documents.map(normalise), [documents]);

  const grouped = useMemo(
    () =>
      items.reduce((acc, doc) => {
        acc[doc.category] ??= [];
        acc[doc.category].push(doc);
        return acc;
      }, {}),
    [items],
  );

  const categories = sortedCategories(grouped);
  const completedCount = items.filter(doc => checked[doc.id]).length;
  const totalCount = items.length;

  function toggle(id, value) {
    setChecked(prev => ({ ...prev, [id]: value }));
  }

  return (
    <Panel
      title="Required Documents"
      description="Documents identified in the tender text. Verify requirements against the official notice before submitting."
      action={
        totalCount > 0 && (
          <span
            style={{
              color: '#53677f',
              fontSize: '11px',
              fontWeight: 650,
              whiteSpace: 'nowrap',
            }}
          >
            {completedCount}/{totalCount} checked
          </span>
        )
      }
    >
      {loading ? (
        <p style={{ color: '#66788d', fontSize: '12px', margin: 0 }}>
          Loading document requirements…
        </p>
      ) : totalCount === 0 ? (
        <EmptyState title="No document requirements found">
          The available tender data does not list required documents. Check the official notice
          before preparing a bid.
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: '18px' }}>
          <Notice kind="info">
            This is a local preparation checklist only — TenderBridge does not upload, validate,
            or approve these documents.
          </Notice>

          {categories.map(category => (
            <section key={category}>
              {/* Category heading */}
              <h3
                style={{
                  margin: '0 0 9px',
                  color: '#102b48',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '.02em',
                  textTransform: 'uppercase',
                }}
              >
                {category}
              </h3>

              <div style={{ display: 'grid', gap: '7px' }}>
                {grouped[category].map(doc => {
                  const isChecked = Boolean(checked[doc.id]);
                  return (
                    <label
                      key={doc.id}
                      style={{
                        display: 'flex',
                        gap: '11px',
                        alignItems: 'flex-start',
                        padding: '11px 13px',
                        border: `1px solid ${isChecked ? '#c0d9c8' : '#dfe5ec'}`,
                        borderRadius: '8px',
                        background: isChecked ? '#f4fbf6' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'border-color .12s ease, background .12s ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => toggle(doc.id, e.target.checked)}
                        style={{ marginTop: '2px', flexShrink: 0 }}
                        aria-label={doc.name}
                      />
                      <span style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: 'block',
                            fontSize: '13px',
                            color: isChecked ? '#21754e' : '#172b43',
                            lineHeight: '1.4',
                            overflowWrap: 'anywhere',
                            textDecoration: isChecked ? 'line-through' : 'none',
                          }}
                        >
                          {doc.name}
                        </strong>
                        <MandatoryBadge mandatory={doc.mandatory} />
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Small inline badge showing mandatory / optional status. */
function MandatoryBadge({ mandatory }) {
  return mandatory ? (
    <span
      style={{
        display: 'inline-block',
        marginTop: '4px',
        padding: '2px 6px',
        borderRadius: '4px',
        background: '#fbf0ef',
        border: '1px solid #f0dada',
        color: '#973c3c',
        fontSize: '10px',
        fontWeight: 650,
      }}
    >
      Mandatory
    </span>
  ) : (
    <span
      style={{
        display: 'inline-block',
        marginTop: '4px',
        padding: '2px 6px',
        borderRadius: '4px',
        background: '#f2f4f6',
        border: '1px solid #e2e6ea',
        color: '#627286',
        fontSize: '10px',
        fontWeight: 650,
      }}
    >
      Optional / conditional
    </span>
  );
}
