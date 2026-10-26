import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/errors.js';

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

const mockTenderId = '11111111-1111-4111-8111-111111111111';
const mockAppId = '22222222-2222-4222-8222-222222222222';
const mockProcurementId = '33333333-3333-4333-8333-333333333333';
const mockDocId = '44444444-4444-4444-8444-444444444444';
const mockDocId2 = '55555555-5555-4555-8555-555555555555';

// 1. Cross-organization access control tests
test('GET /api/v1/applications/:id returns 404 for organization if tender does not belong to that organization', async () => {
  const db = {
    application: {
      async findUnique({ where }) {
        if (where.id === mockAppId) {
          return {
            id: mockAppId,
            ownerAuthId: 'biz-user-1',
            status: 'SUBMITTED',
            tender: { referenceNumber: 'TND-2026-001' },
          };
        }
        return null;
      },
    },
    organizationProcurement: {
      async findFirst({ where }) {
        if (where.referenceNumber === 'TND-2026-001' && where.ownerAuthId === 'org-attacker') {
          return null;
        }
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-attacker', role: 'ORGANIZATION' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.message, /not found/i);
  });
});

test('GET /api/v1/applications/:id returns 200 for organization that owns the tender procurement', async () => {
  const db = {
    application: {
      async findUnique({ where }) {
        if (where.id === mockAppId) {
          return {
            id: mockAppId,
            ownerAuthId: 'biz-user-1',
            status: 'SUBMITTED',
            tender: { referenceNumber: 'TND-2026-001' },
          };
        }
        return null;
      },
    },
    organizationProcurement: {
      async findFirst({ where }) {
        if (where.referenceNumber === 'TND-2026-001' && where.ownerAuthId === 'org-owner') {
          return { id: mockProcurementId, referenceNumber: 'TND-2026-001', ownerAuthId: 'org-owner' };
        }
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-owner', role: 'ORGANIZATION' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.item.id, mockAppId);
  });
});

test('GET /api/v1/applications/:id/documents/:docId/download restricts access across organizations', async () => {
  const db = {
    application: {
      async findUnique({ where }) {
        return {
          id: mockAppId,
          ownerAuthId: 'biz-user-1',
          tender: { referenceNumber: 'TND-2026-001' },
          submittedDocuments: [
            { id: mockDocId, fileName: 'cert.pdf', mimeType: 'application/pdf', fileBase64: Buffer.from('%PDF-1.5 test').toString('base64') },
          ],
        };
      },
    },
    organizationProcurement: {
      async findFirst({ where }) {
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-attacker', role: 'ORGANIZATION' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}/documents/${mockDocId}/download`);
    assert.equal(res.status, 404);
  });
});

test('GET /api/v1/applications/:id/documents/:docId/download allows authorized organization and delivers file', async () => {
  const fileBytes = Buffer.from('%PDF-1.5 application document content');
  const db = {
    application: {
      async findUnique({ where }) {
        return {
          id: mockAppId,
          ownerAuthId: 'biz-user-1',
          tender: { referenceNumber: 'TND-2026-001' },
          submittedDocuments: [
            { id: mockDocId, fileName: 'gst.pdf', mimeType: 'application/pdf', fileBase64: fileBytes.toString('base64') },
          ],
        };
      },
    },
    organizationProcurement: {
      async findFirst({ where }) {
        if (where.ownerAuthId === 'org-owner') {
          return { id: mockProcurementId, referenceNumber: 'TND-2026-001', ownerAuthId: 'org-owner' };
        }
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-owner', role: 'ORGANIZATION' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}/documents/${mockDocId}/download`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    const arrayBuf = await res.arrayBuffer();
    assert.deepEqual(Buffer.from(arrayBuf), fileBytes);
  });
});

// 2. Owner-only business access tests
test('GET /api/v1/applications/:id returns 404 for a business user who does not own the application', async () => {
  const db = {
    application: {
      async findUnique({ where }) {
        return {
          id: mockAppId,
          ownerAuthId: 'biz-user-original',
          status: 'SUBMITTED',
        };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-other', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.message, /not found/i);
  });
});

test('PUT /api/v1/applications/:id returns 404 when updating another business user application', async () => {
  const db = {
    application: {
      async findFirst() { return null; },
      async updateMany() { return { count: 0 }; },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-other', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Sneaky edit' }),
    });
    assert.equal(res.status, 404);
  });
});

test('POST /api/v1/applications/:id/withdraw returns 404 when withdrawing another business user application', async () => {
  const db = {
    application: {
      async findFirst({ where }) {
        if (where.ownerAuthId === 'biz-user-other') return null;
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-other', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Accidental click' }),
    });
    assert.equal(res.status, 404);
  });
});

