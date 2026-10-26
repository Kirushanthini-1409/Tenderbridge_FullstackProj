import { useEffect, useState } from 'react';
import { PageHeader, Panel, Notice, LoadingState, EmptyState } from '../../components/common/ProcurementUI.jsx';
import { documentVaultService } from '../../services/procurementService.js';
import { explainError } from '../../services/api.js';

const DOCUMENT_CATEGORIES = [
  { value: 'ALL', label: 'All Document Types' },
  { value: 'GST_CERTIFICATE', label: 'GST Certificate' },
  { value: 'COMPANY_REGISTRATION', label: 'Company Registration / Incorporation' },
  { value: 'TURNOVER_CERTIFICATE', label: 'Turnover / CA Certificate' },
  { value: 'EXPERIENCE_CERTIFICATE', label: 'Past Experience / Completion Certificate' },
  { value: 'ISO_CERTIFICATION', label: 'ISO / Quality Certification' },
  { value: 'MSME_REGISTRATION', label: 'MSME / Udyam Certificate' },
  { value: 'FINANCIAL_STATEMENT', label: 'Financial Statement / Balance Sheet' },
  { value: 'OTHER', label: 'Other Document' },
];

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function DocumentVault() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Upload modal / form state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('GST_CERTIFICATE');
  const [uploading, setUploading] = useState(false);

  // Edit / Replace modal state
  const [editingDoc, setEditingDoc] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [updating, setUpdating] = useState(false);

  // Selection state (for reusing documents across tenders)
  const [selectedDocIds, setSelectedDocIds] = useState(new Set());

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const res = await documentVaultService.list();
      setDocuments(res?.items || []);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    if (!fileToUpload) {
      setError('Please select a file to upload.');
      return;
    }
    if (fileToUpload.size > 8 * 1024 * 1024) {
      setError('File is too large. Maximum permitted size is 8 MB.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await documentVaultService.upload(fileToUpload, {
        name: docTitle.trim() || fileToUpload.name.replace(/\.[^/.]+$/, ''),
        category: docCategory,
      });
      setSuccessMessage(`Document "${fileToUpload.name}" stored securely in your vault.`);
      setUploadOpen(false);
      setFileToUpload(null);
      setDocTitle('');
      await loadDocuments();
    } catch (err) {
      setError(explainError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    setError(null);
    try {
      const blob = await documentVaultService.download(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || `${doc.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(explainError(err));
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Are you sure you want to delete "${doc.name}" from your vault?`)) {
      return;
    }
    setError(null);
    setSuccessMessage(null);
    try {
      await documentVaultService.delete(doc.id);
      setSuccessMessage(`Document "${doc.name}" removed from vault.`);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      setSelectedDocIds(prev => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    } catch (err) {
      setError(explainError(err));
    }
  }

  function startEdit(doc) {
    setEditingDoc(doc);
    setEditTitle(doc.name);
    setEditCategory(doc.category);
  }

  async function handleUpdate(e) {
    e.preventDefault();
    if (!editingDoc) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await documentVaultService.update(editingDoc.id, {
        name: editTitle.trim(),
        category: editCategory,
      });
      setSuccessMessage('Document details updated.');
      setDocuments(prev => prev.map(d => d.id === editingDoc.id ? { ...d, ...res.item } : d));
      setEditingDoc(null);
    } catch (err) {
      setError(explainError(err));
    } finally {
      setUpdating(false);
    }
  }

  function toggleSelect(id) {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredDocs = documents.filter(doc => {
    const matchesCategory = selectedCategory === 'ALL' || doc.category === selectedCategory;
    const matchesSearch = !search ||
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.fileName.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="document-vault-page">
      <PageHeader
        eyebrow="BUSINESS VAULT"
        title="Secure Document Vault"
        description="Store and organize reusable compliance documents, registration certificates, and past performance records for direct attachment to tenders."
        action={
          <button
            type="button"
            className="button button-primary"
            onClick={() => setUploadOpen(true)}
          >
            + Upload Document
          </button>
        }
      />

      {error && <Notice kind="error">{error}</Notice>}
      {successMessage && <Notice kind="info">{successMessage}</Notice>}

      {/* Security & Access Guarantee Banner */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: '#1e40af',
        }}
      >
        <span style={{ fontSize: '18px' }}>🔒</span>
        <span>
          <strong>Encrypted Private Storage:</strong> Vault files are stored in PostgreSQL with row-level ownership. They are never published publicly and can only be downloaded by your authenticated account.
        </span>
      </div>

      {/* Filter and Search Bar */}
      <Panel>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '12px', flex: 1, minWidth: '280px' }}>
            <input
              type="text"
              placeholder="Search documents by name or filename…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px',
                background: '#fff',
              }}
            >
              {DOCUMENT_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {selectedDocIds.size > 0 && (
              <span style={{ marginRight: '12px', fontWeight: 600, color: '#1d4ed8' }}>
                {selectedDocIds.size} document{selectedDocIds.size > 1 ? 's' : ''} selected
              </span>
            )}
            <span>Total: {filteredDocs.length} of {documents.length} files</span>
          </div>
        </div>
      </Panel>

      {/* Document List / Table */}
      {loading ? (
        <LoadingState label="Loading document vault…" />
      ) : filteredDocs.length === 0 ? (
        <EmptyState
          title="No documents found"
          description={
            documents.length === 0
              ? 'Your document vault is currently empty. Upload your company registration, GST certificate, or turnover reports to easily reuse them in tenders.'
              : 'No documents match your current filter criteria.'
          }
          action={
            documents.length === 0 && (
              <button
                type="button"
                className="button button-primary"
                onClick={() => setUploadOpen(true)}
              >
                Upload your first document
              </button>
            )
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedDocIds.size === filteredDocs.length && filteredDocs.length > 0}
                    onChange={e => {
                      if (e.target.checked) setSelectedDocIds(new Set(filteredDocs.map(d => d.id)));
                      else setSelectedDocIds(new Set());
                    }}
                    title="Select all"
                  />
                </th>
                <th>Document Name & File</th>
                <th>Category</th>
                <th>Size & Format</th>
                <th>Uploaded</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => {
                const categoryObj = DOCUMENT_CATEGORIES.find(c => c.value === doc.category);
                const isSelected = selectedDocIds.has(doc.id);
                return (
                  <tr key={doc.id} style={{ background: isSelected ? '#f0f7ff' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(doc.id)}
                      />
                    </td>
                    <td>
                      <strong style={{ fontSize: '13px', color: '#0f172a' }}>{doc.name}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>📄</span>
                        <span>{doc.fileName}</span>
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#f1f5f9',
                          color: '#334155',
                        }}
                      >
                        {categoryObj?.label || doc.category}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: '#334155' }}>{formatBytes(doc.fileSize)}</span>
                      <small style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>
                        {doc.mimeType?.split('/')[1]?.toUpperCase() || 'PDF'}
                      </small>
                    </td>
                    <td>
                      <span style={{ fontSize: '12px', color: '#475569' }}>{formatDate(doc.createdAt)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={() => handleDownload(doc)}
                          title="Download file securely"
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="button button-tertiary"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => startEdit(doc)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button-danger"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => handleDelete(doc)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {uploadOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: '16px',
          }}
          role="dialog"
          aria-labelledby="upload-modal-title"
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 id="upload-modal-title" style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                Upload to Document Vault
              </h3>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpload}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Document Title / Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GST Registration Certificate 2024-25"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Document Type / Category
                </label>
                <select
                  value={docCategory}
                  onChange={e => setDocCategory(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                >
                  {DOCUMENT_CATEGORIES.filter(c => c.value !== 'ALL').map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  File (PDF, PNG, JPG — Max 8 MB)
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,image/png,image/jpeg,.doc,.docx"
                  onChange={e => setFileToUpload(e.target.files?.[0] || null)}
                  style={{ width: '100%', padding: '8px 0', fontSize: '13px' }}
                />
                {fileToUpload && (
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#059669' }}>
                    Selected: {fileToUpload.name} ({formatBytes(fileToUpload.size)})
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setUploadOpen(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={uploading}
                >
                  {uploading ? 'Storing in Vault…' : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingDoc && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: '16px',
          }}
          role="dialog"
          aria-labelledby="edit-modal-title"
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 id="edit-modal-title" style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                Edit Document Information
              </h3>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdate}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Document Category
                </label>
                <select
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                >
                  {DOCUMENT_CATEGORIES.filter(c => c.value !== 'ALL').map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setEditingDoc(null)}
                  disabled={updating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={updating}
                >
                  {updating ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
