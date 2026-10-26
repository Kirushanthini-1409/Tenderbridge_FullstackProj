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

// In-memory mock storage isolated specifically for test execution
function createMockDb(initialProfiles = {}) {
  const store = new Map(Object.entries(initialProfiles));
  return {
    store,
    businessProfile: {
      async findUnique({ where }) {
        return store.get(where.ownerAuthId) || null;
      },
      async upsert({ where, create, update }) {
        const existing = store.get(where.ownerAuthId);
        const record = existing
          ? { ...existing, ...update, ownerAuthId: where.ownerAuthId, updatedAt: new Date() }
          : { ...create, ownerAuthId: where.ownerAuthId, id: 'profile-uuid-1', createdAt: new Date(), updatedAt: new Date() };
        store.set(where.ownerAuthId, record);
        return record;
      },
    },
  };
}

test('GET /api/v1/profile returns 401 when no token is supplied', async () => {
  await withApi(
    { db: createMockDb(), auth: (_req, _res, next) => next(new HttpError(401, 'Sign in required.')) },
    async (base) => {
      const response = await fetch(`${base}/api/v1/profile`);
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.message, /Sign in required/);
    }
  );
});

test('PUT /api/v1/profile returns 401 when no token is supplied', async () => {
  await withApi(
    { db: createMockDb(), auth: (_req, _res, next) => next(new HttpError(401, 'Sign in required.')) },
    async (base) => {
      const response = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: 'ABC Ltd',
          category: 'Computers',
          location: 'Chennai',
          annualTurnover: 50,
          yearsOfExperience: 5,
        }),
      });
      assert.equal(response.status, 401);
    }
  );
});

test('GET and PUT /api/v1/profile return 403 when user is not a BUSINESS role', async () => {
  await withApi(
    { db: createMockDb(), auth: (req, _res, next) => { req.auth = { id: 'org-1', role: 'ORGANIZATION' }; next(); } },
    async (base) => {
      const getRes = await fetch(`${base}/api/v1/profile`);
      assert.equal(getRes.status, 403);

      const putRes = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: 'ABC Ltd',
          category: 'Computers',
          location: 'Chennai',
          annualTurnover: 50,
          yearsOfExperience: 5,
        }),
      });
      assert.equal(putRes.status, 403);
    }
  );
});

test('GET /api/v1/profile returns 404 when profile does not exist', async () => {
  await withApi(
    { db: createMockDb(), auth: (req, _res, next) => { req.auth = { id: 'new-user', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/profile`);
      assert.equal(response.status, 404);
      const data = await response.json();
      assert.match(data.message, /Profile not found/);
    }
  );
});

test('GET /api/v1/profile retrieves the authenticated business owner profile', async () => {
  const db = createMockDb({
    'user-biz-123': {
      id: 'prof-123',
      ownerAuthId: 'user-biz-123',
      businessName: 'Apex Enterprise',
      category: 'IT Hardware',
      location: 'Coimbatore',
      annualTurnover: 80,
      yearsOfExperience: 6,
      certifications: ['MSME', 'ISO 9001'],
    },
  });

  await withApi(
    { db, auth: (req, _res, next) => { req.auth = { id: 'user-biz-123', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/profile`);
      assert.equal(response.status, 200);
      const { item } = await response.json();
      assert.equal(item.businessName, 'Apex Enterprise');
      assert.equal(item.category, 'IT Hardware');
      assert.equal(item.location, 'Coimbatore');
      assert.equal(item.annualTurnover, 80);
      assert.equal(item.yearsOfExperience, 6);
      assert.deepEqual(item.certifications, ['MSME', 'ISO 9001']);
    }
  );
});

test('PUT /api/v1/profile creates or updates profile for authenticated business owner', async () => {
  const db = createMockDb();

  await withApi(
    { db, auth: (req, _res, next) => { req.auth = { id: 'user-create-1', role: 'BUSINESS' }; next(); } },
    async (base) => {
      // 1. Create
      const createRes = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: 'Vanguard Tech',
          category: 'Computers',
          location: 'Chennai',
          annualTurnover: 45,
          yearsOfExperience: 4,
          certifications: ['MSME'],
        }),
      });
      assert.equal(createRes.status, 200);
      const createData = await createRes.json();
      assert.equal(createData.item.businessName, 'Vanguard Tech');
      assert.equal(createData.item.ownerAuthId, 'user-create-1');

      // 2. Read back
      const getRes = await fetch(`${base}/api/v1/profile`);
      assert.equal(getRes.status, 200);
      const getData = await getRes.json();
      assert.equal(getData.item.businessName, 'Vanguard Tech');
      assert.equal(getData.item.annualTurnover, 45);

      // 3. Update
      const updateRes = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: 'Vanguard Technologies Private Limited',
          category: 'Computers',
          location: 'Chennai',
          annualTurnover: 65,
          yearsOfExperience: 5,
          certifications: ['MSME', 'ISO 27001'],
        }),
      });
      assert.equal(updateRes.status, 200);
      const updateData = await updateRes.json();
      assert.equal(updateData.item.businessName, 'Vanguard Technologies Private Limited');
      assert.equal(updateData.item.annualTurnover, 65);
      assert.equal(updateData.item.yearsOfExperience, 5);
      assert.deepEqual(updateData.item.certifications, ['MSME', 'ISO 27001']);
    }
  );
});