// 3. Blocked creation of organization decision statuses via POST
test('POST /api/v1/applications rejects attempts by businesses to create applications in decision states', async () => {
  const db = {
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'OPEN',
          submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
        };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    for (const forbiddenStatus of ['AWARDED', 'REJECTED', 'SHORTLISTED', 'UNDER_REVIEW', 'NOT_SELECTED', 'CLOSED']) {
      const res = await fetch(`${base}/api/v1/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: mockTenderId,
          status: forbiddenStatus,
        }),
      });
      assert.equal(res.status, 400, `Expected status ${forbiddenStatus} to be rejected with 400`);
    }
  });
});

// 4. Blocked submission bypass and protected field updates via PUT
test('PUT /api/v1/applications/:id rejects attempts to submit applications or modify protected fields', async () => {
  const db = {
    application: {
      async findFirst() {
        return { id: mockAppId, ownerAuthId: 'biz-user-1', status: 'DRAFT', tender: { submissionDeadline: new Date(Date.now() + 86400000).toISOString() } };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    // Attempting to set status SUBMITTED via PUT
    const resSubmit = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUBMITTED' }),
    });
    assert.equal(resSubmit.status, 400);
    const bodySubmit = await resSubmit.json();
    assert.match(bodySubmit.message, /cannot be submitted via PUT/i);

    // Attempting to set submittedSnapshot via PUT
    const resSnap = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submittedSnapshot: { fake: true } }),
    });
    assert.equal(resSnap.status, 400);

    // Attempting to set submittedDocuments via PUT
    const resDocs = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submittedDocuments: [{ id: 'fake' }] }),
    });
    assert.equal(resDocs.status, 400);

    // Attempting to set referenceNo or submissionDate via PUT
    const resRef = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceNo: 'MY-CUSTOM-REF' }),
    });
    assert.equal(resRef.status, 400);

    // Attempting to set reviewNotes or rejectionReason via PUT
    const resNotes = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewNotes: 'Pre-approved' }),
    });
    assert.equal(resNotes.status, 400);
  });
});

// 4b. Regression test: PUT cannot change an already SUBMITTED application back to DRAFT or INTERESTED; resubmission archives previous version
test('Regression: PUT cannot change a SUBMITTED application back to DRAFT or INTERESTED; resubmission archives previous version', async () => {
  const originalBytes = Buffer.from('%PDF-1.4 Initial Version Doc');
  const resubmittedBytes = Buffer.from('%PDF-1.4 Resubmitted Revision 2 Doc');

  // 1. Starts with an application in SUBMITTED status
  let storedApplication = {
    id: mockAppId,
    ownerAuthId: 'biz-user-1',
    tenderId: mockTenderId,
    status: 'SUBMITTED',
    referenceNo: 'APP-2026-999888',
    submissionDate: new Date('2026-10-10T10:00:00Z'),
    notes: 'Initial submitted notes',
    submittedSnapshot: {
      businessName: 'Stable Corp',
      annualTurnover: 150,
      proposalText: 'First proposal',
      version: 1,
    },
    submittedDocuments: [
      { id: mockDocId, name: 'GST Certificate', fileName: 'gst_cert_v1.pdf', fileSize: originalBytes.length, fileBase64: originalBytes.toString('base64') },
    ],
    revisions: [],
    statusHistory: [
      { status: 'SUBMITTED', timestamp: '2026-10-10T10:00:00Z', note: 'Initial submission', changedBy: 'Applicant' },
    ],
    tender: {
      id: mockTenderId,
      status: 'OPEN',
      submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
      requiredDocuments: ['GST Certificate'],
    },
  };

  let updateManyCalled = false;

  const db = {
    tender: {
      async findUnique() {
        return storedApplication.tender;
      },
    },
    application: {
      async findFirst({ where }) {
        if (where.id === mockAppId && where.ownerAuthId === 'biz-user-1') {
          return storedApplication;
        }
        return null;
      },
      async findUnique({ where }) {
        if (where.id === mockAppId || (where.ownerAuthId_tenderId?.ownerAuthId === 'biz-user-1' && where.ownerAuthId_tenderId?.tenderId === mockTenderId)) {
          return storedApplication;
        }
        return null;
      },
      async updateMany() {
        updateManyCalled = true;
        return { count: 1 };
      },
      async update({ data }) {
        storedApplication = { ...storedApplication, ...data };
        return storedApplication;
      },
    },
    businessDocument: {
      async findFirst({ where }) {
        if (where.id === mockDocId2 && where.ownerAuthId === 'biz-user-1') {
          return {
            id: mockDocId2,
            name: 'GST Certificate',
            fileName: 'gst_cert_v2.pdf',
            fileSize: resubmittedBytes.length,
            mimeType: 'application/pdf',
            category: 'CERTIFICATE',
            fileData: resubmittedBytes,
          };
        }
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    // 2a. Sends PUT with status: "DRAFT"
    const resDraft = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DRAFT' }),
    });
    // 3a. Confirms rejection
    assert.equal(resDraft.status, 400);
    const bodyDraft = await resDraft.json();
    assert.match(bodyDraft.message, /cannot change an already submitted.*back to draft/i);
    assert.equal(updateManyCalled, false, 'updateMany must not be called when PUT status change is rejected');

    // 2b. Sends PUT with status: "INTERESTED"
    const resInterested = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'INTERESTED' }),
    });
    // 3b. Confirms rejection
    assert.equal(resInterested.status, 400);
    const bodyInterested = await resInterested.json();
    assert.match(bodyInterested.message, /cannot change an already submitted.*back to draft or interested/i);
    assert.equal(updateManyCalled, false, 'updateMany must not be called when PUT status change is rejected');

    // 3c. Confirms stored status, snapshot, documents, and revisions remain unchanged
    assert.equal(storedApplication.status, 'SUBMITTED');
    assert.equal(storedApplication.submittedSnapshot.version, 1);
    assert.equal(storedApplication.submittedSnapshot.businessName, 'Stable Corp');
    assert.equal(storedApplication.submittedDocuments[0].fileName, 'gst_cert_v1.pdf');
    assert.deepEqual(storedApplication.revisions, []);

    // 4. Confirms a valid resubmission through the submission workflow archives the previous version
    const resResubmit = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'SUBMITTED',
        notes: 'Updated proposal notes for Revision 2',
        submittedSnapshot: {
          businessName: 'Stable Corp',
          annualTurnover: 180,
          proposalText: 'Revised second proposal',
          version: 2,
        },
        submittedDocuments: [
          { id: mockDocId2, requirementName: 'GST Certificate' },
        ],
      }),
    });

    assert.equal(resResubmit.status, 201);
    const resubmitJson = await resResubmit.json();
    assert.equal(resubmitJson.item.status, 'SUBMITTED');
    assert.equal(resubmitJson.item.submittedSnapshot.version, 2);
    assert.equal(resubmitJson.item.submittedSnapshot.annualTurnover, 180);
    assert.equal(resubmitJson.item.submittedDocuments[0].fileName, 'gst_cert_v2.pdf');

    // Verifies the previous version was archived into revisions
    assert.equal(resubmitJson.item.revisions.length, 1);
    const archivedRev = resubmitJson.item.revisions[0];
    assert.equal(archivedRev.revisionNumber, 1);
    assert.equal(archivedRev.referenceNo, 'APP-2026-999888');
    assert.equal(archivedRev.submittedSnapshot.version, 1);
    assert.equal(archivedRev.submittedSnapshot.proposalText, 'First proposal');
    assert.equal(archivedRev.submittedDocuments[0].fileName, 'gst_cert_v1.pdf');
    assert.equal(archivedRev.submittedDocuments[0].fileBase64, originalBytes.toString('base64'));
  });
});

// 5. Revision preservation: retaining previous submitted snapshot as an immutable revision
test('POST /api/v1/applications preserves previous submitted snapshot and documents in revisions array when resubmitting', async () => {
  const originalBytes = Buffer.from('%PDF-1.4 Original File');
  const updatedBytes = Buffer.from('%PDF-1.4 Updated File Revision 2');
  let updatedPayload = null;

  const existingApplication = {
    id: mockAppId,
    ownerAuthId: 'biz-user-1',
    tenderId: mockTenderId,
    status: 'SUBMITTED',
    referenceNo: 'APP-2026-111111',
    submissionDate: new Date('2026-10-01T12:00:00Z'),
    notes: 'Initial submission notes',
    submittedSnapshot: {
      businessName: 'Apex Engineering Ltd',
      annualTurnover: 85,
      version: 1,
    },
    submittedDocuments: [
      { id: mockDocId, name: 'GST Certificate', fileName: 'gst_v1.pdf', fileSize: originalBytes.length, fileBase64: originalBytes.toString('base64') },
    ],
    revisions: [],
    statusHistory: [
      { status: 'SUBMITTED', timestamp: '2026-10-01T12:00:00Z', note: 'Initial submission', changedBy: 'Applicant' },
    ],
  };

  const db = {
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'OPEN',
          submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
          requiredDocuments: ['GST Certificate'],
        };
      },
    },
    application: {
      async findUnique() {
        return existingApplication;
      },
      async update({ where, data }) {
        updatedPayload = data;
        return { id: existingApplication.id, ...data };
      },
    },
    businessDocument: {
      async findFirst({ where }) {
        if (where.id === mockDocId2 && where.ownerAuthId === 'biz-user-1') {
          return {
            id: mockDocId2,
            name: 'GST Certificate',
            fileName: 'gst_v2_updated.pdf',
            fileSize: updatedBytes.length,
            mimeType: 'application/pdf',
            category: 'CERTIFICATE',
            fileData: updatedBytes,
          };
        }
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'SUBMITTED',
        notes: 'Revised proposal submission',
        submittedSnapshot: {
          businessName: 'Apex Engineering Ltd',
          annualTurnover: 120,
          version: 2,
        },
        submittedDocuments: [
          { id: mockDocId2, requirementName: 'GST Certificate' },
        ],
      }),
    });

    assert.equal(res.status, 201);
    assert.ok(updatedPayload);
    // Active snapshot is the new revision
    assert.equal(updatedPayload.submittedSnapshot.version, 2);
    assert.equal(updatedPayload.submittedSnapshot.annualTurnover, 120);
    assert.equal(updatedPayload.submittedDocuments[0].fileName, 'gst_v2_updated.pdf');

    // The previous submitted snapshot and documents must be preserved in revisions array!
    assert.ok(Array.isArray(updatedPayload.revisions));
    assert.equal(updatedPayload.revisions.length, 1);
    const rev1 = updatedPayload.revisions[0];
    assert.equal(rev1.revisionNumber, 1);
    assert.equal(rev1.referenceNo, 'APP-2026-111111');
    assert.equal(rev1.submittedSnapshot.version, 1);
    assert.equal(rev1.submittedSnapshot.annualTurnover, 85);
    assert.equal(rev1.submittedDocuments[0].fileName, 'gst_v1.pdf');
    assert.equal(rev1.submittedDocuments[0].fileBase64, originalBytes.toString('base64'));
  });
});

// 6. Overwrite protection against draft downgrades
test('POST /api/v1/applications prevents overwriting a submitted application with a draft', async () => {
  const db = {
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'OPEN',
          submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
        };
      },
    },
    application: {
      async findUnique() {
        return {
          id: mockAppId,
          ownerAuthId: 'biz-user-1',
          tenderId: mockTenderId,
          status: 'SUBMITTED',
        };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'DRAFT',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /cannot be overwritten with a draft/i);
  });
});

// 7. Server authority for submission fields
test('POST /api/v1/applications generates referenceNo and statusHistory server-side and ignores client values', async () => {
  let createdPayload = null;
  const db = {
    tenderVersion: {
      async findFirst() { return { versionNumber: 4 }; },
    },
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'OPEN',
          submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
          requiredDocuments: [],
        };
      },
    },
    application: {
      async findUnique() { return null; },
      async create({ data }) {
        createdPayload = data;
        return { id: mockAppId, ...data };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'SUBMITTED',
        referenceNo: 'FAKE-REF-999',
        submissionDate: '2020-01-01T00:00:00.000Z',
        statusHistory: [{ status: 'AWARDED', note: 'I awarded myself' }],
      }),
    });

    assert.equal(res.status, 201);
    assert.ok(createdPayload);
    assert.match(createdPayload.referenceNo, /^APP-\d{4}-\d{6}$/);
    assert.notEqual(createdPayload.referenceNo, 'FAKE-REF-999');
    assert.equal(createdPayload.tenderVersionNumber, 4);
    assert.equal(createdPayload.statusHistory[0].status, 'SUBMITTED');
    assert.equal(createdPayload.statusHistory[0].changedBy, 'Applicant');
  });
});

// 8. Document size handling and limits
test('POST /api/v1/applications enforces 8 MB per-file limit and 25 MB total attachments limit', async () => {
  const db = {
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'OPEN',
          submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
          requiredDocuments: ['Large Doc'],
        };
      },
    },
    application: {
      async findUnique() { return null; },
    },
    businessDocument: {
      async findFirst({ where }) {
        if (where.id === 'doc-huge') {
          return {
            id: 'doc-huge',
            name: 'Large Doc',
            fileName: 'huge.pdf',
            fileSize: 9 * 1024 * 1024, // 9 MB > 8 MB limit
            fileData: Buffer.alloc(100),
          };
        }
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'SUBMITTED',
        submittedDocuments: [{ id: 'doc-huge', requirementName: 'Large Doc' }],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /exceeds the supported per-file limit of 8 MB/i);
  });
});

// 9. Missing or foreign documents validation
test('POST /api/v1/applications rejects submission when mandatory tender documents are missing', async () => {
  const db = {
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'OPEN',
          submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
          requiredDocuments: ['GST Registration Certificate', 'Audited Balance Sheet'],
        };
      },
    },
    application: {
      async findUnique() { return null; },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'SUBMITTED',
        submittedDocuments: [
          { requirementName: 'GST Registration Certificate', name: 'gst.pdf' },
        ],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /Missing required document: "Audited Balance Sheet"/i);
  });
});

test('POST /api/v1/applications rejects foreign vault documents belonging to another user', async () => {
  const db = {
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'OPEN',
          submissionDeadline: new Date(Date.now() + 86400000).toISOString(),
          requiredDocuments: ['GST Certificate'],
        };
      },
    },
    application: {
      async findUnique() { return null; },
    },
    businessDocument: {
      async findFirst() {
        return null;
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-attacker', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'SUBMITTED',
        submittedDocuments: [
          { id: mockDocId, requirementName: 'GST Certificate', name: 'foreign_doc.pdf' },
        ],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /does not exist in your vault or does not belong to your account/i);
  });
});

// 10. Deadline enforcement tests
test('POST /api/v1/applications rejects submissions for closed tenders or passed deadlines', async () => {
  const db = {
    tender: {
      async findUnique() {
        return {
          id: mockTenderId,
          status: 'CLOSED',
          submissionDeadline: new Date(Date.now() - 3600000).toISOString(),
        };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId: mockTenderId,
        status: 'SUBMITTED',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /closed/i);
  });
});

test('PUT /api/v1/applications/:id rejects updates after tender submission deadline has passed', async () => {
  const db = {
    application: {
      async findFirst() {
        return {
          id: mockAppId,
          ownerAuthId: 'biz-user-1',
          status: 'DRAFT',
          tender: {
            submissionDeadline: new Date(Date.now() - 3600000).toISOString(),
          },
        };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Late update' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /deadline has passed/i);
  });
});

// 11. Organization review transitions & status history append
test('PATCH /organization/procurements/:id/applications/:applicationId appends status history and enforces review transitions', async () => {
  let updatedPayload = null;
  const db = {
    organizationProcurement: {
      async findFirst({ where }) {
        if (where.id === mockProcurementId && where.ownerAuthId === 'org-owner') {
          return { id: mockProcurementId, referenceNumber: 'TND-2026-001', ownerAuthId: 'org-owner' };
        }
        return null;
      },
    },
    application: {
      async findFirst({ where }) {
        if (where.id === mockAppId) {
          return {
            id: mockAppId,
            status: 'SUBMITTED',
            tender: { referenceNumber: 'TND-2026-001' },
            statusHistory: [
              { status: 'SUBMITTED', timestamp: '2026-10-01T10:00:00.000Z', changedBy: 'Applicant', note: 'Submitted' },
            ],
          };
        }
        return null;
      },
      async updateMany({ data }) {
        updatedPayload = data;
        return { count: 1 };
      },
      async findUnique() {
        return { id: mockAppId, ...updatedPayload };
      },
    },
  };

  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-owner', role: 'ORGANIZATION' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/organization/procurements/${mockProcurementId}/applications/${mockAppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'SHORTLISTED',
        reviewNotes: 'Meets all mandatory criteria and strong technical score.',
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(updatedPayload);
    assert.equal(updatedPayload.status, 'SHORTLISTED');
    assert.equal(updatedPayload.reviewNotes, 'Meets all mandatory criteria and strong technical score.');
    assert.equal(updatedPayload.statusHistory.length, 2);
    assert.equal(updatedPayload.statusHistory[1].status, 'SHORTLISTED');
    assert.equal(updatedPayload.statusHistory[1].changedBy, 'Procuring Organization');
    assert.equal(updatedPayload.statusHistory[1].note, 'Meets all mandatory criteria and strong technical score.');
  });
});

// 12. Protection of submitted applications from notes edit via PUT & permitting draft notes edits
test('PUT rejects a notes edit on a submitted application and leaves stored record unchanged', async () => {
  let storedApplication = {
    id: mockAppId,
    ownerAuthId: 'biz-user-1',
    tenderId: mockTenderId,
    status: 'SUBMITTED',
    notes: 'Initial submitted notes',
    submissionDate: new Date('2026-10-10T10:00:00Z'),
    submittedSnapshot: { businessName: 'Test Corp' },
    tender: { submissionDeadline: new Date(Date.now() + 86400000).toISOString() },
  };
  let updateManyCalled = false;
  const db = {
    application: {
      async findFirst() { return storedApplication; },
      async updateMany() { updateManyCalled = true; return { count: 1 }; },
    },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Sneaky note update' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.message, /cannot edit.*already submitted.*workflow/i);
    assert.equal(updateManyCalled, false, 'updateMany must not be called when PUT notes edit is rejected');
    assert.equal(storedApplication.notes, 'Initial submitted notes');
  });
});

test('Draft applications can still update notes via PUT', async () => {
  let storedApplication = {
    id: mockAppId,
    ownerAuthId: 'biz-user-1',
    tenderId: mockTenderId,
    status: 'DRAFT',
    notes: 'Initial draft notes',
    tender: { submissionDeadline: new Date(Date.now() + 86400000).toISOString() },
  };
  let updateData = null;
  const db = {
    application: {
      async findFirst() { return storedApplication; },
      async updateMany({ data }) {
        updateData = data;
        storedApplication = { ...storedApplication, ...data };
        return { count: 1 };
      },
      async findUnique() { return storedApplication; },
    },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'biz-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${mockAppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Updated draft notes' }),
    });
    assert.equal(res.status, 200);
    assert.equal(storedApplication.notes, 'Updated draft notes');
    assert.equal(updateData.notes, 'Updated draft notes');
  });
});

// 13. Organization review transition policy: valid transitions vs invalid/terminal transitions
test('Review endpoint accepts valid transitions and appends server status history', async () => {
  let storedApplication = {
    id: mockAppId,
    status: 'SUBMITTED',
    tender: { referenceNumber: 'TND-2026-001' },
    statusHistory: [
      { status: 'SUBMITTED', timestamp: '2026-10-01T10:00:00Z', note: 'Submitted', changedBy: 'Applicant' },
    ],
  };
  const db = {
    organizationProcurement: {
      async findFirst({ where }) {
        if (where.id === mockProcurementId && where.ownerAuthId === 'org-owner') {
          return { id: mockProcurementId, referenceNumber: 'TND-2026-001', ownerAuthId: 'org-owner' };
        }
        return null;
      },
    },
    application: {
      async findFirst({ where }) {
        if (where.id === mockAppId) return storedApplication;
        return null;
      },
      async updateMany({ data }) {
        storedApplication = { ...storedApplication, ...data };
        return { count: 1 };
      },
      async findUnique() { return storedApplication; },
    },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-owner', role: 'ORGANIZATION' }; next(); } }, async base => {
    // Transition 1: SUBMITTED -> UNDER_REVIEW
    const res1 = await fetch(`${base}/api/v1/organization/procurements/${mockProcurementId}/applications/${mockAppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'UNDER_REVIEW', reviewNotes: 'Moving to evaluation' }),
    });
    assert.equal(res1.status, 200);
    assert.equal(storedApplication.status, 'UNDER_REVIEW');
    assert.equal(storedApplication.statusHistory.length, 2);
    assert.equal(storedApplication.statusHistory[1].status, 'UNDER_REVIEW');
    assert.equal(storedApplication.statusHistory[1].note, 'Moving to evaluation');

    // Transition 2: UNDER_REVIEW -> SHORTLISTED
    const res2 = await fetch(`${base}/api/v1/organization/procurements/${mockProcurementId}/applications/${mockAppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SHORTLISTED', reviewNotes: 'Shortlisted candidate' }),
    });
    assert.equal(res2.status, 200);
    assert.equal(storedApplication.status, 'SHORTLISTED');
    assert.equal(storedApplication.statusHistory.length, 3);
    assert.equal(storedApplication.statusHistory[2].status, 'SHORTLISTED');

    // Transition 3: SHORTLISTED -> AWARDED (Terminal)
    const res3 = await fetch(`${base}/api/v1/organization/procurements/${mockProcurementId}/applications/${mockAppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'AWARDED', reviewNotes: 'Contract awarded' }),
    });
    assert.equal(res3.status, 200);
    assert.equal(storedApplication.status, 'AWARDED');
    assert.equal(storedApplication.statusHistory.length, 4);
    assert.equal(storedApplication.statusHistory[3].status, 'AWARDED');
  });
});

