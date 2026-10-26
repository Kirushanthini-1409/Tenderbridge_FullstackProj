import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Field, LoadingState, Notice } from '../common/ProcurementUI.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { organizationProcurementService } from '../../services/procurementService.js';
import { getRows } from '../../utils/formatters.js';

export default function TenderFaqManager({ procurementId, tenderId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setLoading(true); setError(null);
    try { setItems(getRows(await organizationProcurementService.listTenderFaqs(tenderId))); }
    catch (requestError) { setError(requestError); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [tenderId]);

  async function createFaq(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy('create'); setError(null); setSuccess('');
    try {
      await organizationProcurementService.createTenderFaq(procurementId, {
        question: String(values.get('question') || '').trim(),
        answer: String(values.get('answer') || '').trim(),
      });
      form.reset(); setSuccess('Published FAQ added to this tender.'); await load();
    } catch (requestError) { setError(requestError); }
    finally { setBusy(''); }
  }

  async function reviewFaq(event, faq, status) {
    if (event) event.preventDefault();
    const values = event ? new FormData(event.currentTarget) : null;
    setBusy(faq.id); setError(null); setSuccess('');
    try {
      await organizationProcurementService.reviewTenderFaq(procurementId, faq.id, {
        answer: String(values?.get('answer') || '').trim(), status,
      });
      setSuccess(status === 'PUBLISHED' ? 'Answer published to the tender FAQ.' : 'Question rejected. It is hidden from other businesses.');
      await load();
    } catch (requestError) { setError(requestError); }
    finally { setBusy(''); }
  }

  return <section className="panel tender-faq-manager">
    <div className="panel-header"><div><h3>Tender FAQs and questions</h3><p>Answer applicant questions for this tender or publish an organization-authored FAQ.</p></div></div>
    {success && <Notice kind="success">{success}</Notice>}
    {error && <ErrorState error={error} onRetry={load} />}
    <form className="form-stack" onSubmit={createFaq}>
      <h4>Publish a new FAQ</h4>
      <Field label="Question"><textarea name="question" required maxLength={3000} rows={2} /></Field>
      <Field label="Answer"><textarea name="answer" required maxLength={5000} rows={3} /></Field>
      <button className="button button-primary" type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Publishing…' : 'Publish FAQ'}</button>
    </form>
    <div className="tender-faq-queue">
      <h4>Question and answer queue</h4>
      {loading ? <LoadingState label="Loading tender questions…" /> : items.length ? items.map(faq => <article key={faq.id} className="clarification-card">
        <div className="panel-header"><div><h4>{faq.question}</h4><p>Received {new Date(faq.createdAt).toLocaleString()}</p></div><StatusBadge status={faq.status} /></div>
        {faq.status === 'PENDING' ? <form className="form-stack" onSubmit={event => reviewFaq(event, faq, 'PUBLISHED')}>
          <Field label="Organization answer"><textarea name="answer" required maxLength={5000} rows={3} /></Field>
          <div className="button-row"><button className="button button-primary" type="submit" disabled={busy === faq.id}>{busy === faq.id ? 'Saving…' : 'Publish answer'}</button><button className="button button-secondary" type="button" disabled={busy === faq.id} onClick={() => reviewFaq(null, faq, 'REJECTED')}>Reject question</button></div>
        </form> : faq.answer ? <p>{faq.answer}</p> : <p className="supporting-copy">This question was rejected and is not visible to other businesses.</p>}
      </article>) : <EmptyState title="No questions yet">Business questions and published FAQ entries will appear here.</EmptyState>}
    </div>
  </section>;
}
