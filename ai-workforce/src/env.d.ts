interface Env {
  CHIEF_OF_STAFF: DurableObjectNamespace;
  AI: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WORKFORCE_API_TOKEN: string;
  WORKERS_AI_MODEL?: string;
}
