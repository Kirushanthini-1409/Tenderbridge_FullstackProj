# INTEGRATION AUDIT REPORT — TENDERBRIDGE
**Status:** PHASE 1 COMPLETE (Read-Only Audit)  
**Date:** 2026-10-12  
**Target Integrated Workspace:** `c:\Users\ADMIN\Downloads\tenderbridge\TenderBridge_Integrated`  

---

## 1. Executive Summary & Source Folder Structure

Three project archives were extracted in the local workspace:
- **Member 1 (`TenderBridge_Member1`)**: Unpacked nested archive `TenderBridge_Fullstack-main (3).zip` &rarr; contains a 19-page standalone prototype in `member1/` (vanilla HTML/CSS/JS with direct Supabase SDK integration for Auth & User Metadata) alongside skeleton Node.js Express backend and Vite/React frontend apps.
- **Member 2 (`TenderBridge_Member2`)**: A complete, highly functional implementation of the Express backend and React/Vite frontend. Implements the Core Intelligence & Analysis Engine: deterministic eligibility engine (`eligibilityEngine.js`), AI tender extractor with Gemini REST API + fallback parser (`tenderExtractor.js`), business profile CRUD, tender discovery catalogue endpoint (`GET /api/v1/tenders`), and comprehensive automated unit test suites (`node:test`).
- **Member 3 (`TenderBridge_Member3`)**: Contains an almost identical Express backend and React frontend base derived from the same repository tree as Member 2, with full implementations of Business Workflows (Application Tracking with "Track a tender" modal, Saved Opportunities, JV Partner Directory, Organization Procurement Management, and Admin Verification Review workflows). Notably, Member 3 omitted the `GET /api/v1/tenders` endpoint in `app.js` and `tenderApi.test.js`, and lacks the `TenderListing` browse page in React routes.

### Structural Comparison

| Component | Member 1 (`TenderBridge_Member1`) | Member 2 (`TenderBridge_Member2`) | Member 3 (`TenderBridge_Member3`) |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React 18 + Vite (skeleton with many 0-byte stubs) + **19 standalone HTML/JS pages** (`member1/`) | React 18 + Vite (fully connected, rich UI, TenderListing, TenderDetails) | React 18 + Vite (identical components, but missing TenderListing / TenderDetails routes) |
| **Backend Framework** | Node.js Express (v5.2.1) + Prisma (v6.12.0) + 25 dummy 0-byte Python files in `app/` | Node.js Express (v5.2.1) + Prisma (v6.12.0) | Node.js Express (v5.2.1) + Prisma (v6.12.0) |
| **Python / Flask AI** | 0-byte placeholders in `backend/app/*` (no working Python code) | 0-byte placeholders in `backend/app/*` | 0-byte placeholders in `backend/app/*` |
| **Native AI Engine** | None | Built directly into Node backend via `tenderExtractor.js` (Google Gemini REST API + deterministic parser fallback) | Inherited from Member 2 |
| **Eligibility Engine** | 0-byte placeholder in `app/services/` | 100% pure deterministic engine in `src/services/eligibilityEngine.js` | Identical to Member 2 |
| **Auth Implementation** | Standalone Supabase JS client (`member1/assets/supabase.js`) + JWT JWKS verification (`backend/src/auth.js`) | JWT JWKS verification (`backend/src/auth.js`) | JWT JWKS verification (`backend/src/auth.js`) |

---

## 2. Detailed Technical Audit by Module

### 2.1 Backend Architecture & API Contracts

All three members converge on Node.js Express (`backend/src/app.js` using port 4000) rather than Python Flask. The 25 Python files located inside `backend/app/*` across all three submissions are completely empty (0 bytes).

#### Endpoints Implemented in Express (`/api/v1`):

