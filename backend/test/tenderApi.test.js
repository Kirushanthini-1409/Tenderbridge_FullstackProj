import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/errors.js';

/**
 * Tests for GET /api/v1/tenders (list) and GET /api/v1/tenders/:id (detail).
 *
 * All tests use in-process HTTP servers with injected mock databases — no real
 * Prisma client or live database is used.
 */

async function withApi(options, run) {
  const server = createServer(createApp(options));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
}

/** Business user auth stub — used in most tests. */
const asBusiness = (req, _res, next) => {
  req.auth = { id: 'user-biz-1', role: 'BUSINESS' };
  next();
};

/** Minimal in-memory Tender store matching the Prisma Tender model fields. */
function createTenderDb(tenders = []) {
  return {
    tender: {
      async findMany({ where = {}, orderBy, skip = 0, take } = {}) {
        let results = [...tenders];

        // category filter (case-insensitive equals)
        if (where.category?.equals) {
          const needle = where.category.equals.toLowerCase();
          results = results.filter(t => (t.category || '').toLowerCase() === needle);
        }

        // search filter (title | referenceNumber | issuingAuthority | category)
        if (where.OR) {
          results = results.filter(t =>
            where.OR.some(clause => {
              const [field, op] = Object.entries(clause)[0];
              const value = (t[field] || '').toLowerCase();
              const search = (op.contains || '').toLowerCase();
              return value.includes(search);
            })
          );
        }

        // deadline range filter
        const dl = where.submissionDeadline;
        if (dl) {
          if (dl.gte) results = results.filter(t => t.submissionDeadline && new Date(t.submissionDeadline) >= dl.gte);
          if (dl.lte) results = results.filter(t => t.submissionDeadline && new Date(t.submissionDeadline) <= dl.lte);
        }

        // Simple ordering: by submissionDeadline asc nulls last
        results.sort((a, b) => {
          const da = a.submissionDeadline ? new Date(a.submissionDeadline).getTime() : Infinity;
          const db2 = b.submissionDeadline ? new Date(b.submissionDeadline).getTime() : Infinity;
          return da - db2;
        });

        // Pagination
        const sliced = results.slice(skip, take != null ? skip + take : undefined);
        return sliced;
      },

      async count({ where = {} } = {}) {
        const all = await this.findMany({ where });
        return all.length;
      },

      async findUnique({ where }) {
        if (where.id)              return tenders.find(t => t.id === where.id) ?? null;
        if (where.referenceNumber) return tenders.find(t => t.referenceNumber === where.referenceNumber) ?? null;
        return null;
      },
    },
  };
}

const sampleTenders = [
  {
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-000000000001',
    referenceNumber: 'TN/EDU/2026/001',
    title: 'Supply of Desktop Computers',
    category: 'Computers',
    issuingAuthority: 'Tamil Nadu Education Dept',
    status: 'Active',
    submissionDeadline: new Date('2026-12-01T12:00:00Z'),
    estimatedValue: 5000000,
    officialLink: 'https://example.gov.in/tender/001',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
  },
  {
    id: 'b2c3d4e5-f6a7-4b8c-9d0e-000000000002',
    referenceNumber: 'MH/PWD/2026/042',
    title: 'Construction of Rural Roads',
    category: 'Construction',
    issuingAuthority: 'Maharashtra PWD',
    status: 'Active',
    submissionDeadline: new Date('2026-11-15T12:00:00Z'),
    estimatedValue: 50000000,
    officialLink: null,
    createdAt: new Date('2026-10-02'),
    updatedAt: new Date('2026-10-02'),
  },
  {
    id: 'c3d4e5f6-a7b8-4c9d-0e1f-000000000003',
    referenceNumber: 'DL/HEALTH/2026/009',
    title: 'Supply of Medical Diagnostic Equipment',
    category: 'Medical',
    issuingAuthority: 'Delhi Health Dept',
    status: 'Active',
    submissionDeadline: new Date('2026-12-20T12:00:00Z'),
    estimatedValue: 12000000,
    officialLink: 'https://example.gov.in/tender/003',
    createdAt: new Date('2026-10-03'),
    updatedAt: new Date('2026-10-03'),
  },
];

// ── Authentication & authorization ─────────────────────────────────────────

