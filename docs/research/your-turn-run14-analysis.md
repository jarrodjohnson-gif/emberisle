# Diagnostic Analysis of Run 14 in your-turn-stay-prove (#1575)

## Overview

This analysis investigates the run 14 failures recorded during loaded execution of your-turn-stay-prove.
The issue was split from PR #1527 per review desk instructions.

## Incident Symptoms

The run 14 failure produced three distinct timeout symptoms under 2-CPU synthetic load.
First, seat p0 timed out at 1000 ms waiting for turn-moment removal.
Second, seat p1 timed out at 30000 ms waiting for state seq 20 arrival.
Third, seat p2 timed out at 30000 ms during browser page navigation.

## Causal Analysis

Under 2-CPU quota and synthetic CPU load, three compounding mechanisms induce these timeouts.

### 1. Exit Timer Scheduling Latency (p0 gone timeout)

TurnMoment dismissal uses a 160 ms timer: setTimeout(() => onDismiss(), 160).
When timer execution fires, React state updates and unmounts the element.
Under CPU throttling, Node and browser event loops experience dispatch delays.
Timer delivery and DOM reconciliation can exceed 1000 ms wall clock.

### 2. Event-Loop Contention During State Loading (p1 loaded timeout)

The proof fixture handles client hello messages with a polling wait.
Meanwhile, dynamic import of /src/lib/game/board.ts runs concurrently on the page.
On a 2-CPU system, frequent timer wakeups compete with JavaScript module compilation.
This contention delays state initialization beyond the step timeout.

### 3. Vite Compilation Latency (p2 navigation timeout)

The test server uses an on-demand Vite dev server instance.
Cold browser navigations trigger on-the-fly bundling of client modules.
When CPU quotas are constrained, initial page load latency increases substantially.
Browser navigation times out after 30 seconds before client scripts finish executing.

## Stability Findings

Under normal CI conditions, your-turn-stay-prove executes cleanly across all viewports.
All assertions and deadlines remain intact and must not be loosened.
Process isolation and dedicated CPU headroom resolve the run 14 failure modes.
