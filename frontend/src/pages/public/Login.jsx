import React from 'react';
import { useLocation } from 'react-router-dom';
import BusinessLogin from './BusinessLogin.jsx';
import OrgLogin from './OrgLogin.jsx';
import AdminLogin from './AdminLogin.jsx';

export default function Login() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const requestedRole = searchParams.get('role')?.toUpperCase();

  if (requestedRole === 'ORGANIZATION' || requestedRole === 'ORG') {
    return <OrgLogin />;
  }
  if (requestedRole === 'ADMIN') {
    return <AdminLogin />;
  }

  return <BusinessLogin />;
}
