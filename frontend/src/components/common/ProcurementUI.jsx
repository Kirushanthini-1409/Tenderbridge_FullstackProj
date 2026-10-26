import { useEffect, useId, useRef } from 'react';
import { ContractUnavailableError, explainError } from '../../services/api.js';

export function PageHeader({ eyebrow, title, description, action }) {
  return <header className="page-header"><div className="page-header-copy"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="page-header-action">{action}</div>}</header>;
}

export function Panel({ title, description, action, children, className = '' }) {
  return <section className={`panel ${className}`}><div className="panel-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function Field({ label, hint, children, className = '' }) {
  return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>;
}

export function SearchField({ label = 'Search', value, onChange, placeholder = 'Search…' }) {
  return <Field label={label} className="search-field"><input type="search" value={value} onChange={onChange} placeholder={placeholder} /></Field>;
}

export function FilterBar({ children }) {
  return <div className="filter-bar">{children}</div>;
}

export function Notice({ kind = 'info', children, action }) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}><span>{children}</span>{action}</div>;
}

export function ErrorState({ error, onRetry }) {
  const title = error instanceof ContractUnavailableError || error?.status === 0 ? 'Backend integration pending' : 'We couldn’t load this information';
  return <div className="error-state" role="alert"><div><strong>{title}</strong><p>{explainError(error)}</p></div>{onRetry && <button className="button button-secondary" onClick={onRetry}>Try again</button>}</div>;
}

export function LoadingState({ label = 'Loading…' }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function EmptyState({ title, children, action, icon }) {
  return <div className="empty-state">{icon ? <span className="empty-icon" aria-hidden="true">{icon}</span> : <span className="empty-rule" aria-hidden="true" />}<h3>{title}</h3><p>{children}</p>{action && <div className="empty-action">{action}</div>}</div>;
}

export function Modal({ title, description, onClose, children, labelledBy }) {
  const ref = useRef(null);
  const generatedId = useId();
  const titleId = labelledBy || generatedId;
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="modal-header"><div><p className="eyebrow">TenderBridge</p><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>Close</button></div>
    {children}
  </dialog>;
}

export function ConfirmDialog({ title, description, confirmLabel, danger = false, busy = false, onConfirm, onClose }) {
  return <Modal title={title} description={description} onClose={onClose}>
    <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="button" className={danger ? 'button button-danger' : 'button button-primary'} disabled={busy} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</button></div>
  </Modal>;
}