| Endpoint | Method | Roles Allowed | Implemented By | Functionality & DB Interaction |
| :--- | :--- | :--- | :--- | :--- |
| `/health` | GET | Public | M1, M2, M3 | Basic health check returning `{ status: 'ok' }` |
| `/api/v1/applications` | GET | `BUSINESS` | M1, M2, M3 | Lists applications for `req.auth.id`, ordered by `updatedAt desc` |
| `/api/v1/applications` | POST | `BUSINESS` | M1, M2, M3 | Upserts application (`ownerAuthId_tenderId`), resolves UUID or reference number |
| `/api/v1/applications/:id` | PUT | `BUSINESS` | M1, M2, M3 | Updates application owned by `req.auth.id` |
| `/api/v1/saved-opportunities` | GET | `BUSINESS` | M1, M2, M3 | Lists saved opportunities with tender relation |
| `/api/v1/saved-opportunities/:tenderId` | POST | `BUSINESS` | M1, M2, M3 | Saves opportunity for `req.auth.id` |
| `/api/v1/saved-opportunities/:tenderId` | DELETE | `BUSINESS` | M1, M2, M3 | Deletes saved opportunity for `req.auth.id` |
| `/api/v1/jv/:tenderId` | GET | `BUSINESS` | M1, M2, M3 | Lists partner listings for tender |
| `/api/v1/jv/:tenderId` | POST | `BUSINESS` | M1, M2, M3 | Creates partner listing for `req.auth.id` |
| `/api/v1/organization/procurements` | GET | `ORGANIZATION`, `ADMIN` | M1, M2, M3 | Lists procurements (filtered by owner for org, all for admin) |
| `/api/v1/organization/procurements` | POST | `ORGANIZATION` | M1, M2, M3 | Creates procurement with status `DRAFT` or `PENDING_REVIEW` |
| `/api/v1/organization/procurements/:id`| PATCH | `ORGANIZATION`, `ADMIN` | M1, M2, M3 | Updates procurement |
| `/api/v1/verification-requests` | POST | `BUSINESS`, `ORGANIZATION` | M1, M2, M3 | Creates verification request |
| `/api/v1/admin/verification-requests` | GET | `ADMIN` | M1, M2, M3 | Filters verification requests by status/type |
| `/api/v1/admin/verification-requests/:id`| PATCH | `ADMIN` | M1, M2, M3 | Approves/rejects verification requests |
| `/api/v1/eligibility/evaluate` | POST | `BUSINESS` | **M2, M3** | Evaluates criteria against DB `BusinessProfile` or request payload |
| `/api/v1/profile` | GET | `BUSINESS` | **M2, M3** | Fetches business profile for `req.auth.id` |
| `/api/v1/profile` | PUT | `BUSINESS` | **M2, M3** | Upserts business profile for `req.auth.id` |
| `/api/v1/tenders` | GET | `BUSINESS`, `ORGANIZATION`, `ADMIN` | **M2 only** | Catalogs tenders with search, category filter, deadline range, pagination |
| `/api/v1/tenders/:id` | GET | `BUSINESS`, `ORGANIZATION`, `ADMIN` | **M2 only** | Retrieves tender by UUID or referenceNumber |
| `/api/v1/tenders/extract` | POST | Public | **M2, M3** | Extracts metadata, criteria, documents via Gemini or rule-based parser |

### 2.2 Authentication & Authorization

- **Backend:** `src/auth.js` enforces Supabase token validation via `jose` (`createRemoteJWKSet` from `SUPABASE_URL/auth/v1/.well-known/jwks.json` or fallback `SUPABASE_JWT_SECRET` HS256). User identity (`req.auth.id`, `req.auth.role`, `organizationId`) is extracted strictly from verified token claims.
- **Frontend Auth Adapter:** React frontend in `src/services/api.js` provides `setApiTokenProvider(fn)` to dynamically attach Bearer tokens to backend requests.
- **Member 1 Frontend:** Member 1 constructed a complete client-side authentication workflow with Supabase in `member1/assets/supabase.js` and `member1/assets/tenderbridge.js` (including email/password login, signup with role selection, password reset, and user metadata storage for profiles).

### 2.3 Database & Prisma Schemas

