/**
 * DeadlineCountdown
 * Member 2 — Core Intelligence & Analysis Engine
 *
 * Renders a compact, inline countdown to a tender submission deadline.
 * Intended to be placed inside a <dd> or alongside a date field — it
 * produces a single <span>, not a Panel, so the caller controls layout.
 *
 * Urgency levels:
 *   deadline-passed  — the deadline is in the past
 *   deadline-urgent  — 0–3 days remaining  (red)
 *   deadline-soon    — 4–14 days remaining (amber)
 *   deadline-ok      — 15+ days remaining  (green)
 *   deadline-unknown — no deadline provided or unparseable date
 *
 * Props:
 *   deadline  {string|Date|null}  ISO date/datetime string or Date object
 *   label     {string}            Accessible title attribute (default: 'Submission deadline')
 */

const URGENCY = {
  passed:  { label: 'Deadline passed', color: '#973c3c', bg: '#fbf0ef', border: '#f0dada' },
  urgent:  { color: '#973c3c', bg: '#fbf0ef', border: '#f0dada' },
  soon:    { color: '#805f1c', bg: '#fbf6e9', border: '#efe4c3' },
  ok:      { color: '#286847', bg: '#eff7f2', border: '#dcece2' },
  unknown: { label: 'No deadline', color: '#627286', bg: '#f2f4f6', border: '#e2e6ea' },
};

const spanStyle = ({ color, bg, border }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '4px 8px',
  borderRadius: '5px',
  border: `1px solid ${border}`,
  background: bg,
  color,
  fontSize: '11px',
  fontWeight: 650,
  whiteSpace: 'nowrap',
});

export default function DeadlineCountdown({ deadline, label = 'Submission deadline' }) {
  if (!deadline) {
    const s = URGENCY.unknown;
    return (
      <span style={spanStyle(s)} title={label}>
        <Dot color={s.color} />
        No deadline
      </span>
    );
  }

  const target = new Date(deadline).getTime();

  if (Number.isNaN(target)) {
    const s = URGENCY.unknown;
    return (
      <span style={spanStyle(s)} title={label}>
        <Dot color={s.color} />
        Invalid date
      </span>
    );
  }

  const diffMs = target - Date.now();

  if (diffMs < 0) {
    const s = URGENCY.passed;
    return (
      <span style={spanStyle(s)} title={label}>
        <Dot color={s.color} />
        {s.label}
      </span>
    );
  }

  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const s = URGENCY.urgent;
    return (
      <span style={spanStyle(s)} title={label}>
        <Dot color={s.color} />
        Due today
      </span>
    );
  }

  if (diffDays <= 3) {
    const s = URGENCY.urgent;
    return (
      <span style={spanStyle(s)} title={label}>
        <Dot color={s.color} />
        {diffDays} day{diffDays !== 1 ? 's' : ''} left
      </span>
    );
  }

  if (diffDays <= 14) {
    const s = URGENCY.soon;
    return (
      <span style={spanStyle(s)} title={label}>
        <Dot color={s.color} />
        {diffDays} days left
      </span>
    );
  }

  const s = URGENCY.ok;
  return (
    <span style={spanStyle(s)} title={label}>
      <Dot color={s.color} />
      {diffDays} days left
    </span>
  );
}

/** Small coloured dot used as a visual indicator inside the badge. */
function Dot({ color }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
