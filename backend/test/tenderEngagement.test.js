import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';

const tenderId = '77777777-7777-4777-8777-777777777777';
const procurementId = '88888888-8888-4888-8888-888888888888';
const faqId = '99999999-9999-4999-8999-999999999999';
const tenderRef = 'TB-PHASE5-001';

async function withApi(options, run) {
  const server = createServer(createApp(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const identity = (id, role) => (req, _res, next) => { req.auth = { id, role }; next(); };
const tender = { id: tenderId, referenceNumber: tenderRef, title: 'Supply of lab equipment', status: 'ACTIVE', submissionDeadline: new Date(Date.now() + 7 * 86_400_000) };

test('business can submit a tender question and only sees published answers and its own pending question', async () => {
  const calls = [];
  const db = {
    tender: { async findUnique() { return tender; } },
    tenderFaq: {
      async create({ data }) { calls.push(data); return { id: faqId, ...data, createdAt: new Date() }; },
      async findMany({ where }) { calls.push(where); return [{ id: faqId, tenderId, question: 'Can alternate makes be offered?', answer: null, status: 'PENDING', askedByAuthId: 'biz-1', createdAt: new Date() }]; },
    },
  };
  await withApi({ db, auth: identity('biz-1', 'BUSINESS') }, async base => {
    const submit = await fetch(`${base}/api/v1/tenders/${tenderRef}/faqs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Can alternate makes be offered?' }),
    });
    const submitted = await submit.json();
    assert.equal(submit.status, 201);
    assert.equal(submitted.item.status, 'PENDING');
    assert.equal('askedByAuthId' in submitted.item, false);
    assert.equal(calls[0].askedByAuthId, 'biz-1');

    const list = await fetch(`${base}/api/v1/tenders/${tenderRef}/faqs`);
    const listed = await list.json();
    assert.equal(list.status, 200);
    assert.equal(listed.items[0].status, 'PENDING');
    assert.deepEqual(calls[1].OR, [{ status: 'PUBLISHED' }, { askedByAuthId: 'biz-1' }]);
  });
});

test('organization can publish a direct FAQ and answer applicant questions only on its own tender', async () => {
  const writes = [];
  const db = {
    organizationProcurement: { async findFirst({ where }) { return where.ownerAuthId === 'org-1' ? { id: procurementId, referenceNumber: tenderRef, status: 'PUBLISHED' } : null; } },
    tender: { async findUnique() { return { id: tenderId }; } },
    tenderFaq: {
      async create({ data }) { writes.push(data); return { id: faqId, ...data, createdAt: new Date() }; },
      async findFirst({ where }) { return where.id === faqId ? { id: faqId, tenderId, status: 'PENDING' } : null; },
      async update({ data }) { writes.push(data); return { id: faqId, question: 'Question', ...data }; },
    },
  };
  await withApi({ db, auth: identity('org-1', 'ORGANIZATION') }, async base => {
    const create = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/faqs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Are substitutions allowed?', answer: 'Only where the notice permits them.' }),
    });
    const created = await create.json();
    assert.equal(create.status, 201);
    assert.equal(created.item.status, 'PUBLISHED');
    assert.equal('answeredByAuthId' in created.item, false);

    const answer = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/faqs/${faqId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: 'Use the equivalent specification form.', status: 'PUBLISHED' }),
    });
    const answered = await answer.json();
    assert.equal(answer.status, 200);
    assert.equal(answered.item.answer, 'Use the equivalent specification form.');
    assert.equal(writes[1].status, 'PUBLISHED');
  });
  await withApi({ db, auth: identity('org-2', 'ORGANIZATION') }, async base => {
    const denied = await fetch(`${base}/api/v1/organization/procurements/${procurementId}/faqs`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Hidden', answer: 'No' }),
    });
    assert.equal(denied.status, 404);
  });
  assert.equal(writes.length, 2);
});

test('tender versions are returned newest-first without editor identity', async () => {
  const versions = [
    { id: 'v2', versionNumber: 2, snapshot: { title: 'Updated tender' }, changedFields: ['title'], createdByAuthId: 'private-org-id', source: 'ORGANIZATION_EDIT' },
    { id: 'v1', versionNumber: 1, snapshot: { title: 'Original tender' }, changedFields: [], createdByAuthId: null, source: 'INITIAL_PUBLISH' },
  ];
  const db = {
    tender: { async findUnique() { return { id: tenderId }; } },
    tenderVersion: { async findMany({ where, orderBy, select }) { assert.equal(where.tenderId, tenderId); assert.deepEqual(orderBy, { versionNumber: 'desc' }); assert.equal(select.createdByAuthId, undefined); return versions.map(({ createdByAuthId, ...item }) => item); } },
  };
  await withApi({ db, auth: identity('biz-1', 'BUSINESS') }, async base => {
    const response = await fetch(`${base}/api/v1/tenders/${tenderId}/versions`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.items[0].versionNumber, 2);
    assert.equal('createdByAuthId' in body.items[0], false);
  });
});

test('organization tender edits append an immutable version containing changed public fields', async () => {
  const createdVersions = [];
  const previousTender = { ...tender, title: 'Original lab equipment tender', description: 'Original scope', requiredDocuments: ['Registration'] };
  const currentTender = { ...previousTender, title: 'Updated lab equipment tender', description: 'Expanded scope', requiredDocuments: ['Registration', 'Tax certificate'] };
  const procurement = {
    id: procurementId, ownerAuthId: 'org-1', referenceNumber: tenderRef, status: 'PUBLISHED',
    title: currentTender.title, description: currentTender.description, category: currentTender.category,
    submissionDeadline: currentTender.submissionDeadline, estimatedValue: currentTender.estimatedValue,
    minTurnover: 0, minExperienceYears: 0, requiredCertifications: [], locationRestrictions: [], requiredDocuments: currentTender.requiredDocuments,
  };
  const db = {
    organizationProcurement: {
      async updateMany() { return { count: 1 }; },
      async findUnique() { return procurement; },
    },
    tender: {
      async findUnique() { return previousTender; },
      async upsert() { return currentTender; },
    },
    tenderVersion: {
      async findFirst({ where }) { return [...createdVersions].filter(row => row.tenderId === where.tenderId).sort((a, b) => b.versionNumber - a.versionNumber)[0] || null; },
      async create({ data }) { const version = { id: `v${data.versionNumber}`, ...data }; createdVersions.push(version); return version; },
    },
  };
  await withApi({ db, auth: identity('org-1', 'ORGANIZATION') }, async base => {
    const response = await fetch(`${base}/api/v1/organization/procurements/${procurementId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: currentTender.title }),
    });
    assert.equal(response.status, 200);
  });
  assert.equal(createdVersions.length, 2);
  assert.equal(createdVersions[0].versionNumber, 1);
  assert.equal(createdVersions[0].source, 'BASELINE');
  assert.equal(createdVersions[1].versionNumber, 2);
  assert.equal(createdVersions[1].snapshot.title, currentTender.title);
  assert.ok(createdVersions[1].changedFields.includes('title'));
  assert.ok(createdVersions[1].changedFields.includes('description'));
});

test('saved opportunities show unseen tender versions and deadline reminders, then acknowledge only for their owner', async () => {
  const deadline = new Date(Date.now() + 3 * 86_400_000);
  let updatedWhere = null;
  let updatedData = null;
  const db = {
    savedOpportunity: {
      async findMany() { return [{ id: 'save-1', ownerAuthId: 'biz-1', tenderId, seenVersion: 1, tender: { ...tender, submissionDeadline: deadline } }]; },
      async updateMany({ where, data }) { updatedWhere = where; updatedData = data; return { count: where.ownerAuthId === 'biz-1' ? 1 : 0 }; },
    },
    tenderVersion: { async findFirst() { return { versionNumber: 3 }; } },
    tender: { async findUnique() { return { id: tenderId }; } },
  };
  await withApi({ db, auth: identity('biz-1', 'BUSINESS') }, async base => {
    const list = await fetch(`${base}/api/v1/saved-opportunities`);
    const body = await list.json();
    assert.equal(body.items[0].unseenVersionCount, 2);
    assert.equal(body.items[0].reminderState, 'DUE_WITHIN_7_DAYS');

    const acknowledge = await fetch(`${base}/api/v1/saved-opportunities/${tenderId}/acknowledge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(acknowledge.status, 200);
    assert.equal(updatedWhere.ownerAuthId, 'biz-1');
    assert.equal(updatedData.seenVersion, 3);
  });
});

test('business users cannot mutate tender catalogue records through the extraction endpoint', async () => {
  let writes = 0;
  const db = { tender: { async findUnique() { return tender; }, async update() { writes += 1; } } };
  await withApi({ db, auth: identity('biz-1', 'BUSINESS') }, async base => {
    const response = await fetch(`${base}/api/v1/tenders/extract`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenderId, text: 'Tender Title: Updated scope\nMinimum turnover: 20 lakhs' }),
    });
    assert.equal(response.status, 403);
  });
  assert.equal(writes, 0);
});
