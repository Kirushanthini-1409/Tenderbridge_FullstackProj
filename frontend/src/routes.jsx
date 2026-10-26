import { Navigate, Route, Routes } from 'react-router-dom';
import RoleRoute from './components/common/RoleRoute.jsx';
import PageErrorBoundary from './components/common/PageErrorBoundary.jsx';
import LandingPage from './pages/public/LandingPage.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import BusinessLogin from './pages/public/BusinessLogin.jsx';
import OrgLogin from './pages/public/OrgLogin.jsx';
import AdminLogin from './pages/public/AdminLogin.jsx';
import BusinessRegister from './pages/public/BusinessRegister.jsx';
import OrgRegister from './pages/public/OrgRegister.jsx';
import Unauthorized from './pages/public/Unauthorized.jsx';

import BusinessDashboard from './pages/business/BusinessDashboard.jsx';
import ApplicationTracker from './pages/business/ApplicationTracker.jsx';
import ApplicationWizard from './pages/business/ApplicationWizard.jsx';
import SavedOpportunities from './pages/business/SavedOpportunities.jsx';
import JVPartnerDirectory from './pages/business/JVPartnerDirectory.jsx';
import ProfileManagement from './pages/business/ProfileManagement.jsx';
import DocumentVault from './pages/business/DocumentVault.jsx';
import TenderListing from './pages/business/TenderListing.jsx';
import TenderDetails from './pages/business/TenderDetails.jsx';

import OrgDashboard from './pages/private_org/OrgDashboard.jsx';
import CreateProcurement from './pages/private_org/CreateProcurement.jsx';
import ManageListings from './pages/private_org/ManageListings.jsx';
import VerificationSubmission from './pages/business/VerificationSubmission.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import VerificationRequests from './pages/admin/VerificationRequests.jsx';
import ManageTenders from './pages/admin/ManageTenders.jsx';
import AddGovernmentTender from './pages/admin/AddGovernmentTender.jsx';
import AdminAuditLog from './pages/admin/AdminAuditLog.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Phase 1: Public Landing Page */}
      <Route path="/" element={<LandingPage />} />

      {/* Phase 1: Shared and Role-Specific Authentication Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/login/business" element={<BusinessLogin />} />
      <Route path="/login/organization" element={<OrgLogin />} />
      <Route path="/login/admin" element={<AdminLogin />} />
      <Route path="/admin/login" element={<Navigate to="/login/admin" replace />} />
      <Route path="/org/login" element={<Navigate to="/login/organization" replace />} />

      <Route path="/register" element={<Register />} />
      <Route path="/register/business" element={<BusinessRegister />} />
      <Route path="/register/organization" element={<OrgRegister />} />
      <Route path="/org/register" element={<Navigate to="/register/organization" replace />} />

      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Role-Protected Business Routes */}
      <Route element={<RoleRoute roles={['BUSINESS']} />}>
        <Route path="/business/dashboard" element={<BusinessDashboard />} />
        <Route path="/business/profile" element={<ProfileManagement />} />
        <Route path="/business/vault" element={<DocumentVault />} />
        <Route path="/business/tenders" element={<TenderListing />} />
        <Route path="/business/tenders/:id" element={<PageErrorBoundary pageName="Tender details and updates"><TenderDetails /></PageErrorBoundary>} />
        <Route path="/business/apply/:tenderId" element={<ApplicationWizard />} />
        <Route path="/business/applications/new" element={<ApplicationWizard />} />
        <Route path="/business/applications" element={<PageErrorBoundary pageName="Application Tracker"><ApplicationTracker /></PageErrorBoundary>} />
        <Route path="/business/saved" element={<SavedOpportunities />} />
        <Route path="/business/partners" element={<JVPartnerDirectory />} />
      </Route>

      {/* Role-Protected Organization Routes */}
      <Route element={<RoleRoute roles={['ORGANIZATION']} />}>
        <Route path="/org/dashboard" element={<OrgDashboard />} />
        <Route path="/org/profile" element={<VerificationSubmission />} />
        <Route path="/org/procurements" element={<ManageListings />} />
        <Route path="/org/procurements/new" element={<CreateProcurement />} />
      </Route>

      {/* Admin tools are available only after the trusted ADMIN role resolves. */}
      <Route element={<RoleRoute roles={['ADMIN']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/verification-requests" element={<VerificationRequests />} />
        <Route path="/admin/tenders" element={<ManageTenders />} />
        <Route path="/admin/tenders/new" element={<AddGovernmentTender />} />
        <Route path="/admin/audit" element={<AdminAuditLog />} />
      </Route>

      {/* Verification submission accessible to Business and Organization */}
      <Route element={<RoleRoute roles={['BUSINESS', 'ORGANIZATION']} />}>
        <Route path="/verification/submit" element={<VerificationSubmission />} />
      </Route>

      {/* Catch-all redirect to public landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
