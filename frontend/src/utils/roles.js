export function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase();
  if (role === 'ADMIN') return 'ADMIN';
  if (['ORGANIZATION', 'ORG', 'O'].includes(role)) return 'ORGANIZATION';
  return 'BUSINESS';
}

export function dashboardForRole(role) {
  switch (normalizeRole(role)) {
    case 'ADMIN': return '/admin';
    case 'ORGANIZATION': return '/org/dashboard';
    default: return '/business/dashboard';
  }
}
