# TenderBridge Express API

Node/Express API for the member 3 domains: application tracking, saved opportunities, JV/consortium listings, organization procurement listings, and verification review. The existing `backend/app/` Python scaffold and its AI-related files are left untouched. The separate Python AI service remains outside this API.

## Local setup

1. Install Node.js 20 or newer and PostgreSQL (or create a Supabase PostgreSQL project).
2. From `backend`, copy `.env.example` to `.env` and set `DATABASE_URL` and `SUPABASE_URL`. Use your database's direct PostgreSQL connection string; do not commit `.env` or any Supabase secret.
3. Run `npm install` and `npm run db:generate`.
4. Run `npm run db:migrate` to apply the checked-in initial migration to your development database.
5. Run `npm run dev`. The API listens on port 4000 by default. Set frontend `VITE_API_BASE_URL=http://localhost:4000`.

`npm start` runs the API without the file watcher. `npm test` runs the API tests. `npm run db:deploy` applies checked-in migrations in deployment. `npm run db:seed` upserts three clearly labeled fictional `[DEMO]` tender records for a presentation; it does not create accounts or verification records.

## Authentication and roles

Every `/api/v1` route except `/api/v1/health` needs `Authorization: Bearer <Supabase access token>`. Tokens are verified against the project's JWKS and issuer/audience. For a legacy Supabase project using HS256, set the private `SUPABASE_JWT_SECRET`; never expose it to the frontend. Configure the exact frontend origins in comma-separated `CORS_ORIGINS`.

The backend reads `app_metadata.role` from the verified token and accepts `BUSINESS`, `ORGANIZATION`, or `ADMIN`. A missing role defaults to baseline `BUSINESS` access; `ORGANIZATION` and `ADMIN` must be assigned by trusted server-side Supabase administration. Values in user-editable metadata are ignored.

Organizations are scoped to the authenticated Supabase user ID (`sub`). This is a single-owner contract until the team agrees on shared organization membership. Admin users may see all organization listings. Do not change these scopes to trust IDs supplied by the browser.

## API contract

All JSON collections use `{ "items": [...] }`; created or updated records use `{ "item": ... }`. Errors use `{ "message": "...", "details"?: [...] }`.

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | public | Health check |
| GET | `/api/v1/applications` | BUSINESS | List the caller's tracked applications and their tender |
| POST | `/api/v1/applications` | BUSINESS | Start tracking a tender (UUID or reference number); defaults to `INTERESTED` |
| PUT | `/api/v1/applications/:applicationId` | BUSINESS | Update status, notes, `referenceNo`, or `submissionDate` on the caller's application |
| GET | `/api/v1/saved-opportunities` | BUSINESS | List saved tenders |
| POST / DELETE | `/api/v1/saved-opportunities/:tenderId` | BUSINESS | Save or remove a tender, by UUID or reference number |
| GET / PUT | `/api/v1/profile` | BUSINESS | Read or save the caller's business profile |
| POST | `/api/v1/eligibility/evaluate` | BUSINESS | Evaluate a business profile against supplied tender eligibility criteria |
| POST | `/api/v1/tenders/extract` | Authenticated user | Extract structured tender details from supplied text; this does not call or replace the separate AI service |
| GET | `/api/v1/tenders` | BUSINESS / ORGANIZATION / ADMIN | Search and paginate shared tender catalogue |
| GET | `/api/v1/tenders/:id` | BUSINESS / ORGANIZATION / ADMIN | Retrieve a tender by UUID or reference number |
| POST | `/api/v1/admin/tenders` | ADMIN | Add a government tender to the shared catalogue |
| GET / POST | `/api/v1/jv/:tenderId` | BUSINESS | List or publish a partner listing, by tender UUID or reference number |
| GET / POST | `/api/v1/organization/procurements` | ORGANIZATION; ADMIN may list all | List owned procurements or create one |
| PATCH | `/api/v1/organization/procurements/:id` | ORGANIZATION / ADMIN | Update an owned listing (admins can update any listing) |
| POST | `/api/v1/organization/procurements/:id/pdf` | ORGANIZATION | Validate, store (up to 8 MB), and extract text from an owned procurement PDF |
| GET | `/api/v1/organization/procurements/:id/pdf` | ORGANIZATION / ADMIN | View a stored PDF with owner checks |
| GET | `/api/v1/tenders/:id/pdf` | BUSINESS / ORGANIZATION / ADMIN | View a PDF attached to a published organization tender |
| POST | `/api/v1/verification-requests` | BUSINESS / ORGANIZATION | Submit a verification request and document metadata |
| GET | `/api/v1/admin/verification-requests` | ADMIN | List requests; optional `status` and `type` query filters |
| PATCH | `/api/v1/admin/verification-requests/:id` | ADMIN | Decide `{ "status": "APPROVED"|"REJECTED", "decisionNote"?: string }` once |

Organization procurement submissions use the existing form fields. `intent: "draft"` stores `DRAFT`; `intent: "publish"` stores `PUBLISHED` after organization verification. Estimated value and minimum turnover are stored as numeric currency amounts, in rupees. The frontend converts the minimum turnover input from ₹ lakhs to rupees before sending it. A procurement with a newly uploaded PDF is first saved as a draft so the organization can review extraction before publishing.

## Frontend integration status

The frontend now supports tracking a tender by UUID/reference, saving or removing a tender by UUID/reference, managing organization procurements, and listing/publishing JV partner entries. The verification form submits business or organization details to the request queue, and the admin screen lists requests and records approval decisions.

Verification submissions contain metadata and optional document URL records; they do not upload verification evidence. Procurement PDF uploads are separate: the API stores PDF bytes in PostgreSQL, extracts text from common unencrypted PDF content streams, and returns an explicit empty extraction for scanned/unrecognized files. Extracted content is unverified and must be reviewed before publication.

Applications, saved opportunities, and partner listings reference a `Tender` row. The repository does not currently contain the shared tender ingestion/catalog service or its confirmed data contract. No endpoint fabricates missing tenders; these operations return 404 until the authoritative tender rows are loaded. The tender ingestion owner must confirm field mapping and identifier stability before these features can run against shared production data.

Eligibility evaluation reads the signed-in user's business profile when available. A profile may be supplied with the request for an evaluation, but the API ignores identity fields in that body and never saves that submitted profile. Tender text extraction is a deterministic backend helper with optional structured AI client injection; it is not connected to the separately owned Python/LangChain/Gemini service.

## Storage and integration boundaries

Procurement PDFs are stored in the database, and their download routes enforce organization ownership or published-tender visibility. Verification evidence is still metadata-only. Never send a Supabase service-role key to the browser.

The AI service remains separate. This API neither calls nor owns the Python/LangChain/Gemini service. Cross-service auth, shared tender schema, organization membership, and file-storage contracts remain integration work for the relevant owners.

## Database and migrations

`prisma/schema.prisma` defines the PostgreSQL schema. For local development, `npm run db:migrate -- --name <name>` creates a migration and applies it. Commit the generated `prisma/migrations/` files. In deployment, run `npm run db:deploy`. Do not run schema resets against a shared database. No credentials, admin accounts, demo organizations, or fake tender records are seeded.
