import React from 'react';
import { useLocation } from 'react-router-dom';
import BusinessRegister from './BusinessRegister.jsx';
import OrgRegister from './OrgRegister.jsx';

export default function Register() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const requestedRole = searchParams.get('role')?.toUpperCase();

  if (requestedRole === 'ORGANIZATION' || requestedRole === 'ORG') {
    return <OrgRegister />;
  }

  return <BusinessRegister />;
}
