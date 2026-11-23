# Nkabe Central Communications

## Current architecture

- Resend remains the outbound email transport for branded company mail.
- Active Owner, Admin and Staff accounts can use the dashboard composer.
- A staff member with a provisioned `@nkabe.us` address sends from that address; otherwise the configured central sender is used.
- Internal direct messages and company/project channels are stored in Supabase and accessed only through the authenticated `admin-communications` Edge Function.
- No DNS or MX records are changed by this feature.

## Resend inbound mail and Inboxes

Resend Inboxes supports threaded inboxes, assignments, drafts, folders, labels, collaboration notes and agent workflows. It requires an inbound address/domain configuration. The existing `nkabe.us` Zoho MX records must remain untouched during this first phase.

Before enabling inbound mail in the dashboard, choose an inbound routing approach:
1. Keep Zoho as the primary mail host and configure per-mailbox forwarding to a Resend-managed inbound address on a separate subdomain or Resend-provided address; or
2. Move only a dedicated mail subdomain to Resend and create new addresses there.

Do not point the root `nkabe.us` MX records at Resend unless the company explicitly decides to migrate away from Zoho.

## Internal communications

- `#general` is seeded automatically.
- Owner/Admin can create project channels.
- All active team members can read and post to company channels.
- Direct messages are visible only to their sender and recipient.
- The Edge Function validates active membership and recipient status before reading or writing.

## Deployment

1. Apply `supabase/migrations/20261123120000_create_team_communications.sql`.
2. Deploy the `admin-communications` Edge Function with JWT verification enabled.
3. Merge the feature branch to `feature/admin-workspace` to trigger the configured Cloudflare Pages deployment.
4. Verify with two active staff accounts: create a project channel, post a channel message, exchange direct messages, and send a branded email.
5. Configure Resend inbound forwarding only after confirming the chosen routing plan. Set the Resend webhook secret as a Supabase Edge Function secret before registering the webhook.

## Limitations in this phase

- Dashboard communications provide direct messages and project channels; this is an internal collaboration layer, not a full replacement for Zoho Mail.
- Incoming external email is not yet mirrored into the dashboard. That requires an explicit Resend inbound route and webhook configuration.
- Attachments, private project channels, and collaborative email drafts are follow-on work.