test('GET /api/v1/tenders returns 401 when no token is supplied', async () => {
  await withApi(
    {
      db: createTenderDb(sampleTenders),
      auth: (_req, _res, next) => next(new HttpError(401, 'Sign in required.')),
    },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders`);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.match(body.message, /Sign in/);
    }
  );
});

test('GET /api/v1/tenders/:id returns 401 when no token is supplied', async () => {
  await withApi(
    {
      db: createTenderDb(sampleTenders),
      auth: (_req, _res, next) => next(new HttpError(401, 'Sign in required.')),
    },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders/TN%2FEDU%2F2026%2F001`);
      assert.equal(res.status, 401);
    }
  );
});

// ── List endpoint — success ────────────────────────────────────────────────

test('GET /api/v1/tenders returns all tenders with correct pagination shape', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders`);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.ok(Array.isArray(body.items), 'items must be an array');
      assert.equal(body.items.length, 3);
      assert.ok(body.pagination, 'pagination must be present');
      assert.equal(body.pagination.page, 1);
      assert.equal(body.pagination.pageSize, 20);
      assert.equal(body.pagination.total, 3);
      assert.equal(body.pagination.totalPages, 1);
    }
  );
});

test('GET /api/v1/tenders returns items ordered by nearest deadline first', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders`);
      const { items } = await res.json();
      // 2026-11-15 < 2026-12-01 < 2026-12-20
      assert.equal(items[0].referenceNumber, 'MH/PWD/2026/042');
      assert.equal(items[1].referenceNumber, 'TN/EDU/2026/001');
      assert.equal(items[2].referenceNumber, 'DL/HEALTH/2026/009');
    }
  );
});

// ── List endpoint — filtering ──────────────────────────────────────────────

test('GET /api/v1/tenders filters by category (case-insensitive)', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders?category=computers`);
      assert.equal(res.status, 200);
      const { items, pagination } = await res.json();
      assert.equal(items.length, 1);
      assert.equal(items[0].referenceNumber, 'TN/EDU/2026/001');
      assert.equal(pagination.total, 1);
    }
  );
});

test('GET /api/v1/tenders filters by search across title, reference, and authority', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      // Matches title
      const byTitle = await fetch(`${base}/api/v1/tenders?search=medical`);
      const titleBody = await byTitle.json();
      assert.equal(titleBody.items.length, 1);
      assert.equal(titleBody.items[0].referenceNumber, 'DL/HEALTH/2026/009');

      // Matches issuing authority
      const byAuthority = await fetch(`${base}/api/v1/tenders?search=maharashtra`);
      const authBody = await byAuthority.json();
      assert.equal(authBody.items.length, 1);
      assert.equal(authBody.items[0].referenceNumber, 'MH/PWD/2026/042');

      // Matches reference number
      const byRef = await fetch(`${base}/api/v1/tenders?search=TN%2FEDU`);
      const refBody = await byRef.json();
      assert.equal(refBody.items.length, 1);
      assert.equal(refBody.items[0].referenceNumber, 'TN/EDU/2026/001');
    }
  );
});

test('GET /api/v1/tenders returns empty items array when no tenders match filters', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders?search=xyznotfound`);
      assert.equal(res.status, 200);
      const { items, pagination } = await res.json();
      assert.equal(items.length, 0);
      assert.equal(pagination.total, 0);
    }
  );
});

test('GET /api/v1/tenders filters by deadlineFrom and deadlineTo', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      // Only tenders with deadline in November 2026
      const res = await fetch(
        `${base}/api/v1/tenders?deadlineFrom=2026-11-01&deadlineTo=2026-11-30`
      );
      assert.equal(res.status, 200);
      const { items } = await res.json();
      assert.equal(items.length, 1);
      assert.equal(items[0].referenceNumber, 'MH/PWD/2026/042');
    }
  );
});

test('GET /api/v1/tenders rejects invalid deadlineTo before deadlineFrom with 400', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const res = await fetch(
        `${base}/api/v1/tenders?deadlineFrom=2026-12-01&deadlineTo=2026-11-01`
      );
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.message, /[Vv]alidation/);
    }
  );
});

// ── List endpoint — pagination ─────────────────────────────────────────────

test('GET /api/v1/tenders respects page and pageSize parameters', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      // Page 1 of 2, 2 items per page
      const page1 = await fetch(`${base}/api/v1/tenders?page=1&pageSize=2`);
      assert.equal(page1.status, 200);
      const body1 = await page1.json();
      assert.equal(body1.items.length, 2);
      assert.equal(body1.pagination.page, 1);
      assert.equal(body1.pagination.pageSize, 2);
      assert.equal(body1.pagination.total, 3);
      assert.equal(body1.pagination.totalPages, 2);

      // Page 2 of 2
      const page2 = await fetch(`${base}/api/v1/tenders?page=2&pageSize=2`);
      const body2 = await page2.json();
      assert.equal(body2.items.length, 1);
      assert.equal(body2.pagination.page, 2);

      // The two pages together cover all 3 items without duplicates
      const allIds = [...body1.items, ...body2.items].map(t => t.id);
      assert.equal(new Set(allIds).size, 3);
    }
  );
});

