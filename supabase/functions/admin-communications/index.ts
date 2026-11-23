import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
import { Resend } from "npm:resend@6.34.1";

const allowedOrigins = new Set(["https://nkabe.us","https://www.nkabe.us","https://desk.nkabe.us","https://nkabe-admin.nkabeinc.workers.dev","http://localhost:5500","http://127.0.0.1:5500"]);
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
function reply(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers(jsonHeaders);
  if (origin && allowedOrigins.has(origin)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
  return new Response(JSON.stringify(body), { status, headers });
}
function envKey(name: string, fallback: string): string {
  try { const parsed = JSON.parse(Deno.env.get(name) ?? "{}"); if (typeof parsed.default === "string") return parsed.default; } catch {}
  return Deno.env.get(fallback) ?? "";
}
function clean(value: unknown, max: number): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return reply({ error: "Origin not allowed." }, 403, null);
  if (request.method === "OPTIONS") {
    const headers = new Headers({ "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400" });
    if (origin && allowedOrigins.has(origin)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary", "Origin"); }
    return new Response("ok", { headers });
  }
  if (request.method !== "POST") return reply({ error: "Method not allowed." }, 405, origin);
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply({ error: "Sign-in required." }, 401, origin);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const publicKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !serviceKey) return reply({ error: "Communications service is not configured." }, 503, origin);
  const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: "Your session is invalid. Sign in again." }, 401, origin);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: actorError } = await db.from("admin_users").select("user_id,role,is_active,display_name,company_email,mailbox_status").eq("user_id", auth.user.id).maybeSingle();
  if (actorError || !actor || !actor.is_active || !["owner","admin","staff"].includes(actor.role)) return reply({ error: "Active Nkabe team access is required." }, 403, origin);
  let payload: Record<string, unknown>;
  try { const raw = await request.text(); if (raw.length > 12000) return reply({ error: "Request is too large." }, 413, origin); payload = JSON.parse(raw); }
  catch { return reply({ error: "Invalid request." }, 400, origin); }
  const action = clean(payload.action, 32);
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const inboxEmail = "hello@nkabe.us";

  if (action === "inbox_status") {
    const { data, error } = await db.from("admin_email_inboxes").select("email_address,inbox_id,receiving_address,setup_status,last_event_at,created_at").eq("email_address", inboxEmail).maybeSingle();
    if (error) return reply({ error: "Could not load the company inbox status." }, 500, origin);
    return reply({ success: true, configured: Boolean(data), inbox: data ?? null }, 200, origin);
  }

  if (action === "inbox_setup") {
    if (!["owner","admin"].includes(actor.role)) return reply({ error: "Only an Owner or Admin can connect the company inbox." }, 403, origin);
    if (!resendKey) return reply({ error: "Resend is not configured on the server. Add RESEND_API_KEY to Supabase Edge Function secrets." }, 503, origin);
    const resend = new Resend(resendKey);
    let { data: saved, error: savedError } = await db.from("admin_email_inboxes").select("*").eq("email_address", inboxEmail).maybeSingle();
    if (savedError) return reply({ error: "Could not check the existing inbox configuration." }, 500, origin);

    if (!saved) {
      const created = await resend.inboxes.create({
        emailAddress: inboxEmail,
        name: "Nkabe Inc — Company Inbox",
        fromName: "Nkabe Inc",
        forwarding: true,
      });
      if (created.error || !created.data?.id) {
        const message = created.error?.message ?? "Resend did not return an inbox ID.";
        console.error("Resend inbox creation failed:", created.error?.statusCode ?? "provider_error");
        return reply({ error: message }, 502, origin);
      }
      const fetched = await resend.inboxes.get({ id: created.data.id });
      const inbox = fetched.data ?? created.data;
      const inserted = await db.from("admin_email_inboxes").insert({
        email_address: inboxEmail,
        inbox_id: created.data.id,
        receiving_address: inbox.receiving_address ?? null,
        setup_status: "forwarding_pending",
        created_by: auth.user.id,
      }).select("*").single();
      if (inserted.error) {
        console.error("Could not persist Resend inbox configuration:", inserted.error.code);
        return reply({ error: "Resend created the inbox, but Nkabe could not save its configuration. Contact the administrator before retrying." }, 500, origin);
      }
      saved = inserted.data;
    }

    if (!saved.webhook_id || !saved.webhook_secret) {
      const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const endpoint = projectUrl.replace(/\/$/, "") + "/functions/v1/resend-inbox-webhook";
      const webhook = await resend.webhooks.create({ endpoint, events: ["inbox.email.received"] });
      if (webhook.error || !webhook.data?.id || !webhook.data?.signing_secret) {
        console.error("Resend webhook registration failed:", webhook.error?.statusCode ?? "provider_error");
        return reply({ error: webhook.error?.message ?? "Resend could not register the inbound webhook." }, 502, origin);
      }
      const updated = await db.from("admin_email_inboxes").update({
        webhook_id: webhook.data.id,
        webhook_secret: webhook.data.signing_secret,
        updated_at: new Date().toISOString(),
      }).eq("id", saved.id).select("*").single();
      if (updated.error) return reply({ error: "Webhook was created but its verification secret could not be saved. Do not configure Zoho forwarding yet; contact the administrator." }, 500, origin);
      saved = updated.data;
    }
    return reply({
      success: true,
      message: "Resend company inbox and signed inbound webhook are configured. Zoho forwarding is still pending.",
      inbox: { email_address: saved.email_address, inbox_id: saved.inbox_id, receiving_address: saved.receiving_address, setup_status: saved.setup_status },
    }, 200, origin);
  }

  if (action === "inbox_threads") {
    if (!resendKey) return reply({ error: "Resend is not configured on the server." }, 503, origin);
    const { data: saved } = await db.from("admin_email_inboxes").select("inbox_id").eq("email_address", inboxEmail).maybeSingle();
    if (!saved) return reply({ error: "The company inbox has not been connected yet." }, 404, origin);
    const resend = new Resend(resendKey);
    const result = await resend.inboxes.threads.list({ inboxId: saved.inbox_id });
    if (result.error) return reply({ error: result.error.message ?? "Could not load email conversations." }, 502, origin);
    const raw = result.data as any;
    const threads = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return reply({ success: true, threads }, 200, origin);
  }

  if (action === "inbox_thread") {
    if (!resendKey) return reply({ error: "Resend is not configured on the server." }, 503, origin);
    const inboxId = clean(payload.inbox_id, 64), threadId = clean(payload.thread_id, 64);
    const { data: saved } = await db.from("admin_email_inboxes").select("inbox_id").eq("email_address", inboxEmail).maybeSingle();
    if (!saved || saved.inbox_id !== inboxId || !threadId) return reply({ error: "Email conversation not found." }, 404, origin);
    const resend = new Resend(resendKey);
    const result = await resend.inboxes.threads.get({ inboxId, threadId });
    if (result.error) return reply({ error: result.error.message ?? "Could not load the email conversation." }, 502, origin);
    const thread = result.data as any;
    const emailRows = Array.isArray(thread?.emails) ? thread.emails : [];
    const fullEmails = await Promise.all(emailRows.map(async (item: any) => {
      if (!item?.id) return item;
      const full = await resend.inboxes.threads.emails.get({ inboxId, threadId, emailId: item.id });
      return full.data ?? item;
    }));
    return reply({ success: true, thread: { ...thread, emails: fullEmails } }, 200, origin);
  }

  if (action === "inbox_reply") {
    const inboxId = clean(payload.inbox_id, 64), threadId = clean(payload.thread_id, 64), emailId = clean(payload.email_id, 64);
    const textBody = clean(payload.text, 10000);
    if (!textBody || !emailId) return reply({ error: "Write a reply before sending." }, 400, origin);
    const { data: saved } = await db.from("admin_email_inboxes").select("inbox_id").eq("email_address", inboxEmail).maybeSingle();
    if (!saved || saved.inbox_id !== inboxId || !threadId) return reply({ error: "Email conversation not found." }, 404, origin);
    if (!resendKey) return reply({ error: "Resend is not configured on the server." }, 503, origin);
    const resend = new Resend(resendKey);
    const result = await resend.inboxes.threads.emails.reply({ inboxId, threadId, emailId, text: textBody });
    if (result.error) return reply({ error: result.error.message ?? "Could not send the reply." }, 502, origin);
    return reply({ success: true, message: "Reply accepted by Resend.", email_id: result.data?.id ?? null }, 200, origin);
  }

  if (action === "directory") {
    const { data, error } = await db.from("admin_users").select("user_id,display_name,role,company_email").eq("is_active", true).order("display_name", { ascending: true });
    if (error) return reply({ error: "Could not load the team directory." }, 500, origin);
    return reply({ success: true, members: data ?? [] }, 200, origin);
  }
  if (action === "channels") {
    const { data, error } = await db.from("admin_communication_channels").select("id,name,slug,description,channel_type,created_at").eq("is_archived", false).order("channel_type").order("name");
    if (error) return reply({ error: "Could not load communication channels." }, 500, origin);
    return reply({ success: true, channels: data ?? [] }, 200, origin);
  }
  if (action === "create_channel") {
    if (!["owner","admin"].includes(actor.role)) return reply({ error: "Only Owners and Admins can create project channels." }, 403, origin);
    const name = clean(payload.name, 80), description = clean(payload.description, 500);
    const slug = slugify(name);
    if (name.length < 2 || slug.length < 3) return reply({ error: "Enter a channel name with at least two characters." }, 400, origin);
    const { data, error } = await db.from("admin_communication_channels").insert({ name, slug, description, channel_type: "project", created_by: auth.user.id }).select("id,name,slug,description,channel_type,created_at").single();
    if (error) return reply({ error: error.code === "23505" ? "A channel with a similar name already exists." : "Could not create the project channel." }, 400, origin);
    return reply({ success: true, channel: data }, 200, origin);
  }
  if (action === "messages") {
    const channelId = clean(payload.channel_id, 64), peerId = clean(payload.peer_id, 64);
    if (channelId) {
      const { data: channel } = await db.from("admin_communication_channels").select("id").eq("id", channelId).eq("is_archived", false).maybeSingle();
      if (!channel) return reply({ error: "Channel not found." }, 404, origin);
      const { data, error } = await db.from("admin_communication_messages").select("id,channel_id,sender_id,body,parent_message_id,created_at").eq("channel_id", channelId).order("created_at", { ascending: true }).limit(150);
      if (error) return reply({ error: "Could not load channel messages." }, 500, origin);
      return reply({ success: true, messages: data ?? [] }, 200, origin);
    }
    if (peerId) {
      const { data: peer } = await db.from("admin_users").select("user_id").eq("user_id", peerId).eq("is_active", true).maybeSingle();
      if (!peer || peerId === auth.user.id) return reply({ error: "Team member not found." }, 404, origin);
      const [sent, received] = await Promise.all([
        db.from("admin_communication_messages").select("id,sender_id,recipient_id,body,parent_message_id,read_at,created_at").eq("sender_id", auth.user.id).eq("recipient_id", peerId).order("created_at", { ascending: true }).limit(150),
        db.from("admin_communication_messages").select("id,sender_id,recipient_id,body,parent_message_id,read_at,created_at").eq("sender_id", peerId).eq("recipient_id", auth.user.id).order("created_at", { ascending: true }).limit(150)
      ]);
      if (sent.error || received.error) return reply({ error: "Could not load direct messages." }, 500, origin);
      const messages = [...(sent.data ?? []), ...(received.data ?? [])].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-150);
      await db.from("admin_communication_messages").update({ read_at: new Date().toISOString() }).eq("sender_id", peerId).eq("recipient_id", auth.user.id).is("read_at", null);
      return reply({ success: true, messages }, 200, origin);
    }
    return reply({ error: "Choose a channel or team member." }, 400, origin);
  }
  if (action === "send_message") {
    const body = clean(payload.body, 5000), channelId = clean(payload.channel_id, 64), peerId = clean(payload.peer_id, 64), parentId = clean(payload.parent_message_id, 64);
    if (!body) return reply({ error: "Write a message first." }, 400, origin);
    if (channelId) {
      const { data: channel } = await db.from("admin_communication_channels").select("id").eq("id", channelId).eq("is_archived", false).maybeSingle();
      if (!channel) return reply({ error: "Channel not found." }, 404, origin);
      const { data, error } = await db.from("admin_communication_messages").insert({ channel_id: channelId, sender_id: auth.user.id, body, parent_message_id: parentId || null }).select("id,channel_id,sender_id,body,parent_message_id,created_at").single();
      if (error) return reply({ error: "Message could not be sent." }, 500, origin);
      return reply({ success: true, message: data }, 200, origin);
    }
    if (peerId) {
      const { data: peer } = await db.from("admin_users").select("user_id").eq("user_id", peerId).eq("is_active", true).maybeSingle();
      if (!peer || peerId === auth.user.id) return reply({ error: "Team member not found." }, 404, origin);
      const { data, error } = await db.from("admin_communication_messages").insert({ recipient_id: peerId, sender_id: auth.user.id, body, parent_message_id: parentId || null }).select("id,sender_id,recipient_id,body,parent_message_id,created_at").single();
      if (error) return reply({ error: "Message could not be sent." }, 500, origin);
      return reply({ success: true, message: data }, 200, origin);
    }
    return reply({ error: "Choose a channel or team member." }, 400, origin);
  }
  return reply({ error: "Unknown communications action." }, 400, origin);
});
