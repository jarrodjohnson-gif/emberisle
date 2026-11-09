// The wire protocol's version (docs/research/backend-excellence.md G2), sent as `proto` in every hello and welcome.
// Bump it on breaking changes only. A hello without `proto` predates it and counts as 0; 1 is the G1 action stamps (#544).
export const PROTO = 1;

// Shapes the host and the client both check (#1422). A profile login (3 to 24 characters, checked where it is used), a
// profile session token, and a table's join code.
export const LOGIN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const JOIN_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
