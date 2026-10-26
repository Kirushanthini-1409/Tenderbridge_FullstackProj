# TenderBridge

TenderBridge is a procurement discovery and workflow demo for MSMEs. The React/Vite frontend talks to an Express API, with PostgreSQL managed through Prisma and Supabase Auth.

## Local demo

1. Configure `backend/.env` with the PostgreSQL `DATABASE_URL`, `SUPABASE_URL`, and the JWT verification settings for your Supabase project. Keep the API on port 4000 and allow the frontend origin with `CORS_ORIGINS=http://127.0.0.1:5175`. Configure `frontend/.env.local` from `.env.example` with the matching Supabase URL and anon key, and set `VITE_API_BASE_URL=http://127.0.0.1:5175` so requests pass through Vite's proxy to the API on port 4000.
2. Apply the checked-in database migrations before starting the API. From `backend` run:

   ```powershell
   npm run db:deploy
   npm run db:generate
   ```

   This applies additive schema changes for account roles, procurement PDF storage, organization profiles, application clarifications, tender questions and versions, submitted tender baselines, and results/audit history. Do not use `db:migrate` or reset commands against a shared database.
3. In a backend PowerShell terminal, start the API on port 4000:

   ```powershell
   npm run dev
   ```

4. In a frontend terminal, start Vite on port 5175:

   ```powershell
   npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
   ```

5. Visit `http://127.0.0.1:5175`. The Vite development proxy forwards `/api` requests to port 4000.
6. Register or sign in as a Business or Organization user. Organization registration grants the Organization workspace immediately; complete `/org/profile` before publishing tenders. Business profiles and business verification are separate. Admin access must be assigned through trusted Supabase `app_metadata.role=ADMIN`; public registration cannot grant it. Admin pages are guarded by the resolved ADMIN role.
7. In `backend`, run `npm run db:seed` to add fictional sample tenders and sample JV business profiles. Tender titles are professional; references and issuing authorities identify sample data. Sample records do not represent real procurement notices, bids, companies, or contacts.
8. On an empty account, Application Tracker and Saved Opportunities show clearly labeled sample records. Updating a sample application creates a real database record for the signed-in user. Saving, tracking, and removing real records uses the database.

## Included workflows

- Business profile and eligibility checks
- Tender discovery and detail views
- Saved opportunities and application tracking
- JV/consortium partner listings
- Organization profile, procurement drafting, tender PDF storage/text extraction, listing management, and applicant review without an admin approval gate
- Organization applicant search/status filtering, private internal review notes, secure submitted-document review, and in-app clarification requests with applicant replies and closure history
- Tender questions and answers with organization review, persisted tender versions and comparisons, and saved-opportunity deadline/update indicators
- Organization result release after every submitted application has a final decision; applicants see their outcome and public result summary only after publication
- Guarded administration dashboard, verification queue, catalogue tools, and persisted audit history for verification decisions, application reviews, and result releases
- Structured tender quantity, opening date, delivery period, and location fields with source-quoted extraction evidence and confidence indicators
- Business verification submission
- Tender text/PDF extraction saved to each selected tender record

Organization procurement PDF upload accepts files up to 8 MB and persists them in PostgreSQL. Text extraction covers common text-based PDF streams; scanned/image-only or unusually encoded PDFs use the optional local OCR fallback described below, or return an explicit message and need manual review. Tender detail extraction accepts pasted text or an uploaded PDF, and saves only information supported by the supplied document. The separate Python/LangChain service and live official tender ingestion are not part of this demo.

Application clarifications are stored in PostgreSQL in `ApplicationClarification` and `ApplicationClarificationMessage`, linked to the application. Applicants can read and respond to requests on their own applications; only the organization that owns the related procurement (or an authorized administrator) can review or close them. Organization-only review notes remain private and are excluded from business application responses. The Phase 4 schema change is additive; apply it with `npm run db:deploy` from `backend`, then regenerate the Prisma client with `npm run db:generate` after closing any running backend process that may be locking its Windows query-engine file.

