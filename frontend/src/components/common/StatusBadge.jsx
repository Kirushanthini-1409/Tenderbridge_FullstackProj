import { getStatusTone, humanize } from '../../utils/formatters.js';

export default function StatusBadge({ status, children }) {
  const label = children || humanize(status || 'Unknown');
  return <span className={`status-badge status-${getStatusTone(status)}`}><span className="status-dot" aria-hidden="true" />{label}</span>;
}
