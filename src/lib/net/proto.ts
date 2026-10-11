// The wire protocol's version (docs/research/backend-excellence.md G2), sent as `proto` in every hello and welcome.
// Bump it on breaking changes only. A hello without `proto` predates it and counts as 0; 1 is the G1 action stamps (#544).
export const PROTO = 1;
