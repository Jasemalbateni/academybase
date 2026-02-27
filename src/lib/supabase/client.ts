// Re-export the singleton browser client from the canonical module.
// All callers that import from this path get the same shared instance,
// preventing multiple concurrent navigator.locks on iOS Safari.
export { createClient } from "./browser";