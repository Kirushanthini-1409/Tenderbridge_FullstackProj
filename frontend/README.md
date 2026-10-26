# TenderBridge frontend

React frontend for the TenderBridge procurement workspace. It includes public landing and account pages, business tender discovery/profile/eligibility/application tools, organization procurement publishing, and an admin tender and verification console.

## Run locally

1. Copy `.env.example` to `.env.local`. Set `VITE_API_BASE_URL` and the Supabase project URL plus anon key from your own project.
2. Run `npm install`.
3. Run `npm run dev`.

Authentication is implemented with Supabase Auth. The frontend attaches the current access token to API requests. The backend requires a trusted `app_metadata.role` claim (`BUSINESS`, `ORGANIZATION`, or `ADMIN`); a role selected on sign-up is only a request and must be granted server-side before organization/admin API actions work. Do not accept workspace roles from user-editable metadata.

The API origin must also appear in the backend's `CORS_ORIGINS` setting. For local development, use `http://localhost:5173`. A configured database, Supabase project, and tender records are required for end-to-end demos.
