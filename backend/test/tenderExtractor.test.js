import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/errors.js';
import { extractTenderDetails, extractDeteriministically } from '../src/services/tenderExtractor.js';
import { evaluateEligibility } from '../src/services/eligibilityEngine.js';

async function withApi(options, run) {
  const server = createServer(createApp(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

const sampleTenderText = `
GOVERNMENT OF TAMIL NADU
Department of Higher Education
Tender Title: Supply and Installation of Laboratory Desktop Computers
Procurement Notice Ref: TN/EDU/2026/089

Estimated Cost: Rs. 50,00,000 (Fifty Lakhs)
Submission Deadline: 2026-11-20 15:00 IST
Location: Tamil Nadu

Eligibility Criteria:
1. Minimum Annual Turnover of Rs. 40 Lakhs in each of the last 3 financial years.
2. Experience: Minimum experience of 3 years in supplying IT hardware to government institutions.
3. Certifications: Vendor must hold valid MSME and ISO 9001 certifications.
4. Bidder must be registered in Tamil Nadu.

Required Documents for Technical Bid:
- PAN Card
- GST Registration Certificate
- Audited Balance Sheets for the last 3 financial years
- EMD of Rs. 1,00,000
- Past work orders or experience certificates
- Non-blacklisting affidavit
`;

test('extractDeteriministically extracts metadata, criteria, documents, and summary', () => {
  const result = extractDeteriministically(sampleTenderText);

  assert.ok(result.summary.includes('Supply and Installation of Laboratory Desktop Computers'));
  assert.equal(result.metadata.title, 'Supply and Installation of Laboratory Desktop Computers');
  assert.equal(result.metadata.category, 'IT & Computers');
  assert.equal(result.metadata.submissionDeadline, '2026-11-20 15:00 IST');
  assert.equal(result.metadata.estimatedValue, 5000000);

  // Criteria
  assert.equal(result.eligibilityCriteria.minTurnover, 40);
  assert.equal(result.eligibilityCriteria.minExperienceYears, 3);
  assert.ok(result.eligibilityCriteria.requiredCertifications.includes('MSME'));
  assert.ok(result.eligibilityCriteria.requiredCertifications.includes('ISO 9001'));
  assert.ok(result.eligibilityCriteria.locationRestrictions.includes('Tamil Nadu'));

  // Documents
  assert.ok(result.requiredDocuments.some(d => d.name === 'PAN Card'));
  assert.ok(result.requiredDocuments.some(d => d.name === 'GST Registration Certificate'));
  assert.ok(result.requiredDocuments.some(d => d.name.includes('Audited Balance Sheets')));

  assert.equal(result.source, 'DETERMINISTIC_PARSER');
});

test('extractDeteriministically identifies missing criteria without fabricating them', () => {
  const sparseText = `
Subject: Supply of Wooden Benches
Vendor must submit bid by post.
No turnover or experience conditions mentioned.
`;

  const result = extractDeteriministically(sparseText);

  assert.equal(result.eligibilityCriteria.minTurnover, null);
  assert.equal(result.eligibilityCriteria.minExperienceYears, null);
  assert.equal(result.eligibilityCriteria.requiredCertifications.length, 0);
  assert.equal(result.metadata.estimatedValue, null);

  assert.ok(result.missingInformation.some(m => m.toLowerCase().includes('turnover')));
  assert.ok(result.missingInformation.some(m => m.toLowerCase().includes('experience')));
  assert.ok(result.missingInformation.some(m => m.toLowerCase().includes('deadline')));
  assert.ok(result.missingInformation.some(m => m.toLowerCase().includes('estimated tender value')));
});

test('maps verified extraction evidence to its OCR page number', async () => {
  const result = await extractTenderDetails('[PAGE 1]\nGovernment tender notice\n[PAGE 2]\nTender Title: Supply of Safety Equipment');
  assert.equal(result.metadata.title, 'Supply of Safety Equipment');
  assert.equal(result.fieldEvidencePages.title, 2);
});

test('localOnly extraction never invokes the external AI client', async () => {
  let externalClientCalled = false;
  const result = await extractTenderDetails(sampleTenderText, {
    localOnly: true,
    aiClient: async () => { externalClientCalled = true; throw new Error('must not run'); },
    apiKey: 'test-key',
  });
  assert.equal(externalClientCalled, false);
  assert.equal(result.source, 'DETERMINISTIC_PARSER');
});

test('extractDeteriministically converts crores to lakhs', () => {
  const textWithCrores = `
Tender Title: Construction of Community Hall
Estimated Cost: Rs. 2.5 Crores
Minimum Annual Turnover of 1.5 Crores
Minimum experience of 5 years
`;
  const result = extractDeteriministically(textWithCrores);

  assert.equal(result.metadata.estimatedValue, 25000000); // 2.5 crores in INR
  assert.equal(result.eligibilityCriteria.minTurnover, 150); // 1.5 crores = 150 lakhs
  assert.equal(result.eligibilityCriteria.minExperienceYears, 5);
});

test('extractTenderDetails rejects invalid or empty input', async () => {
  await assert.rejects(
    () => extractTenderDetails(''),
    { name: 'TypeError', message: /Tender text must be a non-empty string/ }
  );
  await assert.rejects(
    () => extractTenderDetails(null),
    { name: 'TypeError', message: /Tender text must be a non-empty string/ }
  );
  await assert.rejects(
    () => extractTenderDetails({ text: '   ' }),
    { name: 'TypeError', message: /Tender text must be a non-empty string/ }
  );
});

test('extractTenderDetails validates and adopts structured AI output when aiClient is passed', async () => {
  const mockAiClient = async () => ({
    summary: 'Executive AI summary for hospital equipment supply.',
    metadata: {
      title: 'Supply of Medical Diagnostic Equipment',
      issuingAuthority: 'Public Health Department',
      category: 'Medical',
      submissionDeadline: '2026-12-01T12:00:00Z',
      estimatedValue: 12000000,
    },
    eligibilityCriteria: {
      minTurnover: 80,
      minExperienceYears: 4,
      requiredCertifications: ['ISO 13485', 'CE'],
      locationRestrictions: ['Maharashtra'],
    },
    requiredDocuments: [
      { name: 'CE Certificate', category: 'Technical', mandatory: true },
      { name: 'GST Certificate', category: 'Statutory', mandatory: true },
    ],
    missingInformation: ['EMD payment mode is unspecified.'],
  });

  const result = await extractTenderDetails('Sample text', { aiClient: mockAiClient });

  assert.equal(result.source, 'GEMINI_AI');
  assert.equal(result.metadata.category, 'Medical');
  assert.equal(result.eligibilityCriteria.minTurnover, 80);
  assert.equal(result.eligibilityCriteria.minExperienceYears, 4);
  assert.deepEqual(result.eligibilityCriteria.requiredCertifications, ['ISO 13485', 'CE']);
});

test('extractTenderDetails falls back to deterministic extraction if AI client fails', async () => {
  const failingAiClient = async () => {
    throw new Error('Quota exceeded on Gemini model.');
  };

  const result = await extractTenderDetails(sampleTenderText, { aiClient: failingAiClient });

  assert.equal(result.source, 'DETERMINISTIC_PARSER');
  assert.equal(result.metadata.category, 'IT & Computers');
  assert.ok(result.missingInformation.some(m => m.includes('AI extraction fallback engaged')));
});

test('POST /api/v1/tenders/extract returns 401 when no token is supplied', async () => {
  await withApi(
    { db: {}, auth: (_req, _res, next) => next(new HttpError(401, 'Sign in required.')) },
    async (base) => {
      const response = await fetch(`${base}/api/v1/tenders/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: sampleTenderText }),
      });
      assert.equal(response.status, 401);
    }
  );
});

test('POST /api/v1/tenders/extract returns 400 when text is missing or empty', async () => {
  await withApi(
    { db: {}, auth: (req, _res, next) => { req.auth = { id: 'user-1', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/tenders/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '' }),
      });
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.match(data.message, /Paste tender text or upload a PDF/);
    }
  );
});

test('POST /api/v1/tenders/extract returns 200 with structured extraction', async () => {
  await withApi(
    { db: {}, auth: (req, _res, next) => { req.auth = { id: 'user-1', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/tenders/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: sampleTenderText }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.ok(data.summary);
      assert.equal(data.metadata.title, 'Supply and Installation of Laboratory Desktop Computers');
      assert.equal(data.eligibilityCriteria.minTurnover, 40);
      assert.equal(data.eligibilityCriteria.minExperienceYears, 3);
      assert.ok(data.eligibilityCriteria.requiredCertifications.includes('MSME'));
      assert.ok(data.requiredDocuments.length > 0);
    }
  );
});

test('Integration: Extracted criteria feeds directly into evaluateEligibility', async () => {
  // 1. Extract tender details
  const extracted = await extractTenderDetails(sampleTenderText);

  // 2. Business profile
  const matchingBusinessProfile = {
    businessName: 'Apex IT Systems',
    category: 'Computers',
    location: 'Tamil Nadu',
    annualTurnover: 50, // >= 40
    yearsOfExperience: 5, // >= 3
    certifications: ['MSME', 'ISO 9001'],
  };

  // 3. Evaluate eligibility using the existing engine
  const evaluation = evaluateEligibility(matchingBusinessProfile, extracted.eligibilityCriteria);

  assert.equal(evaluation.status, 'Eligible');
  assert.equal(evaluation.passedCriteria.length, 4);
  assert.equal(evaluation.failedCriteria.length, 0);
  assert.equal(evaluation.unknownCriteria.length, 0);
});
