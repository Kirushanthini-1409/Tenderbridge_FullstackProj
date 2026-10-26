# TenderBridge Antigravity Reference — Phase 1

Open `index.html` or run the existing Vite frontend and visit `/antigravity-reference/`.

## Purpose

This is a self-contained, clickable visual reference for the proposed practical-review product. It is plain HTML, CSS, and JavaScript under the Vite `public` directory. It does not replace or alter the current React application, and it does not connect to the Express API, Supabase, or PostgreSQL. All names, numbers, tenders, applications, and organization details shown are fictional. Interactions are local preview behaviors only.

## Reference screens

- Business workspace: overview, tender discovery, tender detail, application wizard/review, application tracker, saved tenders, document vault, JV partner directory, business profile placeholder, and results.
- Organization workspace: overview, tender list, tender creation/extraction/review, applicant management, FAQs/clarifications, tender version comparison, organization profile, and results.
- Admin workspace: overview, verification queue, moderation, categories, account management, and activity log reference views.

Switch workspaces with the selector in the sidebar. Buttons and menus demonstrate the intended flow, but they do not persist data.

## Suggested Antigravity instruction

Use this directory as the visual and interaction reference. Implement the approved screens in the existing React application, preserving its current API contracts, role checks, Prisma/PostgreSQL data model, and Supabase authentication. Do not copy the reference's sample data into production or present mock interactions as completed backend features. For each proposed feature, first identify the required API/schema work, enforce ownership and role permissions on the server, validate inputs, and then connect the React screen. Preserve existing working workflows. Clearly label any feature that remains a prototype.

## Phase sequence for completing the proposed solution

1. **Core workflow and data integrity:** direct application submission, application snapshots/reference numbers, duplicate prevention, status history, owner-scoped applicant review, withdrawal/edit rules.
2. **Business document vault:** secure per-business uploads, metadata, expiry, replacement, selection per application, and access checks.
3. **Tender collaboration:** FAQs and clarification questions/answers with moderation, tender change/version history, saved/applied update indicators, and eligibility reassessment.
4. **Organization lifecycle:** complete tender fields/statuses, extraction provenance/manual correction, applicant filtering/notes/clarifications, selection, and published results.
5. **Administration and hardening:** re-enable role-protected admin UI, verification SLA/status records, moderation/category/account tools, audit events, retention policy, and end-to-end acceptance coverage.

These phases are a proposed implementation order, not a claim that the features are already implemented.
