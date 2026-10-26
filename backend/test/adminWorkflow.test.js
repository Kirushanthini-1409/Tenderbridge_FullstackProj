import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

const tenderId = '11111111-2222-4333-8444-555555555555';
const applicationId = '22222222-3333-4444-8555-666666666666';
const vaultDocId = '33333333-4444-4555-8666-777777777777';
const verificationRequestId = '44444444-5555-4666-8777-888888888888';

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

const authIdentity = (id, role) => (req, _res, next) => {
  req.auth = { id, role, email: `${role.toLowerCase()}@tenderbridge.internal` };
  next();
};

const jsonBody = data => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

// ── 1. Role-based access control tests for Admin APIs ───────────────────────

test('role checks prevent Business and Organization accounts from calling Admin APIs', async () => {
  const db = {
    tender: { async findUnique() { return null; } },
    adminAuditEvent: { async findMany() { return []; } },
  };

  // Test Business role
  await withApi({ db, auth: authIdentity('biz-user-1', 'BUSINESS') }, async base => {
    const overviewRes = await fetch(`${base}/api/v1/admin/overview`);
    assert.equal(overviewRes.status, 403);

    const auditRes = await fetch(`${base}/api/v1/admin/audit-events`);
    assert.equal(auditRes.status, 403);

    const tenderPatchRes = await fetch(`${base}/api/v1/admin/tenders/${tenderId}`, {
      method: 'PATCH',
      ...jsonBody({ title: 'Unauthorized change' }),
    });
    assert.equal(tenderPatchRes.status, 403);
  });

  // Test Organization role
  await withApi({ db, auth: authIdentity('org-user-1', 'ORGANIZATION') }, async base => {
    const overviewRes = await fetch(`${base}/api/v1/admin/overview`);
    assert.equal(overviewRes.status, 403);

    const verifyPatchRes = await fetch(`${base}/api/v1/admin/verification-requests/${verificationRequestId}`, {
      method: 'PATCH',
      ...jsonBody({ status: 'APPROVED' }),
    });
    assert.equal(verifyPatchRes.status, 403);
  });
});

test('authenticated Admin accounts can access Admin overview and audit history', async () => {
  const db = {
    businessProfile: { count: async () => 12 },
    accountRoleAssignment: { count: async () => 5 },
    verificationRequest: { count: async () => 2 },
    tender: { count: async () => 8 },
    organizationProcurement: { count: async () => 6 },
    application: { count: async () => 14 },
    tenderResult: { count: async () => 3 },
    adminAuditEvent: {
      findMany: async () => [
        { id: 'evt-1', actorRole: 'ADMIN', action: 'TENDER_CREATED', entityType: 'TENDER', entityId: tenderId },
      ],
    },
  };

  await withApi({ db, auth: authIdentity('admin-user-1', 'ADMIN') }, async base => {
    const overviewRes = await fetch(`${base}/api/v1/admin/overview`);
    assert.equal(overviewRes.status, 200);
    const overview = await overviewRes.json();
    assert.equal(overview.item.businesses, 12);
    assert.equal(overview.item.tenders, 8);

    const auditRes = await fetch(`${base}/api/v1/admin/audit-events`);
    assert.equal(auditRes.status, 200);
    const auditData = await auditRes.json();
    assert.equal(auditData.items.length, 1);
    assert.equal(auditData.items[0].action, 'TENDER_CREATED');
  });
});

// ── 2. Admin Government Tender Management (Edit, Version, Audit) ─────────────

