export function getRows(data, keys = ['items', 'data', 'applications', 'tenders', 'partners', 'listings', 'requests']) {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, options).format(date);
}

export function getStatusTone(status = '') {
  const normalized = status.toUpperCase();
  if (['APPROVED', 'PUBLISHED', 'ACTIVE', 'RESULT_RELEASED', 'COMPLETED', 'ELIGIBLE', 'PASS'].includes(normalized)) return 'success';
  if (['PENDING', 'UNDER_EVALUATION', 'DRAFT', 'IN_REVIEW', 'POTENTIALLY_ELIGIBLE', 'POTENTIALLY ELIGIBLE', 'UNKNOWN'].includes(normalized)) return 'warning';
  if (['REJECTED', 'CLOSED', 'CANCELLED', 'NOT_ELIGIBLE', 'NOT ELIGIBLE', 'FAIL'].includes(normalized)) return 'danger';
  if (['INTERESTED', 'SUBMITTED'].includes(normalized)) return 'info';
  return 'neutral';
}

export function humanize(value = '') {
  return value.toLowerCase().replaceAll('_', ' ').replace(/(^|\s)(\S)/g, (_match, space, character) => `${space}${character.toUpperCase()}`);
}
