import { Agent, callable } from "agents";

type ChiefState = {
  employeeCode: "COS-001";
  displayName: "AI Chief of Staff";
  status: "ready" | "degraded";
  lastBriefingAt: string | null;
  lastBriefingStatus: "never" | "success" | "failed";
};

type BridgeContext = {
  knowledge: unknown;
  tasks: unknown;
};

const SYSTEM_INSTRUCTIONS = `
You are COS-001, the AI Chief of Staff of Nkabe Inc. You report directly to the Founder/CEO.

Your mandate is to coordinate the internal AI workforce, maintain operational visibility,
review company knowledge and assigned work, and prepare accurate executive briefings.

Governance:
- The Founder/CEO retains final authority.
- You may analyse, plan, prepare drafts, and recommend delegation.
- You may not make external commitments, submit applications, spend money, sign contracts,
  change permissions, or publish public communications without the required founder approval.
- Never claim an action was completed unless the system confirms it.
- Distinguish verified facts, assumptions, risks, recommendations, and blockers.
- Do not invent company traction, customers, partnerships, deployments, revenue, or milestones.
- Nkabe Inc owns the workforce control plane. External providers supply infrastructure and
  intelligence; they do not own the workforce.
- nKABE OS is positioned as "Intelligent infrastructure for the computers you already own."
- The current company priority is validating nKABE OS through institutional pilots, learning
  from users, iterating, and building investor readiness. Do not present unvalidated capability
  as proven operational performance.

When preparing a briefing, be concise, direct, specific, and useful to the Founder.
`;

export class ChiefOfStaffAgent extends Agent<Env, ChiefState> {
  initialState: ChiefState = {
    employeeCode: "COS-001",
    displayName: "AI Chief of Staff",
    status: "ready",
    lastBriefingAt: null,
    lastBriefingStatus: "never"
  };

  private async bridgeGet(path: string): Promise<unknown> {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase bridge credentials are not configured.");
    }

    const base = this.env.SUPABASE_URL.replace(/\/$/, "");
    const response = await fetch(
      `${base}/functions/v1/chief-bridge${path}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Chief Bridge returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }

    return response.json();
  }

  private async loadContext(): Promise<BridgeContext> {
    const [knowledge, tasks] = await Promise.all([
      this.bridgeGet("/knowledge"),
      this.bridgeGet("/tasks")
    ]);

    return { knowledge, tasks };
  }

  @callable()
  async getOperationalContext(): Promise<BridgeContext> {
    return this.loadContext();
  }

  @callable()
  async generateExecutiveBriefing(): Promise<{ briefing: string; generatedAt: string }> {
    const generatedAt = new Date().toISOString();

    try {
      const context = await this.loadContext();
      const model = this.env.WORKERS_AI_MODEL || "@cf/zai-org/glm-4.7-flash";

      const result = await this.env.AI.run(model, {
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTIONS },
          {
            role: "user",
            content:
              "Prepare the current executive briefing from this live company context. " +
              "Cover priorities, task status, completed work only where verified, blockers, " +
              "approval requests, risks, and the three most useful next actions. " +
              "If the context is empty or incomplete, say so clearly.\n\n" +
              JSON.stringify(context)
          }
        ],
        max_tokens: 1800,
        temperature: 0.2
      }) as { response?: string };

      const briefing =
        typeof result?.response === "string"
          ? result.response
          : JSON.stringify(result);

      this.setState({
        ...this.state,
        lastBriefingAt: generatedAt,
        lastBriefingStatus: "success",
        status: "ready"
      });

      return { briefing, generatedAt };
    } catch (error) {
      this.setState({
        ...this.state,
        lastBriefingAt: generatedAt,
        lastBriefingStatus: "failed",
        status: "degraded"
      });
      throw error;
    }
  }
}
