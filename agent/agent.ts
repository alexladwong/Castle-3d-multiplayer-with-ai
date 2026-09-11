// agent/agent.ts — §F.2
//
// Mounted at /eve/v1/* by `withEve(nextConfig)` in next.config.ts; there is no route
// handler for eve's own routes and no second dev process.
import { defineAgent } from "eve";

export default defineAgent({
  // Gateway id string -> routed through the Vercel AI Gateway (credential: the
  // project's VERCEL_OIDC_TOKEN locally / automatically on Vercel, or
  // AI_GATEWAY_API_KEY). Chosen for latency: FR-38 targets < 3 s end to end and a
  // single-step structured turn measures ~2.2 s p50 (eve-agent.md A.7).
  model: "anthropic/claude-haiku-4.5",
  // A chess move from a ranked candidate list needs no chain of thought, and any
  // reasoning tokens land squarely inside the latency budget.
  reasoning: "none",
  // Do not advertise bash / read_file / write_file / web_fetch / web_search /
  // load_skill: ~2.5 k input tokens per step for tools this agent must never call.
  // `agent/tools/*` stays available (eve-agent.md §5, verified field
  // `defaultTools?: boolean` in shared/agent-definition.d.ts).
  defaultTools: false,
  limits: {
    maxOutputTokensPerSession: 40_000,
    maxTokenCostUsdPerSession: 0.5,
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1000,
  },
  compaction: { thresholdPercent: 0.75 },
});
