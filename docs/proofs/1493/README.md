# Clock initialization regression (#1493)

`health-clock-prove` imports the same initializer as `connection-health-prove`.
The helper extracts main's existing three calls unchanged: hold Date with `setFixedTime`,
pause at that held target, then restore Date advancement with `setSystemTime`.
No health interval, assertion, timeout or monotonic origin is replaced.

The focused proof delays delivery of the public `pauseAt` command by 400 and 1,000 ms.
It performs no browser observation before that command. The held wall time must still equal
the target; timers must stay paused across real Node time. Advancing 49 then 1 ms must fire
a 50 ms sentinel once and advance Date and performance by the same 50 ms.

An external control substitutes the exact two-call ordering from commit
`47b4beff878cb079e52fd4572743b45f8bbdba9c`: `install()`, then `pauseAt(new Date())`.
With 400 ms delivery latency it fails with the original `Cannot fast-forward to the past`.
After that failure, the browser wall clock is 400 ms beyond the target; Node target age is
409 ms. There is no extra evaluation before the failing command. The current ordering
passes both delays and the timer contracts. The negative helper is never committed.

In pinned Playwright 1.63.0, pause computes a delta from the target to the controller's wall
time. A running wall clock can overtake the Node-created target. Fixed time holds that wall
time while monotonic ticks can advance; pausing then consumes zero wall-time delta.
This explains the reproduced ordering fault. It does not reconstruct the original hosted
run's exact latency or attribute unrelated startup failures to this cause.

Run locally under `/tmp/emberisle-team-browser.lock`:

```
npm run health-clock-prove
npm run build
npm run connection-health-prove
```

Both proofs are registered in package.json and CI. Focused results do not stand in for full
transport, host and production-startup checks. Actual full-run counts and exact heads are
reported in the PR and durable checkpoint. Raw controls, source hashes and run records are
preserved outside the checkout at `/workspace/work/resume-nov9/1493-clock-regression/`.
