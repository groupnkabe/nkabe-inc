import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { Resend } from "npm:resend@6.34.1";

function envKey(name: string, fallback: string): string {
  try { const parsed = JSON.parse(Deno.env.get(name) ?? "{}"); if (typeof parsed.default === "string") return parsed.default; } catch {}
  return Deno.env.get(fallback) ?? "";
}
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const rawBody = await request.text();
  if (rawBody.length > 1024 * 1024) return json({ error: "Payload too large." }, 413);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!url || !serviceKey || !publicKey || !resendKey) return json({ error: "Webhook service is not configured." }, 503);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error } = await db.from("admin_email_inboxes")
    .select("inbox_id,webhook_secret")
    .eq("email_address", "hello@nkabe.us")
    .maybeSingle();
  if (error || !config?.webhook_secret) return json({ error: "Webhook configuration not found." }, 503);

  const resend = new Resend(resendKey);
  let event: any;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: config.webhook_secret,
    });
  } catch {
    return json({ error: "Invalid webhook signature." }, 400);
  }

  if (event?.type !== "inbox.email.received") return json({ success: true, ignored: true });
  const data = event.data ?? {};
  if (data.inbox_id !== config.inbox_id || !data.thread_id || !data.email_id) {
    return json({ error: "Unexpected inbox event." }, 400);
  }

  const eventId = request.headers.get("svix-id");
  if (!eventId) return json({ error: "Missing event identifier." }, 400);

  const inserted = await db.from("admin_email_inbox_events").insert({
    event_id: eventId,
    event_type: event.type,
    inbox_id: data.inbox_id,
    thread_id: data.thread_id,
    email_id: data.email_id,
    event_created_at: event.created_at ?? null,
  }).select("id").maybeSingle();

  if (inserted.error && inserted.error.code !== "23505") {
    console.error("Could not persist Resend inbox event:", inserted.error.code);
    return json({ error: "Could not persist inbox event." }, 500);
  }

  await db.from("admin_email_inboxes").update({
    setup_status: "active",
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("inbox_id", config.inbox_id);

  return json({ success: true });
});
