import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

const tenderId = '77777777-7777-4777-8777-777777777777';
const procurementId = '88888888-8888-4888-8888-888888888888';
const applicationId = '99999999-9999-4999-8999-999999999999';
const tenderRef = 'TB-RESULT-001';

async function withApi(options, run) {
  const server = createServer(createApp(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const identity = (id, role) => (req, _res, next) => { req.auth = { id, role }; next(); };
const body = data => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

test('organization publishes results only after every submitted application has a final outcome', async () => {
  const saved = [];
  const events = [];
  const db = {
    organizationProcurement: { async findFirst({ where }) { return where.ownerAuthId === 'org-1' ? { id: procurementId, referenceNumber: tenderRef } : null; } },
    tender: { async findUnique() { return { id: tenderId, referenceNumber: tenderRef }; } },
    application: { async findMany() { return [{ id: applicationId, status: 'AWARDED' }, { id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', status: 'SHORTLISTED' }]; } },
    tenderResult: {
      async findUnique() { return null; },
      async upsert({ create }) { saved.push(create); return { id: 'result-1', ...create }; },
    },
    adminAuditEvent: { async create({ data }) { events.push(data); return data; } },
  };
  await withApi({ db, auth: identity('org-1', 'ORGANIZATION') }, async base => {
    const blocked = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/results`, { method: 'POST', ...body({ summary: 'The evaluation is complete and award details are below.' }) });
    assert.equal(blocked.status, 400);
    assert.equal(saved.length, 0);
    assert.equal(events.length, 0);

    db.application.findMany = async () => [{ id: applicationId, status: 'AWARDED' }, { id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1', status: 'NOT_SELECTED' }];
    const published = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/results`, { method: 'POST', ...body({ summary: 'The evaluation is complete. The contract has been awarded to the selected applicant.' }) });
    const payload = await published.json();
    assert.equal(published.status, 201);
    assert.equal(payload.item.summary.startsWith('The evaluation is complete'), true);
    assert.equal(saved[0].publishedByAuthId, 'org-1');
    assert.equal(events[0].action, 'TENDER_RESULTS_PUBLISHED');
    assert.equal(events[0].entityId, tenderId);
  });
});

test('organization cannot publish or view another organization’s procurement results', async () => {
  let writes = 0;
  const db = {
    organizationProcurement: { async findFirst() { return null; } },
    tenderResult: { async upsert() { writes += 1; }, async findUnique() { writes += 1; } },
  };
  await withApi({ db, auth: identity('org-2', 'ORGANIZATION') }, async base => {
    const publish = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/results`, { method: 'POST', ...body({ summary: 'A valid public summary with enough detail.' }) });
    const read = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/results`);
    assert.equal(publish.status, 404);
    assert.equal(read.status, 404);
  });
  assert.equal(writes, 0);
});

test('business users do not see final outcomes until the tender result is published', async () => {
  let published = null;
  const db = {
    application: { async findUnique() { return {
      id: applicationId, ownerAuthId: 'biz-1', tenderId, status: 'AWARDED', rejectionReason: 'Private draft outcome', reviewNotes: 'Private review note',
      statusHistory: [{ status: 'SUBMITTED', changedBy: 'Applicant' }, { status: 'AWARDED', changedBy: 'Procuring Organization', note: 'Selected' }],
      tender: { id: tenderId, title: 'Equipment tender', result: null },
    }; } },
    tenderResult: { async findUnique() { return published; } },
  };
  await withApi({ db, auth: identity('biz-1', 'BUSINESS') }, async base => {
    const hidden = await fetch(`${base}/api/v1/applications/${applicationId}`);
    const hiddenBody = await hidden.json();
    assert.equal(hidden.status, 200);
    assert.equal(hiddenBody.item.status, 'UNDER_EVALUATION');
    assert.equal('rejectionReason' in hiddenBody.item, false);
    assert.equal(hiddenBody.item.statusHistory.some(entry => entry.status === 'AWARDED'), false);
    assert.equal(hiddenBody.item.reviewNotes, undefined);

    published = { summary: 'The tender result has been formally released.', publishedAt: new Date() };
    const released = await fetch(`${base}/api/v1/applications/${applicationId}`);
    const releasedBody = await released.json();
    assert.equal(releasedBody.item.status, 'AWARDED');
    assert.equal(releasedBody.item.tender.result.summary, 'The tender result has been formally released.');
  });
});

test('only administrators can view the audit history', async () => {
  let reads = 0;
  const db = { adminAuditEvent: { async findMany() { reads += 1; return [{ id: 'event-1', action: 'VERIFICATION_APPROVED' }]; } } };
  await withApi({ db, auth: identity('biz-1', 'BUSINESS') }, async base => {
    const denied = await fetch(`${base}/api/v1/admin/audit-events`);
    assert.equal(denied.status, 403);
  });
  await withApi({ db, auth: identity('admin-1', 'ADMIN') }, async base => {
    const allowed = await fetch(`${base}/api/v1/admin/audit-events`);
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).items[0].action, 'VERIFICATION_APPROVED');
  });
  assert.equal(reads, 1);
});
