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

## Shared company inbox — basic inbound receiving

The first external mailbox is `hello@nkabe.us`. Zoho remains the mailbox host and retains the original message. The Nkabe dashboard is a shared reading and reply surface.

- Use Resend's standard inbound receiving address ending in `.resend.app`; do not create a Resend Inbox.
- Register a signed webhook for `email.received`. The webhook retrieves the message through Resend's Receiving API and stores the content and metadata in Nkabe-owned Supabase tables.
- No Anthropic Inbox classification is involved in this basic receiving flow.
- No `nkabe.us` root MX records are changed. Zoho forwards a copy of `hello@nkabe.us` to the Resend-provided address.
- Replies are sent through Resend from `Nkabe Inc <hello@nkabe.us>` and include `In-Reply-To` and `References` headers when available.
- Webhook signing secrets and all email content remain server-side; browser users access messages only through the authenticated communications Edge Function.

### Setup

1. In Resend, open Emails → Receiving and copy the generated receiving address ending in `.resend.app`.
2. In the Nkabe admin dashboard, open Company inbox and configure that receiving address. The dashboard registers the `email.received` webhook and stores its signing secret server-side.
3. In Zoho Mail Admin Console, open Users → `hello@nkabe.us` → Mailbox Settings → Email Forwarding.
4. Add the exact Resend receiving address shown in the dashboard and complete Zoho's verification.
5. Keep Zoho's option to retain the original message enabled.
6. Send a test message from an external account. Confirm it appears in both Zoho and the Nkabe dashboard, then reply from the dashboard and confirm the external sender receives it.

Do not change the root `nkabe.us` MX records. Resend receiving must be configured with the Resend-provided address, not `hello@nkabe.us`.

### Threading and security

- Inbound webhook signatures are verified against the raw request body.
- Provider email IDs are unique to make webhook retries idempotent.
- Conversations are matched using `Message-ID`, `In-Reply-To` and `References` headers. If a provider strips these headers, the email safely starts a new conversation rather than being guessed into an unrelated thread.
- Email bodies are untrusted content. They are displayed as escaped text in the dashboard and must never trigger agent actions or privileged operations automatically.
- Attachments are not downloaded or exposed in this first phase.
