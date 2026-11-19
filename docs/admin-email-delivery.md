# Nkabe admin email delivery

The admin workspace saves outbound replies as drafts. Sending is performed only by the authenticated `send-admin-email` Supabase Edge Function; the browser never receives the Resend API key.

## Provider

Transactional replies use [Resend](https://resend.com/). This is separate from Supabase Auth email delivery (password recovery and future staff invitations), which requires its own SMTP configuration.

## Required setup

1. Create a Resend account.
2. Add and verify the `nkabe.us` sending domain in Resend.
3. Publish the DNS records Resend provides at the domain's DNS host. Do not guess or substitute these records.
4. Create a Resend API key with permission to send mail.
5. In Supabase Dashboard → Edge Functions → Secrets, add:
   - `RESEND_API_KEY`: the Resend API key.
   - `NKABE_EMAIL_FROM`: a verified sender, for example `Nkabe Inc <no-reply@nkabe.us>`.
   - `NKABE_EMAIL_REPLY_TO` (optional): a monitored inbox that should receive replies.
6. Refresh the admin workspace. The Send email action becomes available only when the server confirms that the required sender settings exist.

Never put the Resend key in `site-config.js`, browser JavaScript, GitHub, or a message to ChatGPT.

## Delivery safeguards

- Only active `owner` and `admin` users can send.
- The recipient is read from the original contact enquiry or pilot application; it cannot be supplied or changed by the browser.
- Only saved outbound email drafts can be sent.
- The function claims a draft by changing its status to `sending` before contacting the provider, preventing concurrent duplicate sends.
- The provider request uses an idempotency key derived from the draft ID.
- Successful sends are marked `sent` with a timestamp. Provider errors are marked `failed` for review and retry.
- Internal notes cannot be sent as email.

## Current state

The Edge Function and admin UI are deployed in code. Delivery remains unavailable until the Resend domain and secrets above are configured. Existing drafts remain unsent.