- **Prisma Provider:** PostgreSQL (configured for Supabase pooler/direct connection).
- **Member 1 Schema:** Has `Tender`, `Application`, `SavedOpportunity`, `PartnerListing`, `OrganizationProcurement`, `VerificationRequest`. (Missing `BusinessProfile`).
- **Member 2 & 3 Schemas:** Exact superset. Contains all models from Member 1 **plus** the required `BusinessProfile` model:
  ```prisma
  model BusinessProfile {
    id                String   @id @default(uuid()) @db.Uuid
    ownerAuthId       String   @unique
    businessName      String
    category          String
    location          String
    annualTurnover    Decimal  @db.Decimal(18, 2)
    yearsOfExperience Int
    certifications    String[] @default([])
    createdAt         DateTime @default(now())
    updatedAt         DateTime @updatedAt

    @@index([ownerAuthId])
  }
  ```
- **Prisma Migration:** Member 2 includes the baseline migration `20261009000000_init`. An additional migration or schema push is needed to add `BusinessProfile` to the database schema cleanly.

### 2.4 AI Service & Eligibility Analysis

- **No Flask AI Service:** The project architecture transitioned the Python AI service into pure, robust JavaScript services running inside Node.js.
- **Eligibility Engine (`src/services/eligibilityEngine.js`):** Pure functional engine checking turnover, experience, certifications, and location restrictions with status `PASS`, `FAIL`, or `UNKNOWN`.
- **Tender Extractor (`src/services/tenderExtractor.js`):** Calls Google Gemini REST API (`gemini-1.5-flash`) if `GEMINI_API_KEY` is present; seamlessly falls back to a deterministic regex/pattern parser for offline or credential-free operation.

### 2.5 Frontend Architecture & Member Discrepancies

- **Member 1:** Provided standalone HTML/CSS/JS applications in `member1/`. The React files in `frontend/src/` inside Member 1's archive were 0-byte skeleton files.
- **Member 2:** Fully completed `TenderListing.jsx`, `TenderDetails.jsx`, `AISummaryCard.jsx`, `EligibilityBreakdown.jsx`, `ProfileManagement.jsx`, and connected them in `routes.jsx`.
- **Member 3:** Completed `ApplicationTracker.jsx`, `SavedOpportunities.jsx`, `JVPartnerDirectory.jsx`, `OrgDashboard.jsx`, `CreateProcurement.jsx`, `ManageListings.jsx`, `VerificationRequests.jsx`, and `VerificationSubmission.jsx`. Member 3 accidentally removed `TenderListing` and `TenderDetails` from `routes.jsx` and `tenderService.js`.

---

## 3. Conflict & Divergence Matrix

| Item / File | Member 1 | Member 2 | Member 3 | Recommended Integration Resolution |
| :--- | :--- | :--- | :--- | :--- |
| `backend/src/app.js` | Base CRUD endpoints (no profile, no tenders, no extract) | Full endpoints + `/tenders`, `/profile`, `/eligibility/evaluate`, `/tenders/extract` | Full endpoints + `/profile`, `/eligibility/evaluate`, `/tenders/extract` (Missing `/tenders` list/get) | **Adopt Member 2 `app.js`** — provides the complete API set. |
| `backend/src/validation.js` | Base schemas | Base + `eligibilityEvaluateSchema`, `profileUpdateSchema`, `tenderExtractSchema`, `tenderListQuerySchema` | Missing `tenderListQuerySchema` | **Adopt Member 2 `validation.js`**. |
| `backend/prisma/schema.prisma` | Missing `BusinessProfile` | Complete with `BusinessProfile` | Identical to Member 2 | **Adopt Member 2 / 3 `schema.prisma`**. |
| `frontend/src/routes.jsx` | 0 bytes / empty | Includes `/business/tenders` & `/business/tenders/:id` | Omitted `/business/tenders` routes | **Adopt Member 2 `routes.jsx`** (augmented with Member 3 routes). |
| `frontend/src/services/tenderService.js` | 0 bytes | Has `list`, `getById`, `evaluateEligibility` | Only has `getById`, `evaluateEligibility` | **Adopt Member 2 `tenderService.js`**. |
| `frontend/src/components/common/Navbar.jsx`| Incomplete | Contains link items for all roles | Similar to Member 2 | **Enhance Navbar** to link to Discovery / Tender catalogue (`/business/tenders`). |
| Authentication in Frontend | Supabase SDK in `member1/assets/` | Token provider adapter in React `src/services/api.js` | Identical to Member 2 | **Bridge Member 1 Auth** into React `AuthContext` to feed Supabase session tokens into `setApiTokenProvider()`. |
| Member 1 Standalone Pages (`member1/`) | Full HTML/JS suite | Absent | Absent | **Preserve `member1/` static assets** as an accessible sub-path or reference while wiring React auth. |

