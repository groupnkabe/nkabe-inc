# Nkabe Admin Workspace — Setup

The admin workspace is a private staff interface served at `/admin.html`. It uses the existing Supabase project and the authorised Nkabe corporate brand system.

## What is included

- Email/password sign-in through Supabase Auth; no sign-up form is provided.
- Access is restricted by `public.admin_users`. An authenticated account without an active row in that table cannot enter the workspace or read submissions.
- Overview counts, recent submissions, contact and pilot inboxes, search, and status filters.
- Contact and pilot detail views, including grouped computer inventory.
- Append-only conversation history with inbound submissions, private internal notes, and outbound reply drafts.
- Reply drafts are saved as `not_configured`; they are **not emailed** in this phase.

## Deployment order

1. Merge the admin workspace branch into `main` after review. GitHub Pages will publish `admin.html`, `admin.css`, and `admin.js`.
2. In the Supabase SQL Editor for the Nkabe project, run the migration:
   `supabase/migrations/20261119000200_create_admin_workspace.sql`
3. In Supabase Dashboard → Authentication → Users, create the first staff user. Do not enable public self-registration for this internal workspace. Use a strong unique password and MFA where available.
4. Copy the new Auth user's UUID. In the SQL Editor, grant that account access:

   ```sql
   insert into public.admin_users (user_id, display_name, role, is_active)
   values ('AUTH-USER-UUID', 'Nkabe Admin', 'owner', true);
   ```

   Replace the UUID and display name with the intended staff member. Repeat for each authorised staff member, assigning `admin` or `staff` as appropriate.
5. Visit `https://nkabe.us/admin.html` and sign in with the created Auth account.

## Security notes

- Never put a Supabase service-role or secret key in `site-config.js` or any browser asset.
- No anonymous policies or grants are created for submission or conversation data.
- RLS policies require an active `admin_users` row matching `auth.uid()`.
- Staff access is revoked by setting `is_active = false` in `public.admin_users`; the user must also be signed out/revoked for immediate session invalidation.
- Do not store passwords in this repository or in shared documents.

## Current limitation

The conversation composer records a reply draft in the database and shows it in the thread. It does not send email. The next phase will add a server-side email provider and update draft delivery states only after the provider confirms the send.