test('PUT /api/v1/profile validates fields and rejects invalid values with 400', async () => {
  const db = createMockDb();

  await withApi(
    { db, auth: (req, _res, next) => { req.auth = { id: 'user-val-1', role: 'BUSINESS' }; next(); } },
    async (base) => {
      // Negative turnover
      const negTurnover = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: 'Test Biz',
          category: 'IT',
          location: 'Delhi',
          annualTurnover: -10,
          yearsOfExperience: 3,
        }),
      });
      assert.equal(negTurnover.status, 400);

      // Negative experience
      const negExp = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: 'Test Biz',
          category: 'IT',
          location: 'Delhi',
          annualTurnover: 50,
          yearsOfExperience: -2,
        }),
      });
      assert.equal(negExp.status, 400);

      // Empty business name
      const emptyName = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: '',
          category: 'IT',
          location: 'Delhi',
          annualTurnover: 50,
          yearsOfExperience: 3,
        }),
      });
      assert.equal(emptyName.status, 400);
    }
  );
});

test('Ensuring one user cannot access or modify another user profile', async () => {
  const db = createMockDb({
    'user-alice': {
      id: 'prof-alice',
      ownerAuthId: 'user-alice',
      businessName: 'Alice Industries',
      category: 'Textile',
      location: 'Surat',
      annualTurnover: 120,
      yearsOfExperience: 10,
      certifications: ['ISO 9001'],
    },
    'user-bob': {
      id: 'prof-bob',
      ownerAuthId: 'user-bob',
      businessName: 'Bob Crafts',
      category: 'Furniture',
      location: 'Jaipur',
      annualTurnover: 30,
      yearsOfExperience: 2,
      certifications: ['MSME'],
    },
  });

  // User Alice accesses profile
  await withApi(
    { db, auth: (req, _res, next) => { req.auth = { id: 'user-alice', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/profile`);
      assert.equal(response.status, 200);
      const { item } = await response.json();
      assert.equal(item.businessName, 'Alice Industries');
      assert.notEqual(item.businessName, 'Bob Crafts');

      // Alice tries to spoof Bob's ownerAuthId in PUT request body
      const attackRes = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ownerAuthId: 'user-bob', // Attacker attempt to overwrite Bob
          businessName: 'Hacked Bob',
          category: 'Furniture',
          location: 'Jaipur',
          annualTurnover: 50,
          yearsOfExperience: 3,
        }),
      });
      assert.equal(attackRes.status, 200);

      // Verify that Alice only updated Alice's own profile, NOT Bob's
      const aliceCheck = await fetch(`${base}/api/v1/profile`);
      const aliceData = await aliceCheck.json();
      assert.equal(aliceData.item.ownerAuthId, 'user-alice');
      assert.equal(aliceData.item.businessName, 'Hacked Bob');

      // Bob's profile remains untouched in database
      const bobRecord = await db.businessProfile.findUnique({ where: { ownerAuthId: 'user-bob' } });
      assert.equal(bobRecord.businessName, 'Bob Crafts');
      assert.equal(bobRecord.ownerAuthId, 'user-bob');
    }
  );
});

test('GET/PUT /api/v1/profile return 503 when db.businessProfile is unavailable', async () => {
  // DB without businessProfile model configured
  await withApi(
    { db: {}, auth: (req, _res, next) => { req.auth = { id: 'user-1', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const getRes = await fetch(`${base}/api/v1/profile`);
      assert.equal(getRes.status, 503);

      const putRes = await fetch(`${base}/api/v1/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: 'Test',
          category: 'IT',
          location: 'Chennai',
          annualTurnover: 50,
          yearsOfExperience: 3,
        }),
      });
      assert.equal(putRes.status, 503);
    }
  );
});
