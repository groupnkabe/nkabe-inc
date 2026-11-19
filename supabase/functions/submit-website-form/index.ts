import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://nkabe.us",
  "https://www.nkabe.us",
  "https://raw.githack.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

function response(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers(jsonHeaders);
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function text(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return response({ success: false, error: "Origin not allowed." }, 403, null);

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

  if (request.method !== "POST") return response({ success: false, error: "Method not allowed." }, 405, origin);

  // Supabase's API gateway validates the public API key. Require the header here
  // as well, but do not compare it to a legacy anon-key environment variable:
  // projects may use either the legacy anon key or a publishable key.
  const suppliedKey = request.headers.get("apikey") ?? "";
  if (!suppliedKey) return response({ success: false, error: "Missing public API key." }, 401, origin);

  const rawBody = await request.text();
  if (rawBody.length > 60000) return response({ success: false, error: "Submission is too large." }, 413, origin);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response({ success: false, error: "Invalid submission." }, 400, origin);
  }

  // Honeypot: return a success-shaped response without storing bot submissions.
  if (text(payload.website, 200)) return response({ success: true }, 200, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return response({ success: false, error: "Submission service is not configured." }, 503, origin);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  if (payload.form_type === "contact") {
    const name = text(payload.name, 120);
    const email = text(payload.email, 254).toLowerCase();
    const message = text(payload.message, 5000);
    if (!name || !validEmail(email) || !message) return response({ success: false, error: "Please complete the required fields." }, 400, origin);

    const { error } = await supabase.from("contact_messages").insert({
      name,
      email,
      organisation: text(payload.organisation, 160) || null,
      message
    });
    if (error) {
      console.error("Contact submission insert failed:", error.message);
      return response({ success: false, error: "Could not save your message." }, 500, origin);
    }
    return response({ success: true }, 200, origin);
  }

  if (payload.form_type !== "pilot") return response({ success: false, error: "Unknown form type." }, 400, origin);

  const contactName = text(payload.contact_name, 120);
  const contactEmail = text(payload.contact_email, 254).toLowerCase();
  const organisationName = text(payload.organisation_name, 180);
  const organisationType = text(payload.organisation_type, 100);
  const townCity = text(payload.town_city, 120);
  const regionState = text(payload.region_state, 120);
  const country = text(payload.country, 100);
  const useCase = text(payload.use_case, 5000);
  const groups = Array.isArray(payload.computer_groups) ? payload.computer_groups.slice(0, 40) : [];
  const capabilities = Array.isArray(payload.capabilities)
    ? payload.capabilities.filter((item): item is string => typeof item === "string").slice(0, 20).map((item) => text(item, 120))
    : [];

  if (!contactName || !validEmail(contactEmail) || !organisationName || !organisationType || !townCity || !regionState || !country || !useCase || !payload.contact_permission || groups.length === 0) {
    return response({ success: false, error: "Please complete the required organisation, use-case, inventory and consent fields." }, 400, origin);
  }

  const cleanGroups = groups.map((item, index) => {
    const group = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      group_number: index + 1,
      computer_type: text(group.computer_type, 80),
      quantity: Number(group.quantity),
      manufacturer_model: text(group.manufacturer_model, 180),
      processor: text(group.processor, 120) || null,
      ram: text(group.ram, 60) || null,
      storage: text(group.storage, 60) || null,
      operating_system: text(group.operating_system, 80) || null,
      approximate_age: text(group.approximate_age, 60) || null,
      condition: text(group.condition, 120)
    };
  });

  if (cleanGroups.some((group) =>
    !group.computer_type ||
    !Number.isInteger(group.quantity) || group.quantity < 1 || group.quantity > 10000 ||
    !group.manufacturer_model || !group.condition
  )) {
    return response({ success: false, error: "Please check each computer inventory group." }, 400, origin);
  }

  const { data: application, error: applicationError } = await supabase
    .from("pilot_applications")
    .insert({
      contact_name: contactName,
      contact_email: contactEmail,
      phone_or_whatsapp: text(payload.phone_or_whatsapp, 80) || null,
      contact_role: text(payload.contact_role, 120) || null,
      organisation_name: organisationName,
      organisation_type: organisationType,
      organisation_website: text(payload.organisation_website, 300) || null,
      town_city: townCity,
      region_state: regionState,
      country,
      capabilities,
      use_case: useCase,
      existing_inventory_link: text(payload.existing_inventory_link, 500) || null,
      local_network: text(payload.local_network, 100) || null,
      internet_connectivity: text(payload.internet_connectivity, 100) || null,
      networking_equipment: text(payload.networking_equipment, 120) || null,
      computer_room_or_lab: text(payload.computer_room_or_lab, 120) || null,
      electricity_reliability: text(payload.electricity_reliability, 100) || null,
      backup_power: text(payload.backup_power, 100) || null,
      it_support_arrangement: text(payload.it_support_arrangement, 500) || null,
      additional_information: text(payload.additional_information, 3000) || null,
      contact_permission: true
    })
    .select("id")
    .single();

  if (applicationError || !application) {
    console.error("Pilot application insert failed:", applicationError?.message);
    return response({ success: false, error: "Could not save your application." }, 500, origin);
  }

  const { error: groupsError } = await supabase.from("pilot_computer_groups").insert(
    cleanGroups.map((group) => ({ ...group, application_id: application.id }))
  );

  if (groupsError) {
    console.error("Pilot inventory insert failed:", groupsError.message);
    await supabase.from("pilot_applications").delete().eq("id", application.id);
    return response({ success: false, error: "Could not save the computer inventory. Please try again." }, 500, origin);
  }

  return response({ success: true }, 200, origin);
});
