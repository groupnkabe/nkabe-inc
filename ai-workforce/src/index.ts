import { routeAgentRequest } from "agents";
export { ChiefOfStaffAgent } from "./chief-of-staff";

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function authorized(request: Request, env: Env): boolean {
  if (!env.WORKFORCE_API_TOKEN) return false;
  const supplied = request.headers.get("Authorization") || "";
  return constantTimeEqual(supplied, `Bearer ${env.WORKFORCE_API_TOKEN}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        service: "Nkabe AI Workforce",
        worker: "nkabe-ai-workforce",
        runtime: "Cloudflare Agents",
        agent: "COS-001",
        configured: {
          apiToken: Boolean(env.WORKFORCE_API_TOKEN),
          supabaseUrl: Boolean(env.SUPABASE_URL),
          supabaseBridgeCredential: Boolean(env.SUPABASE_SERVICE_ROLE_KEY)
        },
        note: "Configuration presence only; external connectivity has not been tested."
      });
    }

    if (!authorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      return json({
        service: "Nkabe AI Workforce",
        agent: "COS-001",
        capabilities: ["read_company_knowledge", "read_assigned_tasks", "generate_executive_briefing"],
        writeActionsEnabled: false,
        founderApprovalRequiredFor: [
          "external_submissions",
          "binding_commitments",
          "spending",
          "contracts",
          "public_communications",
          "permission_changes"
        ]
      });
    }

    const agentResponse = await routeAgentRequest(request, env, { cors: false });
    if (agentResponse) return agentResponse;

    return json({ error: "Not found" }, 404);
  }
};
