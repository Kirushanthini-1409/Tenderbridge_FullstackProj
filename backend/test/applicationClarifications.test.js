import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

const appId = '22222222-2222-4222-8222-222222222222';
const procurementId = '33333333-3333-4333-8333-333333333333';
const clarificationId = '44444444-4444-4444-8444-444444444444';
const tenderRef = 'TND-PHASE4-001';

async function withApi(options, run) {
  const server = createServer(createApp(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const identity = (id, role) => (req, _res, next) => { req.auth = { id, role }; next(); };
const json = body => ({ 'content-type': 'application/json' });

test('business application list and detail hide organization-only notes', async () => {
  const row = {
    id: appId, ownerAuthId: 'business-owner', status: 'SUBMITTED', reviewNotes: 'Internal scoring note',
    statusHistory: [{ status: 'UNDER_REVIEW', changedBy: 'Procuring Organization', note: 'Internal scoring note' }],
    submittedDocuments: [{ id: 'doc-1', name: 'Registration', fileBase64: 'cHJpdmF0ZQ==' }],
    revisions: [{ revisionNumber: 1, submittedDocuments: [{ name: 'Earlier file', fileBase64: 'cHJpdmF0ZQ==' }] }],
    tender: { referenceNumber: tenderRef },
  };
  const db = { application: {
    async findMany() { return [row]; },
    async findUnique() { return row; },
  } };
  await withApi({ db, auth: identity('business-owner', 'BUSINESS') }, async base => {
    const list = await fetch(`${base}/api/v1/applications`);
    const listBody = await list.json();
    assert.equal(list.status, 200);
    assert.equal('reviewNotes' in listBody.items[0], false);
    assert.equal('note' in listBody.items[0].statusHistory[0], false);
    const detail = await fetch(`${base}/api/v1/applications/${appId}`);
    const detailBody = await detail.json();
    assert.equal(detail.status, 200);
    assert.equal('reviewNotes' in detailBody.item, false);
    assert.equal('note' in detailBody.item.statusHistory[0], false);
  });
});

test('organization internal notes can be updated only for its own procurement and are not added to status history', async () => {
  let updatePayload = null;
  let findCount = 0;
  const db = {
    organizationProcurement: { async findFirst({ where }) { return where.ownerAuthId === 'org-owner' ? { id: procurementId, referenceNumber: tenderRef } : null; } },
    application: {
      async findFirst() { return { id: appId, tender: { referenceNumber: tenderRef }, statusHistory: [{ status: 'SUBMITTED' }] }; },
      async updateMany({ data }) { updatePayload = data; return { count: 1 }; },
      async findUnique() { findCount += 1; return { id: appId, reviewNotes: updatePayload.reviewNotes, updatedAt: new Date() }; },
    },
  };
  await withApi({ db, auth: identity('org-owner', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications/${appId}/internal-notes`, {
      method: 'PATCH', headers: json(), body: JSON.stringify({ reviewNotes: 'Private evaluation note' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.item.reviewNotes, 'Private evaluation note');
    assert.deepEqual(Object.keys(updatePayload), ['reviewNotes']);
    assert.equal(findCount, 1);
  });
  await withApi({ db, auth: identity('other-org', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications/${appId}/internal-notes`, {
      method: 'PATCH', headers: json(), body: JSON.stringify({ reviewNotes: 'Attempted edit' }),
    });
    assert.equal(response.status, 404);
  });
  assert.equal(updatePayload.reviewNotes, 'Private evaluation note');
});

test('organization applicant list enforces ownership and supports status and business-name filters', async () => {
  const rows = [
    { id: appId, ownerAuthId: 'business-owner', status: 'SUBMITTED', referenceNo: 'APP-1', tender: { referenceNumber: tenderRef, title: 'Tender' }, submittedDocuments: [{ name: 'Proof', fileBase64: 'YWJj' }] },
    { id: '55555555-5555-4555-8555-555555555555', ownerAuthId: 'another-business', status: 'UNDER_REVIEW', referenceNo: 'APP-2', tender: { referenceNumber: tenderRef }, submittedDocuments: [] },
  ];
  let queriedStatus;
  const db = {
    organizationProcurement: { async findFirst({ where }) { return where.ownerAuthId === 'org-owner' ? { id: procurementId, referenceNumber: tenderRef } : null; } },
    application: { async findMany({ where }) { queriedStatus = where.status; return rows.filter(row => !where.status || row.status === where.status); } },
    businessProfile: { async findUnique({ where }) { return { businessName: where.ownerAuthId === 'business-owner' ? 'Acme Works' : 'Northwind Fabrication', category: 'Works', location: 'Chennai' }; } },
  };
  await withApi({ db, auth: identity('org-owner', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications?status=SUBMITTED&search=acme`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(queriedStatus, 'SUBMITTED');
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].applicant.companyName, 'Acme Works');
    assert.equal('fileBase64' in body.items[0].submittedDocuments[0], false);
  });
  const foreignDb = { organizationProcurement: { async findFirst() { return null; } } };
  await withApi({ db: foreignDb, auth: identity('other-org', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications`);
    assert.equal(response.status, 404);
  });
});

test('clarification request, applicant response, and organization closure preserve ordered history', async () => {
  let stored = null;
  const application = { id: appId, ownerAuthId: 'business-owner', status: 'SUBMITTED', tender: { referenceNumber: tenderRef } };
  const db = {
    organizationProcurement: { async findFirst({ where }) { return where.ownerAuthId === 'org-owner' ? { id: procurementId, referenceNumber: tenderRef } : null; } },
    application: {
      async findUnique() { return application; },
      async findFirst() { return application; },
    },
    applicationClarification: {
      async create({ data }) {
        stored = { id: clarificationId, applicationId: appId, subject: data.subject, responseDeadline: data.responseDeadline, status: 'OPEN', createdByAuthId: data.createdByAuthId, createdAt: new Date(), messages: [{ id: 'msg-1', ...data.messages.create, createdAt: new Date() }] };
        return stored;
      },
      async findMany() { return stored ? [stored] : []; },
      async findFirst({ where }) { return stored?.id === where.id && stored.applicationId === where.applicationId ? stored : null; },
      async update({ where, data }) {
        assert.equal(where.id, clarificationId);
        if (data.messages?.create) stored.messages.push({ id: 'msg-2', ...data.messages.create, createdAt: new Date() });
        Object.assign(stored, Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'messages')));
        return stored;
      },
    },
  };
  await withApi({ db, auth: identity('org-owner', 'ORGANIZATION') }, async base => {
    const created = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications/${appId}/clarifications`, {
      method: 'POST', headers: json(), body: JSON.stringify({ subject: 'Confirm delivery capacity', message: 'Please confirm your monthly delivery capacity.' }),
    });
    const createdBody = await created.json();
    assert.equal(created.status, 201);
    assert.equal(createdBody.item.status, 'OPEN');
    assert.equal(createdBody.item.messages.length, 1);
    assert.equal('senderAuthId' in createdBody.item.messages[0], false);
  });
  await withApi({ db, auth: identity('business-owner', 'BUSINESS') }, async base => {
    const response = await fetch(`${base}/api/v1/applications/${appId}/clarifications/${clarificationId}/messages`, {
      method: 'POST', headers: json(), body: JSON.stringify({ message: 'We can deliver 500 units monthly.' }),
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.item.status, 'RESPONDED');
    assert.equal(body.item.messages.length, 2);
    assert.match(body.item.messages[0].body, /confirm your monthly/);
    assert.match(body.item.messages[1].body, /500 units/);
  });
  await withApi({ db, auth: identity('org-owner', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications/${appId}/clarifications/${clarificationId}/close`, {
      method: 'PATCH', headers: json(), body: JSON.stringify({}),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.item.status, 'CLOSED');
    assert.equal(body.item.messages.length, 2);
  });
});

test('another applicant cannot list or respond to a clarification and cannot mutate it', async () => {
  let reads = 0;
  let writes = 0;
  const db = {
    application: { async findUnique() { return { id: appId, ownerAuthId: 'business-owner', tender: { referenceNumber: tenderRef } }; } },
    applicationClarification: {
      async findMany() { reads += 1; return []; },
      async findFirst() { reads += 1; return { id: clarificationId, applicationId: appId, status: 'OPEN' }; },
      async update() { writes += 1; },
    },
  };
  await withApi({ db, auth: identity('other-business', 'BUSINESS') }, async base => {
    const list = await fetch(`${base}/api/v1/applications/${appId}/clarifications`);
    assert.equal(list.status, 404);
    const reply = await fetch(`${base}/api/v1/applications/${appId}/clarifications/${clarificationId}/messages`, {
      method: 'POST', headers: json(), body: JSON.stringify({ message: 'Unauthorized reply' }),
    });
    assert.equal(reply.status, 404);
  });
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test('organization cannot create a clarification for another organization’s procurement', async () => {
  let writes = 0;
  const db = {
    organizationProcurement: { async findFirst() { return null; } },
    application: { async findFirst() { throw new Error('Application query should not run for foreign procurement'); } },
    applicationClarification: { async create() { writes += 1; } },
  };
  await withApi({ db, auth: identity('foreign-org', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications/${appId}/clarifications`, {
      method: 'POST', headers: json(), body: JSON.stringify({ subject: 'Private', message: 'This should not be saved.' }),
    });
    assert.equal(response.status, 404);
  });
  assert.equal(writes, 0);
});

test('another organization cannot read or close a clarification for a foreign procurement', async () => {
  let clarificationReads = 0;
  let clarificationWrites = 0;
  const db = {
    organizationProcurement: { async findFirst() { return null; } },
    application: {
      async findUnique() { return { id: appId, ownerAuthId: 'business-owner', tender: { referenceNumber: tenderRef } }; },
      async findFirst() { throw new Error('Application lookup should not run for foreign procurement'); },
    },
    applicationClarification: {
      async findMany() { clarificationReads += 1; return []; },
      async findFirst() { clarificationReads += 1; return { id: clarificationId, status: 'RESPONDED' }; },
      async update() { clarificationWrites += 1; },
    },
  };
  await withApi({ db, auth: identity('other-org', 'ORGANIZATION') }, async base => {
    const list = await fetch(`${base}/api/v1/applications/${appId}/clarifications`);
    assert.equal(list.status, 404);
    const close = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications/${appId}/clarifications/${clarificationId}/close`, {
      method: 'PATCH', headers: json(), body: JSON.stringify({}),
    });
    assert.equal(close.status, 404);
  });
  assert.equal(clarificationReads, 0);
  assert.equal(clarificationWrites, 0);
});

test('organization cannot close an unanswered clarification', async () => {
  let writes = 0;
  const db = {
    organizationProcurement: { async findFirst() { return { id: procurementId, referenceNumber: tenderRef }; } },
    application: { async findFirst() { return { id: appId, tender: { referenceNumber: tenderRef } }; } },
    applicationClarification: {
      async findFirst() { return { id: clarificationId, applicationId: appId, status: 'OPEN' }; },
      async update() { writes += 1; },
    },
  };
  await withApi({ db, auth: identity('org-owner', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/applications/${appId}/clarifications/${clarificationId}/close`, {
      method: 'PATCH', headers: json(), body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
  });
  assert.equal(writes, 0);
});
