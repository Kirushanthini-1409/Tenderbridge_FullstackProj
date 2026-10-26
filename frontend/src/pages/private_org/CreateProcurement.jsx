import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, Notice, PageHeader, Panel } from '../../components/common/ProcurementUI.jsx';
import OrganizationIntegrationState from '../../components/private_org/OrganizationIntegrationState.jsx';
import { organizationProcurementService } from '../../services/procurementService.js';

export default function CreateProcurement() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const [notice, setNotice] = useState(''); const [savedId, setSavedId] = useState(''); const [extraction, setExtraction] = useState(null);
  async function submit(event) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const intent = event.nativeEvent.submitter?.value || 'publish';
    const pdfFile = data.pdfFile;
    delete data.pdfFile;
    if (data.estimatedValue) data.estimatedValue = Number(data.estimatedValue);
    if (data.minTurnover) data.minTurnover = Number(data.minTurnover);
    if (data.submissionDeadline) data.submissionDeadline = new Date(data.submissionDeadline).toISOString();
    data.openingDate = data.openingDate ? new Date(data.openingDate).toISOString() : null;
    data.requiredDocuments = data.requiredDocuments.split('\n').map(value => value.trim()).filter(Boolean);
    data.requiredCertifications = data.requiredCertifications.split('\n').map(value => value.trim()).filter(Boolean);
    data.locationRestrictions = data.locationRestrictions.split('\n').map(value => value.trim()).filter(Boolean);
    setBusy(true); setError(null); setNotice(''); setExtraction(null); setSavedId('');
    try {
      const created = await organizationProcurementService.create({ ...data, intent: pdfFile?.size && intent === 'publish' ? 'draft' : intent });
      const id = created?.item?.id;
      setSavedId(id || '');
      if (pdfFile?.size && id) {
        const uploaded = await organizationProcurementService.uploadPdf(id, pdfFile);
        const uploadedInfo = uploaded?.item;
        setExtraction(uploadedInfo?.extraction ? {
          ...uploadedInfo.extraction,
          documentProcessing: { method: uploadedInfo.extractionMethod, ocrStatus: uploadedInfo.ocrStatus, pagesProcessed: uploadedInfo.pagesProcessed, message: uploadedInfo.message },
        } : null);
        setNotice(`${uploaded?.item?.message || 'PDF uploaded.'} The opportunity was saved as a draft so you can review its requirements before publishing.`);
      } else setNotice(intent === 'draft' ? 'Draft saved.' : 'Opportunity published.');
    }
    catch (requestError) { setError(requestError); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="ORGANIZATION WORKSPACE" title="Create procurement" description="Prepare a structured opportunity for suppliers to review." action={<Link className="button button-secondary" to="/org/procurements">Back to listings</Link>} />
    <Notice>Save a draft while preparing. Publishing makes the opportunity visible to business users and is allowed only after organization verification.</Notice>
    {error && <OrganizationIntegrationState title="Your procurement needs attention" description="Check the request below. If PDF upload failed, the draft may already have been saved; open your listings to continue." error={error} />}
    {notice && <Notice>{notice} {savedId && <Link to="/org/procurements">Open your listings</Link>}</Notice>}
    {extraction && <Panel title="Extracted information for review" description="Extraction is advisory. Check each value against the source notice and correct it in the form before publishing."><p>{extraction.summary || 'No summary was available.'}</p><Notice kind="warning">Source: {extraction.source === 'GEMINI_AI' ? 'Gemini AI' : 'Deterministic text parser'} · Overall evidence confidence: {Math.round((extraction.overallConfidence || 0) * 100)}% · Review status: confirmation required.</Notice><div className="extraction-evidence-list">{Object.entries(extraction.fieldConfidence || {}).filter(([, score]) => score > 0).map(([field, score]) => <div key={field}><strong>{field.replace(/([A-Z])/g, ' $1')}</strong><span>{Math.round(score * 100)}% evidence match</span><p>“{extraction.fieldEvidence?.[field] || 'No source quotation available'}”{extraction.fieldEvidencePages?.[field] ? ` · Page ${extraction.fieldEvidencePages[field]}` : ''}</p></div>)}</div>{extraction.documentProcessing?.ocrStatus && <p>OCR status: {extraction.documentProcessing.ocrStatus} · Pages processed: {extraction.documentProcessing.pagesProcessed}</p>}<p><strong>Missing or unverified:</strong> {(extraction.missingInformation || []).join('; ') || 'None reported'}</p></Panel>}
    <form onSubmit={submit} className="procurement-form">
      <Panel title="Basic information" description="Give suppliers the core information they need to understand the opportunity."><div className="form-grid"><Field label="Procurement title"><input name="title" required maxLength="180" /></Field><Field label="Category"><input name="category" required maxLength="100" placeholder="Choose a procurement category" /></Field><Field label="Description" className="field-wide"><textarea name="description" rows="4" required /></Field></div></Panel>
      <Panel title="Procurement details" description="Add quantity, schedule, estimated scale, and submission location when specified in the source notice."><div className="form-grid"><Field label="Estimated value (₹)" hint="Optional. Amounts are sent to the API in rupees."><input name="estimatedValue" type="number" min="0" step="any" /></Field><Field label="Location"><input name="location" maxLength="160" /></Field><Field label="Quantity"><input name="quantity" maxLength="120" placeholder="e.g. 250 units" /></Field><Field label="Submission deadline"><input name="submissionDeadline" type="datetime-local" required /></Field><Field label="Bid opening date"><input name="openingDate" type="datetime-local" /></Field><Field label="Delivery / completion period"><input name="deliveryDuration" maxLength="160" placeholder="e.g. 90 days from award" /></Field></div></Panel>
      <Panel title="Requirements" description="List only requirements confirmed by your procurement notice."><div className="form-grid"><Field label="Minimum turnover (₹ lakhs)"><input name="minTurnover" type="number" min="0" step="any" /></Field><Field label="Minimum experience (years)"><input name="minExperienceYears" type="number" min="0" step="1" /></Field><Field label="Required certifications" hint="Enter one certification per line."><textarea name="requiredCertifications" rows="3" /></Field><Field label="Location restrictions" hint="Enter restricted states or regions, one per line."><textarea name="locationRestrictions" rows="3" /></Field><Field label="Required documents" className="field-wide" hint="Enter one document name per line."><textarea name="requiredDocuments" rows="4" /></Field></div></Panel>
      <Panel title="Tender PDF" description="PDFs are stored with the draft. Text extraction supports common text-based PDFs; scanned PDFs may need manual entry."><Field label="Upload a PDF" hint="Maximum 8 MB. Extracted fields remain suggestions until you review and edit the draft."><input name="pdfFile" type="file" accept="application/pdf,.pdf" /></Field></Panel>
      <div className="form-submit-bar"><span>Review the opportunity details before submitting.</span><div className="button-row"><button type="submit" value="draft" className="button button-secondary" disabled={busy}>Save draft</button><button type="submit" value="publish" className="button button-primary" disabled={busy}>{busy ? 'Submitting…' : 'Publish opportunity'}</button></div></div>
    </form>
  </>;
}
