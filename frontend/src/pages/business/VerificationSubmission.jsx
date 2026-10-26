import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ErrorState, Field, Notice, PageHeader, Panel } from '../../components/common/ProcurementUI.jsx';
import { verificationRequestService, organizationProcurementService } from '../../services/procurementService.js';

export default function VerificationSubmission() {
  const organizationOnly = useLocation().pathname === '/org/profile';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [requestType, setRequestType] = useState(organizationOnly ? 'ORGANIZATION' : 'BUSINESS');
  const [profile, setProfile] = useState({ organizationName: '', organizationType: '', address: '', businessName: '', contactPerson: '', email: '', contactPhone: '', registrationNo: '' });

  useEffect(() => {
    let active = true;
    organizationProcurementService.verificationStatus().then(({ item }) => {
      if (!active || !item) return;
      setRequestType(item.type || 'BUSINESS');
      setProfile(current => Object.fromEntries(Object.keys(current).map(key => [key, item[key] || ''])));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function changeProfile(event) {
    const { name, value } = event.target;
    setProfile(current => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const optional = name => String(form.get(name) || '').trim() || null;
    const payload = {
      type: form.get('type'),
      organizationName: String(form.get('organizationName') || '').trim(),
      organizationType: optional('organizationType'),
      address: optional('address'),
      businessName: optional('businessName'),
      contactPerson: String(form.get('contactPerson') || '').trim(),
      email: String(form.get('email') || '').trim(),
      contactPhone: optional('contactPhone'),
      registrationNo: optional('registrationNo'),
      documents: [],
    };
    setBusy(true);
    setError(null);
    try {
      const response = await verificationRequestService.submit(payload);
      setSubmitted(response?.item || {});
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <PageHeader eyebrow={organizationOnly ? 'ORGANIZATION PROFILE' : 'VERIFICATION'} title={organizationOnly ? 'Organization profile' : 'Request verification'} description={organizationOnly ? 'Complete your organization details to publish tenders. You can use the workspace immediately.' : 'Submit your business details for review.'} />
    {submitted ? <Panel title={organizationOnly ? 'Profile saved' : 'Request submitted'} description={organizationOnly ? 'Your organization workspace is ready.' : 'Your business verification details were sent for review.'}>
      <Notice kind="success">{organizationOnly ? 'Organization profile saved. You can now create and publish tenders.' : `Your request has been recorded with status “${submitted.status || 'Pending'}”.`}{submitted.id ? ` Reference: ${submitted.id}` : ''}</Notice>
      <button type="button" className="button button-secondary" onClick={() => setSubmitted(null)}>Submit another request</button>
    </Panel> : <>
      {!organizationOnly && <Notice>File uploads are not connected yet. Submit only if your process allows an initial request without documents; don’t paste private file links here.</Notice>}
      {error && <ErrorState error={error} />}
      <form className="procurement-form" onSubmit={submit}>
        <Panel title="Organization details" description="Enter the legal name and the contact information for this verification request.">
          <div className="form-grid">
            {!organizationOnly && <Field label="Request type"><select name="type" required value={requestType} onChange={event => setRequestType(event.target.value)}><option value="BUSINESS">Business</option><option value="ORGANIZATION">Organization</option></select></Field>}
            {organizationOnly && <input type="hidden" name="type" value="ORGANIZATION" />}
            <Field label="Legal organization name"><input name="organizationName" required maxLength="180" value={profile.organizationName} onChange={changeProfile} /></Field>
            {requestType === 'ORGANIZATION' && <>
              <Field label="Organization type"><select name="organizationType" required value={profile.organizationType} onChange={changeProfile}><option value="">Select type</option><option>Government department</option><option>Public sector enterprise</option><option>Private company</option><option>Non-profit organization</option><option>Educational institution</option><option>Other</option></select></Field>
              <Field label="Registered address" className="field-wide"><textarea name="address" rows="3" required maxLength="1000" value={profile.address} onChange={changeProfile} /></Field>
            </>}
            <Field label="Business name (optional)"><input name="businessName" maxLength="180" value={profile.businessName} onChange={changeProfile} /></Field>
            <Field label="Registration number (optional)"><input name="registrationNo" maxLength="100" value={profile.registrationNo} onChange={changeProfile} /></Field>
          </div>
        </Panel>
        <Panel title="Primary contact" description="We’ll associate this contact with the verification request.">
          <div className="form-grid">
            <Field label={requestType === 'ORGANIZATION' ? 'Authorized representative' : 'Contact person'}><input name="contactPerson" required maxLength="180" autoComplete="name" value={profile.contactPerson} onChange={changeProfile} /></Field>
            <Field label="Contact email"><input name="email" type="email" required maxLength="254" autoComplete="email" value={profile.email} onChange={changeProfile} /></Field>
            <Field label="Contact phone (optional)"><input name="contactPhone" type="tel" maxLength="40" autoComplete="tel" value={profile.contactPhone} onChange={changeProfile} /></Field>
          </div>
        </Panel>
        <div className="form-submit-bar"><span>Review your details before saving.</span><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : organizationOnly ? 'Save organization profile' : 'Submit for verification'}</button></div>
      </form>
    </>}
  </>;
}
