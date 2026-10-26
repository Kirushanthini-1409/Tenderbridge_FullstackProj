import { request, requestBlob } from './api.js';

// These routes are implemented by backend/src/app.js. Authenticated calls require
// setApiTokenProvider() to return the current Supabase access token.
export const applicationsService = {
  list: () => request('/api/v1/applications'),
  get: id => request(`/api/v1/applications/${encodeURIComponent(id)}`),
  listClarifications: id => request(`/api/v1/applications/${encodeURIComponent(id)}/clarifications`),
  respondToClarification: (id, clarificationId, message) => request(`/api/v1/applications/${encodeURIComponent(id)}/clarifications/${encodeURIComponent(clarificationId)}/messages`, { method: 'POST', body: { message } }),
  downloadSubmittedDocument: (id, documentId) => requestBlob(`/api/v1/applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/download`),
  createOrUpdate: application => {
    if (!application?.id || application?.status === 'SUBMITTED') {
      return request('/api/v1/applications', { method: 'POST', body: application });
    }
    return request(`/api/v1/applications/${encodeURIComponent(application.id)}`, { method: 'PUT', body: application });
  },
  submit: application => request('/api/v1/applications', { method: 'POST', body: { ...application, status: 'SUBMITTED' } }),
  withdraw: (id, reason) => request(`/api/v1/applications/${encodeURIComponent(id)}/withdraw`, { method: 'POST', body: { reason } }),
};

export const savedOpportunitiesService = {
  list: () => request('/api/v1/saved-opportunities'),
  acknowledge: tenderId => request(`/api/v1/saved-opportunities/${encodeURIComponent(tenderId)}/acknowledge`, { method: 'POST', body: {} }),
  toggle: tenderId => request(`/api/v1/saved-opportunities/${encodeURIComponent(tenderId)}`, { method: 'DELETE' }),
  save: tenderId => request(`/api/v1/saved-opportunities/${encodeURIComponent(tenderId)}`, { method: 'POST', body: {} }),
};

export const verificationRequestService = {
  submit: body => request('/api/v1/verification-requests', { method: 'POST', body }),
};

export const partnerDirectoryService = {
  listForTender: tenderId => request(`/api/v1/jv/${encodeURIComponent(tenderId)}`),
  publishForTender: (tenderId, body) => request(`/api/v1/jv/${encodeURIComponent(tenderId)}`, { method: 'POST', body }),
  list: () => request('/api/v1/jv-partners'),
  listSaved: () => request('/api/v1/jv-partners/saved'),
  save: profileId => request(`/api/v1/jv-partners/saved/${encodeURIComponent(profileId)}`, { method: 'POST', body: {} }),
  removeSaved: profileId => request(`/api/v1/jv-partners/saved/${encodeURIComponent(profileId)}`, { method: 'DELETE' }),
};

export const organizationProcurementService = {
  listMine: () => request('/api/v1/organization/procurements'),
  create: body => request('/api/v1/organization/procurements', { method: 'POST', body }),
  update: (id, body) => request(`/api/v1/organization/procurements/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  listApplications: (id, filters = {}) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const suffix = query.size ? `?${query.toString()}` : '';
    return request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/applications${suffix}`);
  },
  getResults: id => request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/results`),
  publishResults: (id, body) => request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/results`, { method: 'POST', body }),
  reviewApplication: (id, applicationId, status) => request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/applications/${encodeURIComponent(applicationId)}`, { method: 'PATCH', body: { status } }),
  updateInternalNotes: (id, applicationId, reviewNotes) => request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/applications/${encodeURIComponent(applicationId)}/internal-notes`, { method: 'PATCH', body: { reviewNotes } }),
  createClarification: (id, applicationId, body) => request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/applications/${encodeURIComponent(applicationId)}/clarifications`, { method: 'POST', body }),
  listClarifications: applicationId => request(`/api/v1/applications/${encodeURIComponent(applicationId)}/clarifications`),
  closeClarification: (id, applicationId, clarificationId) => request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/applications/${encodeURIComponent(applicationId)}/clarifications/${encodeURIComponent(clarificationId)}/close`, { method: 'PATCH', body: {} }),
  downloadSubmittedDocument: (applicationId, documentId) => requestBlob(`/api/v1/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/download`),
  listTenderFaqs: tenderId => request(`/api/v1/tenders/${encodeURIComponent(tenderId)}/faqs`),
  createTenderFaq: (procurementId, body) => request(`/api/v1/organization/procurements/${encodeURIComponent(procurementId)}/faqs`, { method: 'POST', body }),
  reviewTenderFaq: (procurementId, faqId, body) => request(`/api/v1/organization/procurements/${encodeURIComponent(procurementId)}/faqs/${encodeURIComponent(faqId)}`, { method: 'PATCH', body }),
  verificationStatus: () => request('/api/v1/organization/verification-status'),
  uploadPdf: async (id, file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return request(`/api/v1/organization/procurements/${encodeURIComponent(id)}/pdf`, {
      method: 'POST', body: { fileName: file.name, fileBase64: btoa(binary) },
    });
  },
  openPdf: id => requestBlob(`/api/v1/organization/procurements/${encodeURIComponent(id)}/pdf`),
  openTenderPdf: id => requestBlob(`/api/v1/tenders/${encodeURIComponent(id)}/pdf`),
};

export const approvalService = {
  list: () => request('/api/v1/admin/verification-requests'),
  decide: (id, body) => request(`/api/v1/admin/verification-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  overview: () => request('/api/v1/admin/overview'),
  auditEvents: () => request('/api/v1/admin/audit-events'),
  getTender: id => request(`/api/v1/admin/tenders/${encodeURIComponent(id)}`),
  updateTender: (id, body) => request(`/api/v1/admin/tenders/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  archiveTender: id => request(`/api/v1/admin/tenders/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'ARCHIVED' } }),
  restoreTender: id => request(`/api/v1/admin/tenders/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status: 'ACTIVE' } }),
};

export const profileService = {
  get: () => request('/api/v1/profile'),
  update: body => request('/api/v1/profile', { method: 'PUT', body }),
  save: body => request('/api/v1/profile', { method: 'PUT', body }),
};

export const documentVaultService = {
  list: () => request('/api/v1/business/documents'),
  get: id => request(`/api/v1/business/documents/${encodeURIComponent(id)}`),
  upload: async (file, { name, category }) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return request('/api/v1/business/documents', {
      method: 'POST',
      body: {
        name: name || file.name.replace(/\.[^/.]+$/, ''),
        category: category || 'OTHER',
        fileName: file.name,
        fileBase64: btoa(binary),
        mimeType: file.type || 'application/pdf',
      },
    });
  },
  download: id => requestBlob(`/api/v1/business/documents/${encodeURIComponent(id)}/download`),
  update: (id, body) => request(`/api/v1/business/documents/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  delete: id => request(`/api/v1/business/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
