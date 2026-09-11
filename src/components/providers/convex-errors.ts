/**
 * Re-export only. The Convex-error-code → user-copy table used to live here **and**
 * again inside `useGameController`; the two drifted, so both now read the one map in
 * `src/lib/errors.ts` (see the header there for how matching works).
 *
 * This file stays because every toast call site imports `describeConvexError` from
 * `@/components/providers/convex-errors`. Prefer `@/lib/errors` in new code.
 */
export {
  convexErrorCode,
  describeConvexError,
  describeGameError,
  errorCopyFor,
  CONVEX_ERROR_CODES,
  DEFAULT_ERROR_MESSAGE,
  type ConvexErrorCode,
  type ErrorLayer,
} from "@/lib/errors";