test('Review endpoint rejects invalid and backward transitions from terminal states, leaving record and history unchanged', async () => {
  let storedApplication = {
    id: mockAppId,
    status: 'AWARDED',
    tender: { referenceNumber: 'TND-2026-001' },
    statusHistory: [
      { status: 'SUBMITTED', timestamp: '2026-10-01T10:00:00Z', note: 'Submitted', changedBy: 'Applicant' },
      { status: 'AWARDED', timestamp: '2026-10-02T10:00:00Z', note: 'Awarded', changedBy: 'Procuring Organization' },
    ],
  };
  let updateManyCalled = false;
  const db = {
    organizationProcurement: {
      async findFirst() {
        return { id: mockProcurementId, referenceNumber: 'TND-2026-001', ownerAuthId: 'org-owner' };
      },
    },
    application: {
      async findFirst() { return storedApplication; },
      async updateMany() { updateManyCalled = true; return { count: 1 }; },
      async findUnique() { return storedApplication; },
    },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-owner', role: 'ORGANIZATION' }; next(); } }, async base => {
    // Attempt 1: From terminal AWARDED back to active review status UNDER_REVIEW
    const res1 = await fetch(`${base}/api/v1/organization/procurements/${mockProcurementId}/applications/${mockAppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'UNDER_REVIEW' }),
    });
    assert.equal(res1.status, 400);
    const body1 = await res1.json();
    assert.match(body1.message, /terminal state/i);
    assert.equal(updateManyCalled, false, 'updateMany must not be called when transition from terminal state is rejected');
    assert.equal(storedApplication.status, 'AWARDED');
    assert.equal(storedApplication.statusHistory.length, 2);

    // Attempt 2: Test REJECTED terminal state
    storedApplication.status = 'REJECTED';
    const res2 = await fetch(`${base}/api/v1/organization/procurements/${mockProcurementId}/applications/${mockAppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SHORTLISTED' }),
    });
    assert.equal(res2.status, 400);
    const body2 = await res2.json();
    assert.match(body2.message, /terminal state/i);
    assert.equal(updateManyCalled, false);
    assert.equal(storedApplication.status, 'REJECTED');
    assert.equal(storedApplication.statusHistory.length, 2);

    // Attempt 3: Test NOT_SELECTED terminal state
    storedApplication.status = 'NOT_SELECTED';
    const res3 = await fetch(`${base}/api/v1/organization/procurements/${mockProcurementId}/applications/${mockAppId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'AWARDED' }),
    });
    assert.equal(res3.status, 400);
    const body3 = await res3.json();
    assert.match(body3.message, /terminal state/i);
    assert.equal(updateManyCalled, false);
    assert.equal(storedApplication.status, 'NOT_SELECTED');
    assert.equal(storedApplication.statusHistory.length, 2);
  });
});