---

## 4. Discovered Bugs & Test Flaws in Member 2

In Member 2's backend test suite (`backend/test/tenderApi.test.js`), 2 test assertions failed:
1. **Assertion failure in 503 check (line 333):** The test expected regex `/[Uu]navailable/`, but `app.js` returns `"Tender storage is not available in the database."`
2. **Assertion failure in UUID lookup (line 344):** The test used dummy ID `00000000-0000-0000-0000-000000000001`, but `sampleTenders` defines ID `a1b2c3d4-e5f6-4a7b-8c9d-000000000001`, causing a 404 response.

*Fixing these two minor test harness discrepancies will bring Member 2's backend test suite to 100% PASS.*

---

## 5. Security & Credentials Audit

- **Exposed Credentials Found in Submission ZIPs:**
  - `TenderBridge_Member2/backend/.env` contained a plaintext database password string: `database password: TenderBridge@#2026`.
  - `TenderBridge_Member3/backend/.env` contained a database connection URL with credentials.
  - `TenderBridge_Member1` contained real Supabase project URLs and anon keys.
- **Rule Enforcement:** Under Non-Negotiable Rule 8, **no real passwords or database connection secrets will be copied into `TenderBridge_Integrated`**. Safe `.env.example` templates will be created for the integrated copy.

---

## 6. Proposed Integration Order (Phase 2 & Beyond)

1. **Establish Baseline Structure in `TenderBridge_Integrated`:**
   - Setup clean `backend/` and `frontend/` folders.
   - Setup `.env.example` templates for both frontend and backend.
2. **Backend Integration:**
   - Adopt Member 2's Express foundation (`src/app.js`, `src/auth.js`, `src/db.js`, `src/errors.js`, `src/server.js`, `src/validation.js`).
   - Copy Member 2's `eligibilityEngine.js` and `tenderExtractor.js`.
   - Copy the unified Prisma schema and migrations.
   - Integrate all automated test suites (`test/api.test.js`, `test/eligibilityApi.test.js`, `test/eligibilityEngine.test.js`, `test/profileApi.test.js`, `test/tenderApi.test.js`, `test/tenderExtractor.test.js`) and patch the two test harness bugs.
3. **Frontend Integration:**
   - Establish React Vite project using Member 2's foundation.
   - Include Member 2's `TenderListing.jsx` and `TenderDetails.jsx` alongside Member 3's `ApplicationTracker.jsx`, `SavedOpportunities.jsx`, `JVPartnerDirectory.jsx`, `ProfileManagement.jsx`, `OrgDashboard.jsx`, `CreateProcurement.jsx`, `ManageListings.jsx`, `VerificationRequests.jsx`, and `VerificationSubmission.jsx`.
   - Update `Navbar.jsx` to ensure navigation to "Tender Catalogue / Discovery" (`/business/tenders`) is visible and accessible.
   - Create a clean Supabase `AuthContext.jsx` in React leveraging Member 1's Supabase authentication configuration, passing the active JWT token to `setApiTokenProvider` in `services/api.js`.
4. **Verification & Testing (Phase 5):**
   - Run Node backend tests (`npm test`).
   - Run Frontend Vite build (`npm run build`).

---

## 7. Unresolved Questions & Clarifications for User

1. **Member 1's Standalone HTML Prototype vs. Unified React App:** Member 1 wrote the authentication and profile discovery as standalone multi-page HTML files (`member1/*.html`). Member 2 and 3 implemented the single-page React app (`frontend/`). We recommend integrating Supabase authentication directly into the React SPA so the user experiences one seamless full-stack application, while keeping Member 1's standalone files available in `public/member1/` or `docs/member1/` as a preserved reference. Does this match your expectations?
2. **AI Service:** Confirming that the native JavaScript implementation (Gemini 1.5 Flash REST API + deterministic fallback parser) is preferred over spinning up an empty Python Flask service.
