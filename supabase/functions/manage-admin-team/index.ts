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

function getSecretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch { /* fall through to legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function getPublishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch { /* fall through */ }
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publishableKey = getPublishableKey();
  const secretKey = getSecretKey();
  if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error("Team management function is missing Supabase configuration.");
    return reply({ error: "Team management is not configured." }, 503, origin);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return reply({ error: "Your session is invalid. Sign in again." }, 401, origin);

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const { data: actor, error: actorError } = await admin
    .from("admin_users")
    .select("user_id, role, is_active")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (actorError || !actor || !actor.is_active || actor.role !== "owner") {
    return reply({ error: "Only an active owner can manage team access." }, 403, origin);
  }

  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return reply({ error: "Request is too large." }, 413, origin);
    payload = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request." }, 400, origin);
  }

  const action = clean(payload.action, 20);

  if (action === "list") {
    const { data: profiles, error: profileError } = await admin
      .from("admin_users")
      .select("user_id, display_name, role, is_active, created_at")
      .order("created_at", { ascending: true });
    if (profileError) {
      console.error("Could not load team profiles:", profileError.message);
      return reply({ error: "Could not load team members." }, 500, origin);
    }

    const authUsers: Array<{ id: string; email?: string; last_sign_in_at?: string }> = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 500 });
      if (error) {
        console.error("Could not load Auth users:", error.message);
        return reply({ error: "Could not load team account details." }, 500, origin);
      }
      authUsers.push(...(data.users ?? []).map((u) => ({ id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at })));
      if ((data.users ?? []).length < 500) break;
    }

    const byId = new Map(authUsers.map((u) => [u.id, u]));
    const members = (profiles ?? []).map((profile) => {
      const authUser = byId.get(profile.user_id);
      return {
        user_id: profile.user_id,
        display_name: profile.display_name,
        role: profile.role,
        is_active: profile.is_active,
        created_at: profile.created_at,
        email: authUser?.email ?? null,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        is_current_user: profile.user_id === actor.user_id
      };
    });
    return reply({ success: true, members }, 200, origin);
  }

  if (action === "invite") {
    const email = clean(payload.email, 254).toLowerCase();
    const displayName = clean(payload.display_name, 120);
    const role = clean(payload.role, 20);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Enter a valid email address." }, 400, origin);
    if (!displayName) return reply({ error: "Enter the team member's name." }, 400, origin);
    if (!["admin", "staff"].includes(role)) return reply({ error: "Invitations can only be for admin or staff roles." }, 400, origin);

    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: "https://nkabe.us/admin/"
    });
    if (inviteError || !invitation.user) {
      console.error("Team invitation failed:", inviteError?.message ?? "No user returned");
      return reply({ error: inviteError?.message?.includes("already") ? "This email already has an Auth account. Manage its existing team access instead." : "The invitation could not be sent. Check Auth email configuration and try again." }, 400, origin);
    }

    const { error: insertError } = await admin.from("admin_users").insert({
      user_id: invitation.user.id,
      display_name: displayName,
      role,
      is_active: true
    });
    if (insertError) {
      console.error("Team profile creation failed:", insertError.message);
      await admin.auth.admin.deleteUser(invitation.user.id);
      return reply({ error: "The invitation could not be completed. No team access was created." }, 500, origin);
    }
    return reply({ success: true, message: "Invitation sent.", user_id: invitation.user.id }, 200, origin);
  }

  if (action === "update") {
    const userId = clean(payload.user_id, 64);
    const role = clean(payload.role, 20);
    const hasActive = typeof payload.is_active === "boolean";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return reply({ error: "Invalid team member." }, 400, origin);
    }
    if (userId === actor.user_id) return reply({ error: "You cannot change your own owner access here." }, 400, origin);
    if (role && !["admin", "staff"].includes(role)) return reply({ error: "Only admin or staff roles can be assigned." }, 400, origin);
    if (!role && !hasActive) return reply({ error: "No changes were supplied." }, 400, origin);

    const { data: target, error: targetError } = await admin
      .from("admin_users")
      .select("user_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (targetError || !target) return reply({ error: "Team member not found." }, 404, origin);
    if (target.role === "owner") return reply({ error: "Owner access cannot be changed from team management." }, 403, origin);

    const changes: Record<string, unknown> = {};
    if (role) changes.role = role;
    if (hasActive) changes.is_active = payload.is_active;

    const { error: updateError } = await admin.from("admin_users").update(changes).eq("user_id", userId);
    if (updateError) {
      console.error("Team access update failed:", updateError.message);
      return reply({ error: "Team access could not be updated." }, 500, origin);
    }
    return reply({ success: true, message: "Team access updated." }, 200, origin);
  }

  return reply({ error: "Unknown action." }, 400, origin);
});