Public tender questions, published answers, and moderation state are stored in PostgreSQL in `TenderFaq`. Tender snapshots and changed-field lists are stored in `TenderVersion`; each saved opportunity tracks the latest version the business has viewed in `SavedOpportunity.seenVersion`. Submitted applications store their tender baseline in `Application.tenderVersionNumber`, so the business tracker can flag later tender changes. The saved list derives due-soon, past-deadline, and closed indicators from each tender deadline and status. These are in-app indicators; no email or push service is configured. Phase 5 migrations: `20261026100000_tender_updates_and_faqs` and `20261026120000_application_tender_version`.

Published result summaries are stored in `TenderResult`; application outcomes are not shown to businesses until publication. The API refuses release while any submitted application remains in review. Administrative and workflow events are stored in `AdminAuditEvent`, readable only by Admin users. Phase 6 migration: `20261027100000_results_and_admin_audit`.

Quantity, opening date, delivery period, and location are stored as structured fields on `Tender` and `OrganizationProcurement`. Extraction runs are stored in `TenderExtraction` with source type/name, extractor, extracted values, evidence quotations, per-field and overall confidence, missing-information notes, and review state. The organization workspace shows the latest extraction evidence; editing the draft marks the extracted fields as manually confirmed. Public tender API responses omit private extraction evidence. Phase 7 migration: `20261028100000_structured_fields_and_extraction_provenance`.

Scanned PDFs can use an optional local OCR fallback. Install Poppler (`pdftoppm`) and Tesseract with English language data, then set `PDFTOPPM_PATH` and `TESSERACT_PATH` for the backend (or add both executables to `PATH`); `TESSERACT_LANG` can select another installed language. OCR is attempted only when the PDF text layer is empty or very sparse, processes at most 25 pages at 180 DPI, and has a time limit. OCR page citations are stored with extraction evidence. Temporary page images are deleted after processing. PDF text and OCR output are passed only to the local deterministic extractor; the Gemini path is skipped for PDF uploads. If OCR tools are not configured or cannot read the file, the application records that outcome and asks the organization to enter confirmed requirements manually. The page-evidence column is added by Phase 8 migration `20261029100000_extraction_page_evidence`.

## Role workflow smoke test

- **Business:** Register and confirm email, sign in, complete `/business/profile`, browse `/business/tenders`, inspect eligibility, save a tender, track an application, and opt into the JV directory to browse/save partners.
- **Organization:** Register and confirm email, sign in, complete `/org/profile`, then create a procurement draft, upload a PDF if available, review/edit its extracted requirements, and publish from `/org/procurements`. Review applicants there. Organization profile details enable publishing without an administrator approval step.
- **Admin:** Sign in with an account that has the trusted Supabase `app_metadata.role=ADMIN` role. Open `/admin` to review platform counts, verification requests, the tender catalogue, and audit history. Public registration cannot grant the Admin role.

Tender details accept pasted notice text or a PDF. The backend extracts available fields, persists the summary, criteria, required documents, and evidence page citations to the selected tender, and reloads them consistently. If local OCR tools are unavailable or recognition fails, it returns an explicit message and does not treat the PDF as readable content.

## Proposed solution practical review

- Current implementation gaps and a recommended phase sequence: [PROPOSED_SCOPE_GAP_ANALYSIS.md](./PROPOSED_SCOPE_GAP_ANALYSIS.md).
- Standalone interactive Antigravity design reference: `frontend/public/antigravity-reference/index.html`. With the frontend dev server running, open `/antigravity-reference/`. All records in this reference are fictional and interactions are frontend-only; it is not connected to Supabase, the API, or PostgreSQL. Design notes and an implementation prompt are in `frontend/public/antigravity-reference/ANTIGRAVITY_BRIEF.md`.

Run `npm test` from `backend` and `npm run build` from `frontend` to verify the implementation. Live role journeys require configured Supabase credentials and accounts.
