// @vitest-environment node
// src/lib/tutor/__tests__/model.test.ts — docs/PRO_TUTOR.md §5.6.
//
// The credential check is what turns "this deployment cannot reach a model" into a
// 503 the panel can explain, instead of a charged turn and a stream that dies.
import { afterEach, describe, expect, test } from "vitest";
import { gatewayCredentialPresent, isExpiredJwt, TUTOR_MODEL_ID, isVercelOidcIssued, resolveOidcToken } from "../model";

const KEY = "AI_GATEWAY_API_KEY";
const OIDC = "VERCEL_OIDC_TOKEN";
const saved = { key: process.env[KEY], oidc: process.env[OIDC] };

function jwtWithExp(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds }), "utf8").toString(
    "base64url",
  );
  return `header.${payload}.signature`;
}

afterEach(() => {
  for (const [name, value] of [
    [KEY, saved.key],
    [OIDC, saved.oidc],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("TUTOR_MODEL_ID", () => {
  test("is a gateway id, so the AI SDK needs no provider package", () => {
    expect(TUTOR_MODEL_ID).toBe("anthropic/claude-sonnet-5");
    expect(TUTOR_MODEL_ID).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
  });
});

describe("gatewayCredentialPresent", () => {
  test("an API key is enough on its own", () => {
    process.env[KEY] = "gw_live_something";
    delete process.env[OIDC];
    expect(gatewayCredentialPresent()).toBe(true);
  });

  test("a live OIDC token is enough, an expired one is not", () => {
    delete process.env[KEY];
    process.env[OIDC] = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
    expect(gatewayCredentialPresent()).toBe(true);

    process.env[OIDC] = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
    expect(gatewayCredentialPresent()).toBe(false);
  });

  test("an API key wins even when the OIDC token beside it has expired", () => {
    process.env[KEY] = "gw_live_something";
    process.env[OIDC] = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
    expect(gatewayCredentialPresent()).toBe(true);
  });

  test("nothing set, or an empty string, is no credential", () => {
    delete process.env[KEY];
    delete process.env[OIDC];
    expect(gatewayCredentialPresent()).toBe(false);

    process.env[KEY] = "   ";
    process.env[OIDC] = "";
    expect(gatewayCredentialPresent()).toBe(false);
  });
});

describe("isExpiredJwt", () => {
  const now = 1_800_000_000_000;

  test("reads exp in seconds and compares it to now", () => {
    expect(isExpiredJwt(jwtWithExp(now / 1000 - 1), now)).toBe(true);
    expect(isExpiredJwt(jwtWithExp(now / 1000 + 1), now)).toBe(false);
  });

  test("an unreadable or opaque credential gets the benefit of the doubt", () => {
    for (const token of ["opaque-token", "a.b.c", "a.!!!.c", `header.${Buffer.from("[]").toString("base64url")}.sig`]) {
      expect(isExpiredJwt(token, now)).toBe(false);
    }
  });
});

describe("the inbound OIDC header is the last resort, and only when Vercel minted it", () => {
  const jwt = (claims: Record<string, unknown>) =>
    "eyJhbGciOiJSUzI1NiJ9." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".sig";

  test("accepts a token whose issuer is Vercel's OIDC issuer", () => {
    expect(isVercelOidcIssued(jwt({ iss: "https://oidc.vercel.com/some-team", exp: 9e9 }))).toBe(true);
  });

  test("rejects any other issuer, an opaque string and garbage", () => {
    expect(isVercelOidcIssued(jwt({ iss: "https://evil.example" }))).toBe(false);
    expect(isVercelOidcIssued("not-a-jwt")).toBe(false);
    expect(isVercelOidcIssued("a.b.c")).toBe(false);
  });

  test("prefers the environment over the request header", () => {
    const previous = process.env.VERCEL_OIDC_TOKEN;
    process.env.VERCEL_OIDC_TOKEN = jwt({ iss: "https://oidc.vercel.com/team", exp: 9e9 });
    const headers = new Headers({ "x-vercel-oidc-token": jwt({ iss: "https://oidc.vercel.com/other", exp: 9e9 }) });
    expect(resolveOidcToken(headers)).toBe(process.env.VERCEL_OIDC_TOKEN);
    if (previous === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previous;
  });
});