test('admin can update a government tender, creating an immutable version and audit log', async () => {
  let updatedData = null;
  const recordedVersions = [];
  const recordedAuditEvents = [];

  const existingTender = {
    id: tenderId,
    referenceNumber: 'GOV-2026-001',
    title: 'Original Solar Installation Notice',
    category: 'Renewable Energy',
    status: 'ACTIVE',
    submissionDeadline: new Date('2026-12-31T18:00:00Z'),
    estimatedValue: 5000000,
    location: 'Rajasthan, India',
    quantity: '10 MW',
    issuingAuthority: 'Ministry of New and Renewable Energy',
  };

  const db = {
    tender: {
      findUnique: async ({ where }) => (where.id === tenderId ? existingTender : null),
      update: async ({ where, data }) => {
        assert.equal(where.id, tenderId);
        updatedData = { ...existingTender, ...data };
        return updatedData;
      },
    },
    tenderVersion: {
      findFirst: async () => ({ versionNumber: 1, snapshot: existingTender }),
      create: async ({ data }) => {
        recordedVersions.push(data);
        return { id: 'ver-2', ...data };
      },
    },
    adminAuditEvent: {
      create: async ({ data }) => {
        recordedAuditEvents.push(data);
        return { id: 'evt-audit-1', ...data };
      },
    },
  };

  await withApi({ db, auth: authIdentity('admin-1', 'ADMIN') }, async base => {
    const res = await fetch(`${base}/api/v1/admin/tenders/${tenderId}`, {
      method: 'PATCH',
      ...jsonBody({
        title: 'Updated Solar Installation Notice (Phase II)',
        location: 'Rajasthan & Gujarat, India',
        estimatedValue: 7500000,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.item.title, 'Updated Solar Installation Notice (Phase II)');
    assert.equal(body.item.estimatedValue, 7500000);

    // Verify version created with source 'ADMIN_EDIT'
    assert.equal(recordedVersions.length, 1);
    assert.equal(recordedVersions[0].source, 'ADMIN_EDIT');
    assert.equal(recordedVersions[0].versionNumber, 2);
    assert.ok(recordedVersions[0].changedFields.includes('title'));
    assert.ok(recordedVersions[0].changedFields.includes('location'));

    // Verify audit event written
    assert.equal(recordedAuditEvents.length, 1);
    assert.equal(recordedAuditEvents[0].action, 'TENDER_UPDATED');
    assert.equal(recordedAuditEvents[0].actorRole, 'ADMIN');
    assert.equal(recordedAuditEvents[0].entityId, tenderId);
    assert.ok(recordedAuditEvents[0].metadata.changedFields.includes('title'));
  });
});

// ── 3. Reversible Archive / Unpublish Behavior ──────────────────────────────

test('admin can archive and restore a tender, logging TENDER_ARCHIVED and TENDER_RESTORED', async () => {
  const auditEvents = [];
  const versions = [];
  let currentTender = {
    id: tenderId,
    referenceNumber: 'GOV-2026-002',
    title: 'Hospital Equipment Supply',
    status: 'ACTIVE',
  };

  const db = {
    tender: {
      findUnique: async () => currentTender,
      update: async ({ data }) => {
        currentTender = { ...currentTender, ...data };
        return currentTender;
      },
    },
    tenderVersion: {
      findFirst: async () => ({ versionNumber: 1, snapshot: currentTender }),
      create: async ({ data }) => {
        versions.push(data);
        return { id: `ver-${versions.length + 1}`, ...data };
      },
    },
    adminAuditEvent: {
      create: async ({ data }) => {
        auditEvents.push(data);
        return data;
      },
    },
  };

  await withApi({ db, auth: authIdentity('admin-1', 'ADMIN') }, async base => {
    // 1. Archive the tender
    const archiveRes = await fetch(`${base}/api/v1/admin/tenders/${tenderId}`, {
      method: 'PATCH',
      ...jsonBody({ status: 'ARCHIVED' }),
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(currentTender.status, 'ARCHIVED');
    assert.equal(auditEvents[0].action, 'TENDER_ARCHIVED');
    assert.equal(auditEvents[0].metadata.newStatus, 'ARCHIVED');

    // 2. Restore the tender back to ACTIVE
    const restoreRes = await fetch(`${base}/api/v1/admin/tenders/${tenderId}`, {
      method: 'PATCH',
      ...jsonBody({ status: 'ACTIVE' }),
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(currentTender.status, 'ACTIVE');
    assert.equal(auditEvents[1].action, 'TENDER_RESTORED');
    assert.equal(auditEvents[1].metadata.newStatus, 'ACTIVE');
  });
});

test('business users cannot apply to an archived tender', async () => {
  const db = {
    tender: {
      findUnique: async () => ({
        id: tenderId,
        referenceNumber: 'GOV-2026-003',
        status: 'ARCHIVED',
        submissionDeadline: new Date('2028-01-01'),
      }),
    },
  };

  await withApi({ db, auth: authIdentity('biz-1', 'BUSINESS') }, async base => {
    const res = await fetch(`${base}/api/v1/applications`, {
      method: 'POST',
      ...jsonBody({
        tenderId: 'GOV-2026-003',
        status: 'INTERESTED',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.message, /closed or archived/i);
  });
});

// ── 4. Verification Review Decision Dialog Backend Checks ───────────────────

test('admin rejection requires a decision note and records VERIFICATION_REJECTED in audit log', async () => {
  const recordedEvents = [];
  const existingRequest = {
    id: verificationRequestId,
    type: 'ORGANIZATION',
    ownerAuthId: 'org-applicant-1',
    organizationName: 'Acme Infra Corp',
    status: 'PENDING',
  };

  const db = {
    verificationRequest: {
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, verificationRequestId);
        return { count: 1 };
      },
      findUnique: async () => ({ ...existingRequest, status: 'REJECTED' }),
    },
    accountRoleAssignment: {
      upsert: async () => {},
    },
    adminAuditEvent: {
      create: async ({ data }) => {
        recordedEvents.push(data);
        return data;
      },
    },
  };

  await withApi({ db, auth: authIdentity('admin-1', 'ADMIN') }, async base => {
    // Attempt rejection without decisionNote -> rejected with 400
    const failRes = await fetch(`${base}/api/v1/admin/verification-requests/${verificationRequestId}`, {
      method: 'PATCH',
      ...jsonBody({ status: 'REJECTED', decisionNote: '' }),
    });
    assert.equal(failRes.status, 400);

    // Provide valid rejection note
    const okRes = await fetch(`${base}/api/v1/admin/verification-requests/${verificationRequestId}`, {
      method: 'PATCH',
      ...jsonBody({
        status: 'REJECTED',
        decisionNote: 'Missing corporate PAN and unverified registered address.',
      }),
    });
    assert.equal(okRes.status, 200);

    // Verify audit log
    assert.equal(recordedEvents.length, 1);
    assert.equal(recordedEvents[0].action, 'VERIFICATION_REJECTED');
    assert.equal(recordedEvents[0].actorRole, 'ADMIN');
    assert.equal(recordedEvents[0].metadata.decisionNote, 'Missing corporate PAN and unverified registered address.');
  });
});

// ── 5. Historical Submitted Application Document Download ───────────────────

test('business user can download a submitted file from application history after deleting the original vault document', async () => {
  const samplePdfBytes = Buffer.from('%PDF-1.4 Historical submitted bid document data');
  const base64Data = samplePdfBytes.toString('base64');

  const applicationRecord = {
    id: applicationId,
    ownerAuthId: 'biz-applicant-1',
    status: 'SUBMITTED',
    tender: { referenceNumber: 'TND-HISTORICAL-001' },
    submittedDocuments: [
      {
        id: vaultDocId,
        requirementName: 'GST Compliance Certificate',
        name: 'GST_Cert',
        fileName: 'gst-compliance.pdf',
        mimeType: 'application/pdf',
        fileBase64: base64Data, // Preserved in snapshot at submission time
      },
    ],
  };

  let vaultLookups = 0;
  const db = {
    application: {
      findUnique: async ({ where }) => (where.id === applicationId ? applicationRecord : null),
    },
    businessDocument: {
      findUnique: async () => {
        vaultLookups += 1;
        // Simulates that the file was deleted from the personal vault
        return null;
      },
    },
  };

  // 1. The owner of the application downloads the file
  await withApi({ db, auth: authIdentity('biz-applicant-1', 'BUSINESS') }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${applicationId}/documents/${vaultDocId}/download`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('content-disposition'), /gst-compliance\.pdf/);

    const buffer = await res.arrayBuffer();
    assert.deepEqual(Buffer.from(buffer), samplePdfBytes);
    // Verified: downloaded directly from snapshot binary without relying on vault table
    assert.equal(vaultLookups, 0);
  });

  // 2. Another business attacker attempts to download this file -> 404 (access denied without leaking)
  await withApi({ db, auth: authIdentity('biz-attacker-99', 'BUSINESS') }, async base => {
    const res = await fetch(`${base}/api/v1/applications/${applicationId}/documents/${vaultDocId}/download`);
    assert.equal(res.status, 404);
  });
});
