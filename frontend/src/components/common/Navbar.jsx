import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { dashboardForRole, normalizeRole } from '../../utils/roles.js';

const groups = [
  { title: 'BUSINESS', links: [
    { to: '/business/dashboard', label: 'Overview', icon: 'overview' },
    { to: '/business/tenders', label: 'Tender discovery', icon: 'list' },
    { to: '/business/applications', label: 'Applications', icon: 'applications' },
    { to: '/business/saved', label: 'Saved opportunities', icon: 'saved' },
    { to: '/business/vault', label: 'Document vault', icon: 'vault' },
    { to: '/business/partners', label: 'JV partners', icon: 'partners' },
    { to: '/business/profile', label: 'Business profile', icon: 'overview' },
  ] },
  { title: 'ORGANIZATION', links: [
    { to: '/org/dashboard', label: 'Overview', icon: 'overview' },
    { to: '/org/profile', label: 'Organization profile', icon: 'overview' },
    { to: '/org/procurements', label: 'Manage listings', icon: 'list' },
    { to: '/org/procurements/new', label: 'Create procurement', icon: 'create' },
  ] },
  { title: 'ADMIN', links: [
    { to: '/admin', label: 'Platform overview', icon: 'overview' },
    { to: '/admin/verification-requests', label: 'Verification queue', icon: 'approvals' },
    { to: '/admin/tenders', label: 'Tender catalogue', icon: 'list' },
    { to: '/admin/audit', label: 'Audit history', icon: 'applications' },
  ] },
  { title: 'VERIFICATION', links: [
    { to: '/verification/submit', label: 'Request verification', icon: 'approvals' },
  ] },
  { title: 'ACCOUNT', links: [ { to: '/login', label: 'Sign in', icon: 'overview' }, { to: '/register', label: 'Register', icon: 'create' } ] },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { session, role, signOut } = useAuth();
  const navigate = useNavigate();
  const normalizedRole = normalizeRole(role);
  const activeGroup = normalizedRole;
  const visibleGroups = session
    ? groups.filter(group => group.title === activeGroup || (group.title === 'VERIFICATION' && normalizedRole === 'BUSINESS'))
    : groups.filter(group => group.title === 'ACCOUNT');

  async function logout() {
    try { await signOut(); navigate('/login', { replace: true }); }
    catch { navigate(dashboardForRole(role), { replace: true }); }
  }
  return <aside className="site-header">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Link className="brand" to={session ? dashboardForRole(role) : '/login'} aria-label="TenderBridge home">
      <span className="brand-mark" aria-hidden="true">TB</span>
      <span className="brand-copy"><strong>TenderBridge</strong><small>Procurement workspace</small></span>
    </Link>
    <div className="sidebar-section-label">WORKSPACE</div>
    <button className="menu-toggle" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(value => !value)}>{open ? 'Close menu' : 'Menu'}</button>
    <nav id="primary-navigation" className={open ? 'primary-nav is-open' : 'primary-nav'} aria-label="Main navigation">
      {visibleGroups.map(group => <div className="nav-group" key={group.title}>
        <span className="nav-group-label">{group.title}</span>
        <div className="nav-group-links">{group.links.map(({ to, label, icon }) => <NavLink key={to} to={to} end onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><NavIcon name={icon} /><span>{label}</span></NavLink>)}</div>
      </div>)}
      {session && <div className="nav-group"><span className="nav-group-label">ACCOUNT</span><div className="nav-group-links"><span className="nav-link" title={session.user?.email}>{session.user?.email || 'Signed in'}</span><button type="button" className="nav-link" onClick={logout}>Sign out</button></div></div>}
    </nav>
  </aside>;
}

function NavIcon({ name }) {
  const paths = {
    applications: <><rect x="5" y="3.5" width="14" height="17" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    saved: <path d="M6.5 4.75A1.75 1.75 0 0 1 8.25 3h7.5a1.75 1.75 0 0 1 1.75 1.75V21l-5.5-3.5L6.5 21V4.75Z" />,
    vault: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 15v2M12 7v2M7 12h2M15 12h2" /></>,
    partners: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 20c.4-3.3 2.2-5 5.5-5s5.1 1.7 5.5 5M15 15c2.9-.2 4.8 1.2 5.5 4" /></>,
    overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    create: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M12 8v8M8 12h8" /></>,
    approvals: <><path d="M12 3 19 6v5c0 4.6-2.8 7.8-7 10-4.2-2.2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
