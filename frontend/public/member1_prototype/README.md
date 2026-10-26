# TenderBridge: Member 1 pages (Identity, Profiles & Discovery)

Open `index.html` in a browser (or serve the folder with any static server). Shared code: `assets/tenderbridge.css` and `assets/tenderbridge.js`.

| Page | File | Start route |
|---|---|---|
| Landing | `index.html` | `#/` |
| Role selection | `role-selection.html` | `#/role` |
| Login | `login.html` | `#/login` |
| Sign up | `signup.html` | `#/signup` |
| Forgot password | `forgot-password.html` | `#/forgot` |
| Business onboarding | `business-onboarding.html` | `#/b/onb/1` |
| Organization onboarding | `organization-onboarding.html` | `#/o/onb/1` |
| Business overview | `business-dashboard.html` | `#/b/overview` |
| Business profile | `business-profile.html` | `#/b/profile` |
| Business documents | `business-documents.html` | `#/b/documents` |
| Business certifications | `business-certifications.html` | `#/b/certs` |
| Business notifications | `business-notifications.html` | `#/b/notifications` |
| Business account | `business-account.html` | `#/b/account` |
| Organization overview | `organization-dashboard.html` | `#/o/overview` |
| Organization profile | `organization-profile.html` | `#/o/profile` |
| Organization verification | `organization-verification.html` | `#/o/verification` |
| Organization documents | `organization-documents.html` | `#/o/documents` |
| Organization notifications | `organization-notifications.html` | `#/o/notifications` |
| Organization account | `organization-account.html` | `#/o/account` |
| Discover Opportunities | `discover.html` | standalone, also embedded in the app nav |

Notes
- Inside any page file, navigation uses hash routes (`#/b/profile`, etc.), so every page works from any file. The files let you link or replace pages one at a time.
- Service layer: `auth` in `assets/tenderbridge.js` and `opportunityService` in `discover.html`. Replace the mock bodies with Supabase calls (reuse one client).
- Document upload has a marked hook for `supabase.storage`. Save in Discover is a hook for Member 3; View Opportunity links to `/opportunities/:id` (Member 2).
- To keep your own login/signup, change the `#/login` and `#/signup` hrefs in `assets/tenderbridge.js`.
