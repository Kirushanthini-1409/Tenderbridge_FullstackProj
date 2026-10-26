# TenderBridge proposed solution — current implementation gap analysis

This compares the supplied “Complete Proposed Solution” with the integrated repository. “Implemented” means a corresponding working code path or data model exists in the current project; it does not imply a live external service or production deployment. The separate interactive visual reference is in `frontend/public/antigravity-reference/`.

## Existing foundations

- React/Vite front end with business and organization route guards, Supabase Auth, and a token-aware API client.
- Express API with verified bearer tokens, role checks, Zod request validation, centralized error handling, and Prisma/PostgreSQL persistence.
- Business profiles; tender catalogue search/filter/pagination; tender detail; rule-based eligibility results for turnover, experience, certifications, and cautious location matching.
- Tender text/PDF extraction utilities. Organization procurement PDFs up to 8 MB can be stored in PostgreSQL and text extracted where supported. The extractor has deterministic behavior and optional Gemini integration; the separate Python/LangChain service described in an earlier plan is not part of the integrated implementation.
- Business application tracking records, saved tender records, profile-sharing JV directory and saved partners.
- Organization procurement draft/publish/manage flows, applicant list/review API routes, verification submission, and admin verification API routes.
- Backend test files for API access, profiles, tenders, eligibility, extraction, and PDF text extraction.

## Proposed features that are missing or only partial

| Proposed capability | Current state in integrated project | Work needed for completion |
|---|---|---|
| Account registration, roles, verification badges | Supabase sign-in and role-aware routes exist. Verification requests exist. Admin UI is redirected to unauthorized. | Restore/administer the review UI and persist/display badge state consistently. Clarify organization self-registration approval policy. |
| Business/organization profile management | Business profile and organization profile workflows exist. | Extend business profile with products/services, previous projects, complete contacts, and verified status where required. |
| Reusable business document vault | Implemented with PostgreSQL file bytes, owner-scoped upload/list/download/update/delete APIs, and application-wizard reuse. | Consider expiry metadata and retention policy in a later hardening phase. |
| PDF tender publishing and manual completion | Implemented with structured quantity, opening date, delivery duration, location, source evidence/confidence, and a reviewed/manual-confirmation state. PDFs remain stored with the organization procurement record. Sparse or image-only PDFs now use an optional local Poppler + Tesseract OCR fallback, with page-level evidence citations. | OCR requires locally installed Poppler and Tesseract; without them the system records the unavailable state and asks the organization to enter confirmed requirements manually. |
| Tender discovery | Search, category, deadline range, pagination, detail, and eligibility exist. | Add location/value/status/eligibility filters and organization profile information to the API/UI where needed. |
| AI-assisted tender analysis | Deterministic and optional Gemini extraction now returns quote-verifiable per-field evidence and confidence. Extraction runs persist source, values, confidence, missing information, review state, OCR result, and field-to-page evidence. | Do not treat extraction or OCR as a substitute for reviewing official notice text. |
| Direct application submission | Implemented with the application wizard, required-document validation, submission confirmation, reference numbers, snapshots, and revision archive. | Continue end-to-end usability review with real business and organization accounts. |
| Application editing, withdrawal, and revision history | Implemented with submitted-state protections, withdrawal handling, revision snapshots, and status history. | Consider further audit and retention policy after review. |
| Organization applicant management | Implemented with search/status filters, secure submitted-document download, organization-only notes, review transitions, and private clarification threads. | No Phase 5 work required here. |
| Tender FAQs and questions | Implemented with pending business questions, organization answer/reject moderation, published FAQs, and role-scoped visibility. | Add an anti-spam policy if the project moves beyond a classroom demo. |
| Tender change/version comparison | Implemented with immutable public tender snapshots and changed-field comparison after organization edits and authorized extraction. | Record versions for any future tender-write paths added to the API. |
| Saved tender reminders and change indicators | Implemented with per-user seen-version markers and in-app deadline/update indicators. | Email or push reminders require an external delivery service and are not configured. |
| Results and awards | Implemented with owner-scoped result publishing after every submitted application has a final decision. Applicants see their outcome and public result summary after release. | Add optional award-document uploads and richer award reporting if needed. |
| JV/consortium discovery | Opt-in directory and saved partners exist. | Add richer profile/project details and tender participation terms. Automatic matching is explicitly out of scope. |
| Admin platform management | Guarded admin dashboard, verification queue, tender catalogue tools, and audit history are enabled for the trusted ADMIN role. Verification decisions, application reviews, and result releases are recorded. | Add moderation, categories, and account-management controls if needed. |
| Security and retention | Token verification, role checks, owner scoping, file validation, and procurement PDF access checks exist. | Add business document access controls, submitted-file integrity, audit records, deactivation/retention behavior, and production storage policies. |

## Recommended implementation order

1. Phases 1–8 are implemented in the integrated project; validate live role journeys with configured accounts and install local OCR tools if scanned-PDF recognition is needed.
2. Next recommended work: deployment preparation, accessibility/usability review, and retention/security policy decisions. OCR requires human review and remains optional.

The visual reference was created as a separate static artifact so design work can proceed without changing current working workflows. It should be used as UI guidance, not as evidence that the depicted features already persist or work in the backend.