test('GET /api/v1/tenders rejects page=0 and pageSize=0 with 400', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const p0 = await fetch(`${base}/api/v1/tenders?page=0`);
      assert.equal(p0.status, 400);

      const ps0 = await fetch(`${base}/api/v1/tenders?pageSize=0`);
      assert.equal(ps0.status, 400);
    }
  );
});

// ── List endpoint — 503 when db.tender unavailable ─────────────────────────

test('GET /api/v1/tenders returns 503 when tender storage is unavailable', async () => {
  await withApi(
    { db: {}, auth: asBusiness },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.match(body.message, /not available|unavailable/i);
    }
  );
});

// ── Detail endpoint ────────────────────────────────────────────────────────

test('GET /api/v1/tenders/:id returns a tender by UUID', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const id = 'a1b2c3d4-e5f6-4a7b-8c9d-000000000001';
      const res = await fetch(`${base}/api/v1/tenders/${id}`);
      assert.equal(res.status, 200);
      const { item } = await res.json();
      assert.equal(item.id, id);
      assert.equal(item.referenceNumber, 'TN/EDU/2026/001');
      assert.equal(item.title, 'Supply of Desktop Computers');
    }
  );
});

test('GET /api/v1/tenders/:id returns a tender by reference number', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const res = await fetch(
        `${base}/api/v1/tenders/${encodeURIComponent('MH/PWD/2026/042')}`
      );
      assert.equal(res.status, 200);
      const { item } = await res.json();
      assert.equal(item.referenceNumber, 'MH/PWD/2026/042');
      assert.equal(item.category, 'Construction');
    }
  );
});

test('GET /api/v1/tenders/:id returns 404 for an unknown ID', async () => {
  await withApi(
    { db: createTenderDb(sampleTenders), auth: asBusiness },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders/does-not-exist`);
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.match(body.message, /[Nn]ot found/);
    }
  );
});

test('GET /api/v1/tenders/:id returns 503 when tender storage is unavailable', async () => {
  await withApi(
    { db: {}, auth: asBusiness },
    async (base) => {
      const res = await fetch(`${base}/api/v1/tenders/some-id`);
      assert.equal(res.status, 503);
    }
  );
});

test('POST /api/v1/tenders/extract persists extracted fields to the requested tender', async () => {
  const id = 'a1b2c3d4-e5f6-4a7b-8c9d-000000000001';
  let saved;
  const db = {
    organizationProcurement: { async findFirst({ where }) { return where.ownerAuthId === 'org-owner' ? { id: 'proc-1' } : null; } },
    tender: {
    async findUnique() { return { id, referenceNumber: 'TB-SAMPLE-001', submissionDeadline: null, estimatedValue: null }; },
    async update({ where, data }) { saved = { where, data }; return { id, ...data }; },
  } };
  const asOrganization = (req, _res, next) => { req.auth = { id: 'org-owner', role: 'ORGANIZATION' }; next(); };
  await withApi({ db, auth: asOrganization }, async base => {
    const response = await fetch(`${base}/api/v1/tenders/extract`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenderId: 'TB-SAMPLE-001', text: 'Tender Title: Supply of computers\nDepartment: Sample Digital Department\nSubmission Deadline: 2026-12-15\nEstimated Value: Rs 20 lakhs\nMinimum Annual Turnover: 30 lakhs\nExperience of at least 3 years\nISO 9001 PAN Card' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.item.tenderId, id);
    assert.match(saved.data.eligibilityCriteria.summary, /Supply of computers/);
    assert.equal(saved.data.category, 'IT & Computers');
    assert.deepEqual(saved.data.eligibilityCriteria.requiredCertifications, ['ISO 9001']);
    assert.ok(saved.data.requiredDocuments.includes('PAN Card'));
  });
});

test('POST /api/v1/tenders/extract rejects an empty source with a clear message', async () => {
  await withApi({ db: {}, auth: asBusiness }, async base => {
    const response = await fetch(`${base}/api/v1/tenders/extract`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '' }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /Paste tender text or upload a PDF/);
  });
});
