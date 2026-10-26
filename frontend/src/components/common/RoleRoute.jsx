import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { dashboardForRole, normalizeRole } from '../../utils/roles.js';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function RoleRoute({ roles, children }) {
  const { loading, session, role, roleResolved } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingSpinner label="Checking your session…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!roleResolved) return <Navigate to="/login" replace state={{ roleCheckFailed: true }} />;
  if (!roles.includes(normalizeRole(role))) return <Navigate to={dashboardForRole(role)} replace />;
  return children || <Outlet />;
}
