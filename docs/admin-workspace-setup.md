# Nkabe Admin Workspace — Private Deployment

The admin portal is a separate static application. It is **not** part of the public GitHub Pages website and must not be published from the repository root.

## Architecture

- Public corporate website: GitHub Pages at `https://nkabe.us`.
- Private staff portal: Cloudflare Pages project built from the `admin-portal/` directory.
- Staff hostname: `https://desk.nkabe.us`.
- Edge access gate: Cloudflare Access, restricted to explicitly approved staff email addresses.
- Application sign-in and data authorization: Supabase Auth plus the `admin_users` allowlist and RLS.
- Reply composer: saves an unsent draft in conversation history. No email is sent in this phase.

The hostname is not the security boundary. Cloudflare Access and Supabase authorization are.

## 1. Create the Cloudflare Pages project

1. Sign in to the Cloudflare account that manages the `nkabe.us` zone.
2. Open **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Connect the GitHub account/organisation and select `groupnkabe/nkabe-inc`.
4. Configure the project:
   - Project name: `nkabe-admin` (or another internal project label).
   - Production branch: `feature/admin-workspace` for initial review, then change it to the approved production branch after the PR is merged.
   - Root directory: `admin-portal`.
   - Build command: leave blank (no build step is required).
   - Build output directory: `.`.
5. Save and allow the first deployment to finish. The application should load on its temporary `*.pages.dev` hostname, but do not share that hostname or use the portal until Access is enabled.
6. In **Settings → Builds → Branch control**, disable preview deployments unless you have a deliberate need for them. If previews are enabled later, protect preview hostnames with Access too.

Cloudflare Pages supports GitHub integration and automatically deploys commits from the configured production branch.

## 2. Protect the Pages hostname before adding the custom hostname

1. In the Pages project, open **Settings** and enable its Access policy for the `pages.dev` hostname.
2. Open **Zero Trust → Access → Applications** and inspect the application created for the Pages hostname.
3. Configure an **Allow** policy with only the intended staff email addresses (or a tightly controlled staff identity group). Do not use a broad “Everyone” rule.
4. Confirm that an unauthenticated/private browser cannot reach the portal on the `pages.dev` hostname.

This prevents the generated Pages hostname from becoming an alternate route around the custom-domain Access gate.

## 3. Attach the staff hostname

1. In the Pages project, open **Custom domains** → **Set up a domain**.
2. Enter `desk.nkabe.us` and complete the setup.
3. Because the `nkabe.us` zone is already managed by Cloudflare, follow the Pages dashboard flow; it will configure the required DNS record.
4. After the custom domain is active, open **Zero Trust → Access → Applications** → **Add an application** → **Self-hosted**.
5. Add the public hostname `desk.nkabe.us`.
6. Create an **Allow** policy limited to the approved staff email addresses. Set a suitable session duration and require a strong identity provider/MFA where available.
7. Test the custom hostname in a private/incognito browser. It must show the Cloudflare Access login before the portal loads.
8. Also test the generated `*.pages.dev` hostname. Both hostnames must be protected. Cloudflare documents that custom domains need their own Access application even when the Pages hostname is protected.

Do not create a public DNS-only route to another copy of the portal.

## 4. Apply the Supabase migration

After reviewing the migration, run:

`supabase/migrations/20261119000200_create_admin_workspace.sql`

in the Supabase SQL Editor for the existing Nkabe project. It creates the staff allowlist and conversation history tables and adds authenticated staff-only policies. It does not create public policies.

## 5. Create the first staff identity

1. In Supabase Dashboard → Authentication → Users, create the first staff account. Do not enable public self-registration for this workspace.
2. Copy the Auth user's UUID.
3. In the Supabase SQL Editor, insert that identity into the allowlist:

```sql
insert into public.admin_users (user_id, display_name, role, is_active)
values ('AUTH-USER-UUID', 'Nkabe Admin', 'owner', true);
```

Replace the UUID and display name with the intended staff identity. Repeat for each authorised staff member with the appropriate role.

Cloudflare Access and Supabase are two separate gates: an identity must pass both.

## 6. Verify before operational use

- The public website at `nkabe.us` remains on GitHub Pages and has no admin link.
- `desk.nkabe.us` redirects unauthenticated visitors to Cloudflare Access.
- The `pages.dev` hostname is also Access-protected.
- A person allowed by Cloudflare but absent from `admin_users` is rejected by the app.
- An authorised staff member can see the test contact and pilot applications, their inventory, status controls, and conversation history.
- Private notes and reply drafts persist. Reply drafts clearly remain unsent.
- A logged-out/unauthorised browser cannot read any submission or conversation data through Supabase.

## Security notes

- The browser configuration contains only the public Supabase publishable key. Never place a Supabase service-role or secret key in this directory or any browser asset.
- Keep the repository's existing public submission Edge Function separate from this portal.
- Do not add the portal to the public website navigation, sitemap, or public-page links.
- Disabling a staff member requires setting `admin_users.is_active = false` and revoking their Supabase session/access as appropriate.
- Cloudflare Access is an additional network gate, not a replacement for Supabase Auth or RLS.

## Current limitation

The composer saves outbound replies as drafts with `delivery_status = 'not_configured'`. It does not send email. Email-provider integration will be a separate phase, as planned.
