# Nkabe AI Workforce

Cloudflare Workers + Agents SDK runtime for Nkabe Inc's internal AI workforce.

## Current first milestone

The first registered agent is **COS-001 — AI Chief of Staff**.

This initial implementation is intentionally read-only:
- Reads company knowledge from the existing Supabase Chief Bridge.
- Reads the Chief's assigned tasks.
- Generates an executive briefing using Cloudflare Workers AI.
- Persists lightweight agent state in a Durable Object.
- Does not create, complete, delegate, approve, submit, publish, or spend.

The existing Supabase project and its workforce tables remain the system of record.
The existing Nkabe website and its GitHub Pages deployment are not changed by this package.

## Runtime

- Cloudflare Workers
- Cloudflare Agents SDK
- Durable Objects with SQLite-backed state
- Workers AI
- Existing Supabase Edge Function: `chief-bridge`

## Required secrets

Configure these as **Worker secrets**, never as Git-tracked variables:

| Name | Purpose |
|---|---|
| `WORKFORCE_API_TOKEN` | Protects the Worker API and agent connections |
| `SUPABASE_URL` | Existing workforce Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side credential used only to call the authenticated Chief Bridge |

Optional variable:
- `WORKERS_AI_MODEL` — defaults to `@cf/zai-org/glm-4.7-flash`.

The service-role key is highly privileged. Do not put it in a browser, GitHub source file,
GitHub Actions logs, or a public configuration. Set it only in Cloudflare's encrypted
Worker secrets after confirming the correct project and function authorization.

## Local development

Requires Node.js 18+.

```bash
npm install
cp .dev.vars.example .dev.vars
# Replace every placeholder locally; never commit .dev.vars.
npm run dev
```

The public `GET /health` endpoint reports only whether required configuration values exist.
It does not claim Supabase or model connectivity has been tested.

Protected API requests require:
`Authorization: Bearer <WORKFORCE_API_TOKEN>`.

Agent endpoint:
`/agents/ChiefOfStaffAgent/chief`

The client must send the same authorization header when opening the agent connection.

## Cloudflare Workers Builds

This package is isolated in `ai-workforce/` so it can be configured as a monorepo project
without changing the root-level GitHub Pages site.

Suggested Workers Builds configuration:
- Repository: `groupnkabe/nkabe-inc`
- Branch: `main` after review/merge
- Root directory: `ai-workforce`
- Build command: `npm install`
- Deploy command: `npm run deploy`

Cloudflare's Workers & Pages GitHub App must be authorized and installed for this repository.
Creating the Worker and linking it to this directory still requires the Cloudflare dashboard.

## Governance boundary

The Chief may analyse, prepare recommendations, and report. This first runtime does not expose
mutating workforce operations. Before enabling task creation, delegation, status updates,
or external tools, the Supabase bridge authorization and approval enforcement must be reviewed
and hardened. In particular, task completion and privileged writes must not be possible merely
because a caller has a valid runtime token.

## Not yet verified

- Cloudflare account linkage and Worker creation
- Workers Builds connection
- Runtime deployment
- Secret configuration
- Supabase bridge HTTP authentication/connectivity
- Workers AI model invocation
- End-to-end agent execution

These remain deployment and acceptance-test steps, not completed claims.
