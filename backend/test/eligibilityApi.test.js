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

test('POST /api/v1/eligibility/evaluate returns 401 when no token is supplied', async () => {
  await withApi(
    { db: {}, auth: (_req, _res, next) => next(new HttpError(401, 'Sign in required.')) },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minTurnover: 40 }),
      });
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.match(data.message, /Sign in required/);
    }
  );
});

test('POST /api/v1/eligibility/evaluate returns 403 when user is not a BUSINESS role', async () => {
  await withApi(
    { db: {}, auth: (req, _res, next) => { req.auth = { id: 'org-user-1', role: 'ORGANIZATION' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minTurnover: 40 }),
      });
      assert.equal(response.status, 403);
    }
  );
});

test('POST /api/v1/eligibility/evaluate evaluates successfully against DB business profile', async () => {
  let queriedOwnerAuthId = null;
  const mockDb = {
    businessProfile: {
      async findUnique({ where }) {
        queriedOwnerAuthId = where.ownerAuthId;
        return {
          businessName: 'Apex Industries',
          annualTurnover: 75,
          yearsOfExperience: 6,
          certifications: ['MSME', 'ISO 9001'],
          location: 'Tamil Nadu',
        };
      },
    },
  };

  await withApi(
    { db: mockDb, auth: (req, _res, next) => { req.auth = { id: 'auth-user-biz-1', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          minTurnover: 50,
          minExperienceYears: 3,
          requiredCertifications: ['MSME'],
          locationRestrictions: ['Tamil Nadu'],
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(queriedOwnerAuthId, 'auth-user-biz-1');

      const data = await response.json();
      assert.equal(data.status, 'Eligible');
      assert.equal(data.passedCriteria.length, 4);
      assert.equal(data.failedCriteria.length, 0);
      assert.equal(data.unknownCriteria.length, 0);
      assert.ok(data.summary.includes('All evaluated mandatory criteria meet'));
      assert.ok(data.disclaimer.includes('preliminary assessment'));
    }
  );
});

test('POST /api/v1/eligibility/evaluate scopes DB query to authenticated user and ignores untrusted identity in body', async () => {
  let queriedOwnerAuthId = null;
  const mockDb = {
    businessProfile: {
      async findUnique({ where }) {
        queriedOwnerAuthId = where.ownerAuthId;
        return {
          businessName: 'Genuine Biz',
          annualTurnover: 100,
          yearsOfExperience: 10,
          certifications: ['MSME'],
        };
      },
    },
  };

  await withApi(
    { db: mockDb, auth: (req, _res, next) => { req.auth = { id: 'real-authenticated-id', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          minTurnover: 50,
          // Attacker attempts to spoof identity
          ownerAuthId: 'victim-id-999',
          businessProfile: {
            ownerAuthId: 'victim-id-999',
            annualTurnover: 5, // should be ignored because DB profile exists for authenticated user
          },
        }),
      });

      assert.equal(response.status, 200);
      // Ensures the DB lookup was strictly scoped to the authenticated caller
      assert.equal(queriedOwnerAuthId, 'real-authenticated-id');

      const data = await response.json();
      assert.equal(data.status, 'Eligible');
      assert.equal(data.criteria.find(c => c.name === 'Minimum Turnover')?.businessValue, 100);
    }
  );
});

test('POST /api/v1/eligibility/evaluate falls back safely to body profile when DB has no record', async () => {
  const mockDb = {
    businessProfile: {
      async findUnique() {
        return null; // No record in database
      },
    },
  };

  await withApi(
    { db: mockDb, auth: (req, _res, next) => { req.auth = { id: 'user-without-db-profile', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          minTurnover: 40,
          minExperienceYears: 5,
          businessProfile: {
            businessName: 'Dynamic Solutions',
            annualTurnover: 30, // Below 40 -> FAIL
            yearsOfExperience: 7,
          },
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, 'Not Eligible');
      assert.equal(data.failedCriteria.length, 1);
      assert.equal(data.failedCriteria[0].name, 'Minimum Turnover');
    }
  );
});

test('POST /api/v1/eligibility/evaluate accepts nested criteria format', async () => {
  await withApi(
    { db: {}, auth: (req, _res, next) => { req.auth = { id: 'biz-user-nested', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          criteria: {
            minTurnover: 25,
            minExperienceYears: 2,
            requiredCertifications: ['ISO 9001'],
          },
          businessProfile: {
            annualTurnover: 30,
            yearsOfExperience: 3,
            certifications: ['ISO 9001'],
          },
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, 'Eligible');
      assert.equal(data.passedCriteria.length, 3);
    }
  );
});

test('POST /api/v1/eligibility/evaluate handles missing DB and body profile with UNKNOWN status and missingInformation', async () => {
  // DB has no businessProfile model, body supplies only criteria
  await withApi(
    { db: {}, auth: (req, _res, next) => { req.auth = { id: 'biz-user-empty', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          minTurnover: 50,
          minExperienceYears: 3,
        }),
      });

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, 'Potentially Eligible');
      assert.equal(data.unknownCriteria.length, 2);
      assert.ok(data.missingInformation.length >= 2);
      assert.ok(data.missingInformation.some(m => m.includes('Business profile is not configured')));
    }
  );
});

test('POST /api/v1/eligibility/evaluate returns 400 on negative numeric criteria', async () => {
  await withApi(
    { db: {}, auth: (req, _res, next) => { req.auth = { id: 'biz-user-neg', role: 'BUSINESS' }; next(); } },
    async (base) => {
      const response = await fetch(`${base}/api/v1/eligibility/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minTurnover: -10 }),
      });

      assert.equal(response.status, 400);
      const data = await response.json();
      assert.match(data.message, /Request validation failed/);
    }
  );
});
