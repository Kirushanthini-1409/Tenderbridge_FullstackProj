import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/errors.js';

async function withApi(options, run) {
  const server = createServer(createApp(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('health endpoint is public and does not access the database', async () => {
  await withApi({ db: {}, auth: (_req, _res, next) => next() }, async base => {
    const response = await fetch(`${base}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

test('protected API returns 401 when no token is supplied', async () => {
  await withApi({ db: {}, auth: (_req, _res, next) => next(new HttpError(401, 'Sign in required.')) }, async base => {
    const response = await fetch(`${base}/api/v1/applications`);
    assert.equal(response.status, 401);
    assert.match((await response.json()).message, /Sign in required/);
  });
});

test('role checks prevent business users from reviewing approvals', async () => {
  await withApi({ db: {}, auth: (req, _res, next) => { req.auth = { id: 'auth-user-1', role: 'BUSINESS' }; next(); } }, async base => {
    const response = await fetch(`${base}/api/v1/admin/verification-requests`);
    assert.equal(response.status, 403);
  });
});

test('organisation PDF upload is owner scoped and stores only valid PDF data', async () => {
  let saved;
  const id = 'd31e9d26-0e54-4f0c-9107-cc4fd5964858';
  const pdf = Buffer.from('%PDF-1.4\n<< /Length 30 >> stream\nBT (Minimum turnover 40 lakhs) Tj ET\nendstream', 'latin1').toString('base64');
  const db = {
    organizationProcurement: {
      async findFirst({ where }) { assert.deepEqual(where, { id, ownerAuthId: 'org-1' }); return { id, status: 'DRAFT' }; },
      async update({ where, data }) { saved = { where, data }; return { id }; },
    },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-1', role: 'ORGANIZATION' }; next(); } }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${id}/pdf`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: 'notice.pdf', fileBase64: pdf }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.item.extractedText, /Minimum turnover 40 lakhs/);
    assert.match(saved.data.pdfData.toString('latin1'), /^%PDF-/);
    assert.equal(saved.data.pdfFileName, 'notice.pdf');

    const invalid = await fetch(`${base}/api/v1/organization/procurements/${id}/pdf`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: 'bad.pdf', fileBase64: Buffer.from('not a PDF').toString('base64') }),
    });
    assert.equal(invalid.status, 400);
  });
  await withApi({ db: { organizationProcurement: { async findFirst() { return null; } } }, auth: (req, _res, next) => { req.auth = { id: 'org-2', role: 'ORGANIZATION' }; next(); } }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${id}/pdf`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: 'notice.pdf', fileBase64: pdf }),
    });
    assert.equal(response.status, 404);
  });
});

test('organisation verification requires a persisted organization type and address', async () => {
  let created;
  let assignedRole;
  const db = {
    verificationRequest: { async create({ data }) { created = data; return { id: 'request-1', ...data }; } },
    accountRoleAssignment: { async upsert({ create }) { assignedRole = create.role; return create; } },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-1', role: 'BUSINESS' }; next(); } }, async base => {
    const headers = { 'content-type': 'application/json' };
    const incomplete = await fetch(`${base}/api/v1/verification-requests`, { method: 'POST', headers, body: JSON.stringify({ type: 'ORGANIZATION', organizationName: 'Example Org', contactPerson: 'A. User', email: 'a@example.com' }) });
    assert.equal(incomplete.status, 400);
    const complete = await fetch(`${base}/api/v1/verification-requests`, { method: 'POST', headers, body: JSON.stringify({ type: 'ORGANIZATION', organizationName: 'Example Org', organizationType: 'Public sector enterprise', address: '1 Example Road', contactPerson: 'A. User', email: 'a@example.com' }) });
    assert.equal(complete.status, 201);
    assert.equal(created.organizationType, 'Public sector enterprise');
    assert.equal(created.address, '1 Example Road');
    assert.equal(created.status, 'APPROVED');
    assert.equal(assignedRole, 'ORGANIZATION');
  });
});

test('publishing requires a completed organization profile', async () => {
  let lookup;
  let created = false;
  const db = {
    verificationRequest: { async findFirst(args) { lookup = args; return { status: 'PENDING', organizationType: 'Company', address: '1 Example Road' }; } },
    organizationProcurement: { async create() { created = true; return {}; } },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'org-1', role: 'ORGANIZATION' }; next(); } }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Supply contract', category: 'Equipment', description: 'Demo', submissionDeadline: '2026-12-01T00:00:00.000Z', intent: 'publish' }),
    });
    assert.equal(response.status, 403);
    assert.equal(created, false);
    assert.equal(lookup.where.type, 'ORGANIZATION');
    assert.deepEqual(lookup.orderBy, { createdAt: 'desc' });
  });
});

test('only admins can add tenders to the catalogue', async () => {
  let created;
  const db = { tender: { async create({ data }) { created = data; return { id: 'new-tender', ...data }; } } };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'admin-1', role: 'ADMIN' }; next(); } }, async base => {
    const response = await fetch(`${base}/api/v1/admin/tenders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referenceNumber: 'DEMO-001', title: 'Road resurfacing works', category: 'Construction' }) });
    assert.equal(response.status, 201);
    assert.equal(created.referenceNumber, 'DEMO-001');
    assert.equal((await response.json()).item.id, 'new-tender');
  });
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'business-1', role: 'BUSINESS' }; next(); } }, async base => {
    const response = await fetch(`${base}/api/v1/admin/tenders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referenceNumber: 'DEMO-002', title: 'Blocked record' }) });
    assert.equal(response.status, 403);
  });
});

test('application updates validate fields and scope writes to the authenticated owner', async () => {
  let whereSeen;
  const db = {
    application: {
      async updateMany({ where, data }) { whereSeen = where; assert.equal(data.status, 'DRAFT'); return { count: 1 }; },
      async findUnique({ where }) { return { id: where.id, status: 'DRAFT' }; },
    },
  };
  await withApi({ db, auth: (req, _res, next) => { req.auth = { id: 'auth-user-2', role: 'BUSINESS' }; next(); } }, async base => {
    const invalid = await fetch(`${base}/api/v1/applications/123`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'MAGIC' }) });
    assert.equal(invalid.status, 400);
    const id = 'd31e9d26-0e54-4f0c-9107-cc4fd5964858';
    const valid = await fetch(`${base}/api/v1/applications/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'DRAFT', notes: 'Valid draft update' }) });
    assert.equal(valid.status, 200);
    assert.equal(whereSeen.ownerAuthId, 'auth-user-2');
    assert.equal(whereSeen.id, id);
  });
});
