import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import {
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  LoadingState,
  Modal,
  Notice,
  PageHeader,
  SearchField,
} from '../../components/common/ProcurementUI.jsx';
import { approvalService } from '../../services/procurementService.js';
import { tenderService } from '../../services/tenderService.js';
import { formatDate, getRows, humanize } from '../../utils/formatters.js';

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ManageTenders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Edit modal state
  const [editingTender, setEditingTender] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Status toggle busy state
  const [actionBusyId, setActionBusyId] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRows(getRows(await tenderService.list({ pageSize: 100 })));
    } catch (e) {
      setError(e.message || 'Could not load tender catalogue.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const statuses = useMemo(() => {
    const list = rows.map(r => r.status || 'ACTIVE').filter(Boolean);
    return [...new Set(list)].sort();
  }, [rows]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      const currentStatus = String(row.status || 'ACTIVE').toUpperCase();
      const textMatch = `${row.referenceNumber || ''} ${row.title || ''} ${row.category || ''} ${row.issuingAuthority || ''} ${row.location || ''}`.toLowerCase();
      const matchesSearch = !needle || textMatch.includes(needle);
      const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  function openEditModal(tender) {
    setSaveError(null);
    setEditingTender(tender);
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!editingTender || saving) return;

    const form = new FormData(event.currentTarget);
    const optionalText = name => String(form.get(name) || '').trim() || null;
    const optionalNumber = name => {
      const val = form.get(name);
      return val === '' || val === null ? null : Number(val);
    };
    const deadlineVal = form.get('submissionDeadline');
    const openingVal = form.get('openingDate');

    const payload = {
      title: String(form.get('title') || '').trim(),
      category: optionalText('category'),
      issuingAuthority: optionalText('issuingAuthority'),
      location: optionalText('location'),
      quantity: optionalText('quantity'),
      deliveryDuration: optionalText('deliveryDuration'),
      status: form.get('status') || 'ACTIVE',
      estimatedValue: optionalNumber('estimatedValue'),
      submissionDeadline: deadlineVal ? new Date(deadlineVal).toISOString() : null,
      openingDate: openingVal ? new Date(openingVal).toISOString() : null,
      officialLink: optionalText('officialLink'),
      description: optionalText('description'),
    };

    setSaving(true);
    setSaveError(null);
    try {
      await approvalService.updateTender(editingTender.id, payload);
      setSuccessNotice(`Tender "${payload.title}" updated successfully.`);
      setEditingTender(null);
      await load();
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(tender) {
    const isArchived = ['ARCHIVED', 'CLOSED'].includes(String(tender.status || '').toUpperCase());
    const newStatus = isArchived ? 'ACTIVE' : 'ARCHIVED';
    const actionLabel = isArchived ? 'restore' : 'archive';

    if (!window.confirm(`Are you sure you want to ${actionLabel} tender "${tender.title}"?`)) {
      return;
    }

    setActionBusyId(tender.id);
    setError('');
    setSuccessNotice('');
    try {
      if (isArchived) {
        await approvalService.restoreTender(tender.id);
        setSuccessNotice(`Tender "${tender.title}" restored to Active.`);
      } else {
        await approvalService.archiveTender(tender.id);
        setSuccessNotice(`Tender "${tender.title}" has been archived.`);
      }
      await load();
    } catch (err) {
      setError(err.message || `Failed to ${actionLabel} tender.`);
    } finally {
      setActionBusyId('');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION WORKSPACE"
        title="Tender catalogue"
        description="Review, update, and manage opportunities available to business users across the platform."
        action={
          <div className="button-row">
            <Link className="button button-primary" to="/admin/tenders/new">
              Add tender
            </Link>
            <button className="button button-secondary" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        }
      />

      {successNotice && <Notice kind="success">{successNotice}</Notice>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Published & Managed Opportunities</h2>
            <p>{visibleRows.length} opportunity records match your criteria</p>
          </div>
        </div>

        <FilterBar>
          <SearchField
            label="Search catalogue"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search reference, title, authority, or location..."
          />
          <Field label="Tender status">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="ALL">All statuses</option>
              {statuses.map(st => (
                <option key={st} value={st}>{humanize(st)}</option>
              ))}
            </select>
          </Field>
        </FilterBar>

        {loading ? (
          <LoadingState label="Loading tenders…" />
        ) : visibleRows.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Title & Category</th>
                  <th scope="col">Authority</th>
                  <th scope="col">Deadline</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => {
                  const isArchived = ['ARCHIVED', 'CLOSED'].includes(String(row.status || '').toUpperCase());
                  const isBusy = actionBusyId === row.id;
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.referenceNumber || '—'}</strong>
                      </td>
                      <td>
                        <strong>{row.title}</strong>
                        <span className="table-secondary">{row.category || 'Uncategorized'}</span>
                      </td>
                      <td>{row.issuingAuthority || 'Government Agency'}</td>
                      <td>{formatDate(row.submissionDeadline)}</td>
                      <td>
                        <StatusBadge status={row.status || 'ACTIVE'} />
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="button button-tertiary"
                            onClick={() => openEditModal(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button button-tertiary"
                            disabled={isBusy}
                            onClick={() => toggleArchive(row)}
                            style={{ color: isArchived ? '#059669' : '#dc2626' }}
                          >
                            {isBusy ? 'Saving…' : isArchived ? 'Restore' : 'Archive'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={rows.length ? 'No tenders match the filter' : 'No tenders yet'}>
            {rows.length
              ? 'Try adjusting your search or status filter.'
              : 'Add an opportunity to populate the catalogue for the demo.'}
          </EmptyState>
        )}
      </section>

      {/* In-App Edit Government Tender Modal */}
      {editingTender && (
        <Modal
          title={`Edit Tender: ${editingTender.referenceNumber || editingTender.title}`}
          description="Update catalogue specifications, key dates, or lifecycle status. Changes will be recorded in audit history."
          onClose={() => { if (!saving) setEditingTender(null); }}
        >
          <form className="form-stack" onSubmit={handleSaveEdit}>
            {saveError && <ErrorState error={saveError} />}

            <Field label="Reference Number">
              <input
                disabled
                value={editingTender.referenceNumber || '—'}
                style={{ background: '#f1f5f9', cursor: 'not-allowed' }}
              />
            </Field>

            <Field label="Tender Title">
              <input
                name="title"
                required
                maxLength={300}
                defaultValue={editingTender.title || ''}
              />
            </Field>

            <div className="form-grid">
              <Field label="Category">
                <input
                  name="category"
                  maxLength={100}
                  defaultValue={editingTender.category || ''}
                />
              </Field>
              <Field label="Issuing Authority">
                <input
                  name="issuingAuthority"
                  maxLength={200}
                  defaultValue={editingTender.issuingAuthority || ''}
                />
              </Field>
              <Field label="Location">
                <input
                  name="location"
                  maxLength={160}
                  defaultValue={editingTender.location || ''}
                />
              </Field>
              <Field label="Quantity">
                <input
                  name="quantity"
                  maxLength={120}
                  defaultValue={editingTender.quantity || ''}
                  placeholder="e.g. 500 units"
                />
              </Field>
              <Field label="Submission Deadline">
                <input
                  name="submissionDeadline"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(editingTender.submissionDeadline)}
                />
              </Field>
              <Field label="Bid Opening Date">
                <input
                  name="openingDate"
                  type="datetime-local"
                  defaultValue={toDateTimeLocal(editingTender.openingDate)}
                />
              </Field>
              <Field label="Delivery Duration">
                <input
                  name="deliveryDuration"
                  maxLength={160}
                  defaultValue={editingTender.deliveryDuration || ''}
                  placeholder="e.g. 60 days"
                />
              </Field>
              <Field label="Estimated Value (₹)">
                <input
                  name="estimatedValue"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editingTender.estimatedValue ?? ''}
                />
              </Field>
              <Field label="Catalogue Status">
                <select name="status" defaultValue={editingTender.status || 'ACTIVE'}>
                  <option value="ACTIVE">ACTIVE (Open for Bids)</option>
                  <option value="UPCOMING">UPCOMING (Not yet accepting bids)</option>
                  <option value="CLOSED">CLOSED (Deadline passed)</option>
                  <option value="ARCHIVED">ARCHIVED (Unpublished from catalogue)</option>
                </select>
              </Field>
              <Field label="Official Portal Link">
                <input
                  name="officialLink"
                  type="url"
                  defaultValue={editingTender.officialLink || ''}
                  placeholder="https://..."
                />
              </Field>
            </div>

            <Field label="Tender Description">
              <textarea
                name="description"
                rows={4}
                maxLength={10000}
                defaultValue={editingTender.description || ''}
                placeholder="Scope of work, project details, and requirements..."
              />
            </Field>

            <div className="dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                disabled={saving}
                onClick={() => setEditingTender(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={saving}
              >
                {saving ? 'Saving changes…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
