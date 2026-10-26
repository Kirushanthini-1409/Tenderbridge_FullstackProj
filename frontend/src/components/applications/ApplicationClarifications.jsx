import { useEffect, useState } from 'react';
import { applicationsService } from '../../services/procurementService.js';
import { formatDate, getRows } from '../../utils/formatters.js';
import { ErrorState, Field, LoadingState, Notice } from '../common/ProcurementUI.jsx';
import StatusBadge from '../common/StatusBadge.jsx';

export default function ApplicationClarifications({ applicationId, disabled = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true); setError(null);
    try { setItems(getRows(await applicationsService.listClarifications(applicationId))); }
    catch (requestError) { setError(requestError); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [applicationId]);

  async function respond(event, clarificationId) {
    event.preventDefault();
    if (busy || disabled) return;
    const form = event.currentTarget;
    const message = String(new FormData(form).get('message') || '').trim();
    if (!message) return;
    setBusy(true); setError(null); setSuccess('');
    try {
      await applicationsService.respondToClarification(applicationId, clarificationId, message);
      form.reset();
      setSuccess('Your response has been sent to the organization.');
      await load();
    } catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }

  return <section className="panel application-clarifications">
    <div className="panel-header"><div><h3>Organization clarifications</h3><p>Private messages about this application, visible only to you and the procuring organization.</p></div></div>
    {success && <Notice kind="success">{success}</Notice>}
    {error && <ErrorState error={error} onRetry={load} />}
    {loading ? <LoadingState label="Loading clarification requests…" /> : items.length ? <div className="clarification-list">
      {items.map(item => <article className="clarification-card" key={item.id}>
        <div className="panel-header"><div><h4>{item.subject}</h4><p>Received {formatDate(item.createdAt)} · response deadline {item.responseDeadline ? formatDate(item.responseDeadline) : 'not set'}</p></div><StatusBadge status={item.status} /></div>
        <ol className="clarification-messages">{(item.messages || []).map(message => <li key={message.id}><strong>{message.senderRole === 'ORGANIZATION' || message.senderRole === 'ADMIN' ? 'Procuring organization' : 'You'}</strong><small> · {formatDate(message.createdAt)}</small><p>{message.body}</p></li>)}</ol>
        {item.status === 'OPEN' && !disabled && <form onSubmit={event => respond(event, item.id)} className="form-stack"><Field label="Your response"><textarea name="message" required maxLength={5000} rows={3} placeholder="Write a clear response to the organization…" /></Field><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Sending…' : 'Send response'}</button></form>}
        {item.status === 'CLOSED' && <p className="supporting-copy">This clarification has been closed by the organization.</p>}
      </article>)}
    </div> : <p className="supporting-copy">There are no clarification requests for this application.</p>}
  </section>;
}
