import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { Resend } from "npm:resend@6.34.1";

function envKey(name: string, fallback: string): string {
  try { const parsed = JSON.parse(Deno.env.get(name) ?? "{}"); if (typeof parsed.default === "string") return parsed.default; } catch {}
  return Deno.env.get(fallback) ?? "";
}
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const headerValue = (headers: Record<string, unknown> | null | undefined, name: string): string => {
  if (!headers) return "";
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : "";
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
};
const cleanAddress = (value: unknown): string => Array.isArray(value) ? value.map(String).join(", ") : String(value ?? "");
const normalizeMessageId = (value: string): string => value.trim().replace(/^<|>$/g, "").toLowerCase();

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const rawBody = await request.text();
  if (rawBody.length > 1024 * 1024) return json({ error: "Payload too large." }, 413);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!url || !serviceKey || !resendKey) return json({ error: "Webhook service is not configured." }, 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error } = await db.from("admin_inbound_email_settings")
    .select("email_address,webhook_secret").eq("email_address", "hello@nkabe.us").maybeSingle();
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
  } catch { return json({ error: "Invalid webhook signature." }, 400); }
  if (event?.type !== "email.received") return json({ success: true, ignored: true });
  const emailId = String(event.data?.email_id ?? "");
  const eventId = request.headers.get("svix-id");
  if (!emailId || !eventId) return json({ error: "Inbound event is incomplete." }, 400);

  const duplicate = await db.from("admin_inbound_email_messages").select("id").eq("provider_email_id", emailId).maybeSingle();
  if (duplicate.data) return json({ success: true, duplicate: true });
  const fetched = await resend.emails.receiving.get(emailId);
  if (fetched.error || !fetched.data) {
    console.error("Could not retrieve received email:", fetched.error?.statusCode ?? "provider_error");
    return json({ error: "Could not retrieve the received email from Resend." }, 502);
  }
  const email: any = fetched.data;
  const headers = email.headers && typeof email.headers === "object" ? email.headers as Record<string, unknown> : {};
  const messageId = headerValue(headers, "message-id") || String(email.message_id ?? "");
  const inReplyTo = headerValue(headers, "in-reply-to");
  const rawReferences = headerValue(headers, "references");
  const references = rawReferences.match(/<[^>]+>/g) ?? (rawReferences ? rawReferences.split(/\s+/).filter(Boolean) : []);
  const relatedIds = [inReplyTo, ...references].filter(Boolean).map(normalizeMessageId);
  let threadId: string | null = null;
  if (relatedIds.length) {
    const { data: prior } = await db.from("admin_inbound_email_messages")
      .select("thread_id,message_id").eq("email_address", config.email_address).not("message_id", "is", null).limit(500);
    const match = (prior ?? []).find((row: any) => relatedIds.includes(normalizeMessageId(String(row.message_id))));
    if (match?.thread_id) threadId = match.thread_id;
  }
  const fromAddress = cleanAddress(email.from);
  const toAddresses = Array.isArray(email.to) ? email.to.map(String) : [cleanAddress(email.to)];
  const ccAddresses = Array.isArray(email.cc) ? email.cc.map(String) : [];
  const subject = String(email.subject ?? "(No subject)").slice(0, 998);
  const plainText = typeof email.text === "string" ? email.text : "";
  const htmlBody = typeof email.html === "string" ? email.html : "";
  const preview = (plainText || htmlBody.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 240);
  if (!threadId) {
    const created = await db.from("admin_inbound_email_threads").insert({
      email_address: config.email_address, subject,
      participants: [fromAddress, ...toAddresses].filter(Boolean),
      preview, last_message_at: email.created_at ?? new Date().toISOString()
    }).select("id").single();
    if (created.error || !created.data) {
      console.error("Could not create inbound email thread:", created.error?.code);
      return json({ error: "Could not save the inbound conversation." }, 500);
    }
    threadId = created.data.id;
  }
  const inserted = await db.from("admin_inbound_email_messages").insert({
    thread_id: threadId, email_address: config.email_address, provider_email_id: emailId,
    direction: "inbound", from_address: fromAddress, to_addresses: toAddresses,
    cc_addresses: ccAddresses, subject, text_body: plainText, html_body: htmlBody,
    message_id: messageId || null, in_reply_to: inReplyTo || null,
    reference_ids: references, headers, created_at: email.created_at ?? new Date().toISOString()
  });
  if (inserted.error) {
    if (inserted.error.code === "23505") return json({ success: true, duplicate: true });
    console.error("Could not save inbound email:", inserted.error.code);
    return json({ error: "Could not save the inbound email." }, 500);
  }
  const { data: current } = await db.from("admin_inbound_email_threads").select("participants").eq("id", threadId).maybeSingle();
  const participants = [...new Set([...(current?.participants ?? []), fromAddress, ...toAddresses].filter(Boolean))];
  await db.from("admin_inbound_email_threads").update({
    participants, preview, last_message_at: email.created_at ?? new Date().toISOString()
  }).eq("id", threadId);
  await db.from("admin_inbound_email_settings").update({
    setup_status: "active", last_event_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }).eq("email_address", config.email_address);
  await db.from("admin_inbound_email_events").upsert({
    event_id: eventId, event_type: event.type, email_id: emailId,
    event_created_at: event.created_at ?? null
  }, { onConflict: "event_id", ignoreDuplicates: true });
  return json({ success: true });
});
