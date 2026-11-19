# Nkabe Inc. admin workspace

## Live entry point

- Corporate website: https://nkabe.us
- Private operations workspace: https://nkabe.us/admin/
- The admin application is published from the repository's `admin/` directory by the GitHub Pages workflow.
- The workspace is not linked from the public website navigation. The initial page is login-only; workspace navigation is revealed only after Supabase Auth and the `admin_users` allowlist both authorise the account.

## Authentication and access model

Supabase Auth provides sign-in. The `public.admin_users` table is the authoritative staff allowlist and role source. Public self-registration is not part of the workflow.

Supported roles:

| Role | Permissions |
| --- | --- |
| owner | Full workspace access and exclusive team management |
| admin | View records, update statuses, add private notes, save unsent email drafts |
| staff | View records, update statuses and add private notes |

All active roles can view contact enquiries, pilot applications, computer inventory and conversation history. Database RLS checks the active allowlist row on each request. Status changes are restricted to the `status` column. Conversation inserts are column-scoped and constrained by message type, channel and delivery status. Staff cannot create outbound email drafts.

The owner account cannot be demoted or deactivated through the Team Access screen. Team management is restricted to the active owner role.

## Team management

The owner opens **Team access** in the authenticated sidebar.

1. Enter the new member's name and email address.
2. Select **Staff** or **Admin**.
3. Send the invitation.
4. The recipient follows the Supabase Auth invitation email and sets a password at the admin workspace.
5. The owner can change the member's role or deactivate/reactivate workspace access.

The invitation flow redirects to `https://nkabe.us/admin/`. Ensure that this URL is present in Supabase Auth's allowed redirect URLs and that Auth email delivery is configured.

Deactivation changes `admin_users.is_active` to false. RLS checks this value for database access, so an existing session cannot continue reading or modifying workspace records after its next request. Deactivation does not delete the Auth identity.

## Edge Function

`supabase/functions/manage-admin-team/index.ts` is deployed as the `manage-admin-team` Supabase Edge Function with JWT verification enabled.

It verifies the caller's user JWT, looks up the caller's active owner record, and only then uses the server-side Supabase secret key to:
- List authorised team profiles and their Auth account metadata.
- Invite a new admin or staff member.
- Update a non-owner member's role or active state.

The secret key is read only inside the Edge Function. Never place a Supabase secret/service-role key in browser files or GitHub Pages assets.

## Database migrations

The live Supabase migration history currently includes:

- `20261119143018_create_admin_workspace.sql`
- `20261119152234_implement_role_based_access_control.sql`
- `20261119153530_harden_admin_permissions.sql`

The website submissions schema is also represented by `20261119000100_create_website_submissions.sql`.

## Current boundaries

- Email replies are still saved as unsent drafts; no outbound email integration has been enabled.
- Staff and admin invitations are sent through Supabase Auth email delivery.
- The Team Access page does not delete Auth users. Deactivation is the reversible access-control operation.
- Keep leaked-password protection enabled in Supabase Auth when available, and use strong unique passwords for all staff accounts.
