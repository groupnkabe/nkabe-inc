import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const allowedOrigins = new Set(["https://nkabe.us", "https://www.nkabe.us", "http://localhost:5500", "http://127.0.0.1:5500"]);
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function reply(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers(jsonHeaders);
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch { /* legacy fallback */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch { /* legacy fallback */ }
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin not allowed." }, 403, null);

  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400"
    });
    if (origin && allowedOrigins.has(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Vary", "Origin");
    }
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405, origin);

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply({ error: "Sign-in required." }, 401, origin);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const pubKey = publishableKey();
  const serviceKey = secretKey();
  if (!url || !pubKey || !serviceKey) return reply({ error: "Email service is not configured." }, 503, origin);

  const authClient = createClient(url, pubKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: "Your session is invalid. Sign in again." }, 401, origin);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: actorError } = await db.from("admin_users")
    .select("user_id,role,is_active").eq("user_id", auth.user.id).maybeSingle();

  if (actorError || !actor || !actor.is_active || !["owner", "admin"].includes(actor.role)) {
    return reply({ error: "Only active owners and admins can send email." }, 403, origin);
  }

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4000) return reply({ error: "Request is too large." }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request." }, 400, origin);
  }

  const action = typeof payload.action === "string" ? payload.action : "";
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("NKABE_EMAIL_FROM") ?? "";
  const replyTo = Deno.env.get("NKABE_EMAIL_REPLY_TO") ?? "";

  if (action === "status") {
    return reply({ success: true, configured: Boolean(apiKey && from), provider: "Resend" }, 200, origin);
  }
  if (action !== "send") return reply({ error: "Unknown action." }, 400, origin);
  if (!apiKey || !from) return reply({ error: "Email delivery is not configured yet. Drafts are safe and remain unsent." }, 503, origin);

  const messageId = typeof payload.message_id === "string" ? payload.message_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    return reply({ error: "Select a valid email draft." }, 400, origin);
  }

  const { data: draft, error: draftError } = await db.from("admin_conversation_messages")
    .select("id,contact_message_id,pilot_application_id,message_type,channel,subject,body,delivery_status")
    .eq("id", messageId).maybeSingle();

  if (draftError || !draft) return reply({ error: "Email draft not found." }, 404, origin);
  if (draft.message_type !== "outbound" || draft.channel !== "email") return reply({ error: "Only email drafts can be sent." }, 400, origin);
  if (!["not_configured", "failed"].includes(draft.delivery_status)) {
    return reply({ error: "This email is not in a sendable state. Refresh the conversation." }, 409, origin);
  }

  let recipient = "";
  if (draft.contact_message_id) {
    const { data } = await db.from("contact_messages").select("email").eq("id", draft.contact_message_id).maybeSingle();
    recipient = data?.email ?? "";
  } else if (draft.pilot_application_id) {
    const { data } = await db.from("pilot_applications").select("contact_email").eq("id", draft.pilot_application_id).maybeSingle();
    recipient = data?.contact_email ?? "";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return reply({ error: "The enquiry does not have a valid recipient email address." }, 422, origin);
  }

  const { data: claimed, error: claimError } = await db.from("admin_conversation_messages")
    .update({ delivery_status: "sending", sent_at: null })
    .eq("id", messageId).in("delivery_status", ["not_configured", "failed"])
    .select("id").maybeSingle();

  if (claimError || !claimed) return reply({ error: "This draft is already being processed or is no longer sendable." }, 409, origin);

  const emailPayload: Record<string, unknown> = {
    from,
    to: [recipient],
    subject: draft.subject?.trim() || "Message from Nkabe Inc",
    text: draft.body,
    headers: { "X-Nkabe-Conversation-ID": messageId }
  };
  if (replyTo) emailPayload.reply_to = [replyTo];

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "nkabe-" + messageId
      },
      body: JSON.stringify(emailPayload),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      await db.from("admin_conversation_messages").update({ delivery_status: "failed" }).eq("id", messageId);
      console.error("Resend rejected message:", response.status, result?.name ?? "provider_error");
      return reply({ error: "The email provider rejected this message. The draft is saved and can be reviewed before retrying." }, 502, origin);
    }

    const { error: sentError } = await db.from("admin_conversation_messages")
      .update({ delivery_status: "sent", sent_at: new Date().toISOString() }).eq("id", messageId);
    if (sentError) {
      console.error("Email sent but delivery status update failed:", sentError.message);
      return reply({ success: true, warning: "Email accepted by provider, but the workspace could not update its delivery status. Check the conversation before retrying.", provider_id: result?.id ?? null }, 200, origin);
    }
    return reply({ success: true, message: "Email accepted by Resend.", provider_id: result?.id ?? null }, 200, origin);
  } catch (error) {
    await db.from("admin_conversation_messages").update({ delivery_status: "failed" }).eq("id", messageId);
    console.error("Email provider request failed:", error instanceof Error ? error.message : "unknown_error");
    return reply({ error: "The email provider could not be reached. The draft remains saved and can be retried." }, 502, origin);
  }
});
