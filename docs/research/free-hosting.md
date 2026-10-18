# Free hosting for the whole game

Research for [#779](https://github.com/jarrodjohnson-gif/emberisle/issues/779), checked **2026-10-18**.
Production source baseline: `ea9be1d4dcfc7d58dacd25e2e281e0998e41e237`.

Cloudflare Free is technically feasible for a family table; the isolated local spike passes the requested restart-and-rejoin experiment.
The complete production port remains unbuilt and unverified on Cloudflare's network.
“Always on” means reachable without Jarrod's computer, within quotas and provider availability.
It does not mean unlimited capacity or a service guarantee.

## Reproducible local proof

The throwaway branch is [`codex/779-durable-object-spike`](https://github.com/jarrodjohnson-gif/emberisle/tree/codex/779-durable-object-spike).
Its code lives exclusively under `spikes/durable-object/`, outside production `src/` and `server/`.
It imports the real shared TypeScript engine without changing production files.
Do not merge that branch into the game.

Read the pinned [setup instructions](https://github.com/jarrodjohnson-gif/emberisle/blob/2caae4f/spikes/durable-object/README.md)
and [complete fresh-clone log](https://github.com/jarrodjohnson-gif/emberisle/blob/2caae4f/spikes/durable-object/RUN-LOG.txt).
The proof ran on macOS ARM64, Node `v22.23.3`, and Wrangler `4.151.1`.
Fresh-clone code commit: `93b1936314205bf46efe45012dece8b23ae67dce`.
Later commits add the log and normalize trailing whitespace only.
No Cloudflare account, login, or deployment was used.

```sh
git clone --branch codex/779-durable-object-spike https://github.com/jarrodjohnson-gif/emberisle.git emberisle-spike
cd emberisle-spike
git checkout --detach 2caae4f
npm ci
npm run build
cd spikes/durable-object
npm ci
npm run prove
```

Use Node 22 and available Chromium, as described in the setup instructions.
The proof launches `wrangler dev --local`, preserving SQLite in a fresh ignored directory.
It gracefully stops Wrangler and workerd, then restarts them using that same directory.
Both real clients reconnect automatically without creating replacement seats.

Actual fresh-clone proof output:

```text
PASS two real browser tabs: unchanged built client sends hello/join; readiness state broadcasts to both
PASS shared TypeScript engine runs inside Durable Object; a real stamped roll advances both clients without exposing opponent hands
PASS SQLite snapshot committed: game seq 1; snapshot 15455 bytes; database 28672 bytes
PASS full Wrangler/workerd restart: Durable Object reconstructed from SQLite; boot 1 -> 2; identical saved game
PASS real client automatic rejoin: both held seat IDs and secrets preserved, no new seats created
PASS invalid seat secret refused; zero browser page errors
MEASURE initial two-tab title/lobby/game flow: 20 same-origin HTTP requests, not a billing or latency benchmark
LIMIT local only; one fixed TEST room; subset of protocol; no full gameplay, alarm, abuse, profile, invite or production routing claim
LIMIT runtime restart drops sockets then rejoins; this does not prove connected-socket hibernation, deployed CPU limits or cloud billing
PASS zero Wrangler runtime exceptions, including WebSocket close cleanup
durable object local spike prove ok
EXIT CODE: 0
```

Root installation, client build, spike installation, and proof each exited `0` from the fresh clone.
Root installation reported one high-severity dependency advisory; this research did not remediate it.
Install-script warnings and the existing large-chunk warning also appeared; the build and runtime completed successfully.
The spike package audit reported zero vulnerabilities.
An earlier run exposed an invalid WebSocket close code during cleanup.
The corrected proof checks runtime logs after shutdown and passes without runtime exceptions.

The browser clicks Host, Join, Ready, Add bot, and Start in the unchanged built client.
The proof sends roll and chat frames through its captured real socket; it does not click those gameplay controls.
The object uses SQLite, `acceptWebSocket()`, serialized connection attachments, and `getWebSockets()`.
It persists before broadcasting and restores the same game digest after reconstruction.

This proves one fixed `TEST` room and a small protocol subset.
Its ten-minute lease approximates a held seat; production grace, silence, holds, and timers remain unimplemented.
The bot loop covers bounded initial actions, not complete bot gameplay.
The proof does not establish abrupt-crash durability or connected-socket hibernation.
Profiles, pictures, invitations, RSVP, watchers, abuse controls, and production room allocation remain unproved.
Local state and screenshots contain private experimental seat material and remain ignored.

## Cloudflare Free-plan evidence

Checked **2026-10-18, America/Phoenix**, using official Cloudflare documentation.
These are account allowances, shared across tables, applications, and other account traffic.

| Resource | Verified Free-plan allowance or behavior | Primary source; document date |
| --- | --- | --- |
| Worker ingress | 100,000 requests/day; 10 ms CPU/invocation; no duration charge; WebSocket upgrade counts once. Later WebSocket messages aren't Worker requests. | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/#workers); updated 2026-10-02 |
| Worker reset/exhaustion | Daily quota resets 00:00 UTC, or 5 PM Phoenix. Exhaustion returns error 1027; routed Workers support fail-open/fail-closed. | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#daily-requests); updated 2026-10-12 |
| Static Assets | Direct asset requests are free and unlimited. Worker-first requests consume Worker quota; exhaustion can return 429. No additional asset-storage charge. | [Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/); updated 2026-04-23 |
| Durable Object compute | 100,000 requests/day; 13,000 GB-s/day. HTTP, RPC sessions, alarms, and incoming WebSocket messages contribute. Incoming messages use 20:1 request conversion. | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#compute-billing); updated 2026-10-18 |
| WebSocket traffic | Connection establishment counts. Outgoing messages and incoming protocol pings are uncharged. Analytics display actual incoming messages, without billing conversion. | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#compute-billing); updated 2026-10-18 |
| SQLite | 5 million rows read/day; 100,000 written/day; 5 GB account storage. KV methods use SQLite rows; deletes consume writes. | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#storage-billing); updated 2026-10-18 |
| Alarm scheduling | Each `setAlarm()` consumes one written row. Free-limit exhaustion fails further operations of that type; daily counters reset 00:00 UTC. | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/#storage-billing); updated 2026-10-18 |
| Duration | Each object uses allocated 0.128 GB for metering, regardless of actual memory. Hibernation-eligible idle objects incur no duration. | [Workers pricing, DO section](https://developers.cloudflare.com/workers/platform/pricing/#durable-objects); updated 2026-10-02 |
| Hibernation | Standard WebSocket acceptance prevents hibernation. Pending callbacks, unfinished events/I/O, and outbound connections can also prevent it. | [DO lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/#durable-object-lifecycle-state-transitions); retrieved 2026-10-18 |
| Object limits | Free allows 100 DO classes and unlimited instances. Use 1 GB/object conservatively; the official FAQ specifies this Free limit. | [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/#what-happens-when-a-durable-object-exceeds-its-storage-limit); updated 2026-06-01 |
| Alarms | One scheduled alarm/object; at-least-once execution; up to six automatic retries. Retries require additional invocation budget. | [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/); updated 2026-04-21 |

The DO limits page inconsistently lists 10 GB/object in its general table.
Its storage-exhaustion FAQ explicitly distinguishes Free's 1 GB from Paid's 10 GB.
The 5 GB Free account limit is consistent.
Do not assume 10 GB/object on Free.

Workers Free is the default account entitlement.
Only SQLite-backed DOs are available on Free.
Paid Workers requires a separate account subscription, with a $5/month minimum.
A website's Cloudflare Free or Pro plan does not determine its Workers subscription.
[Account pricing](https://developers.cloudflare.com/workers/platform/pricing/#fine-print), updated 2026-10-02.

Worker ingress's 10 ms CPU ceiling and DO handler limits are distinct.
The DO documentation lists 30 seconds default CPU/invocation, configurable up to five minutes.
These are execution ceilings, not safe workload targets or free-duration allocations.
[DO CPU limits](https://developers.cloudflare.com/durable-objects/platform/limits/#can-i-increase-durable-objects-cpu-limit), updated 2026-06-01.

## Four-seat, two-hour planning model

These are explicit planning inputs, not measured cloud usage or a capacity guarantee.
One table maps to one DO, with four occupied seats and 7,200 elapsed seconds.
The model includes conservative takeover work within those four seats.
It does not introduce a fifth seat.

| Input | Calculation | Total |
| --- | --- | ---: |
| Inbound game commands | Four players, one command every ten seconds, two hours | 2,880 |
| Inbound chat | Four players, one message every two minutes, two hours | 240 |
| Application heartbeats | Four players, one message every 30 seconds, two hours | 960 |
| Other inbound control | Explicit allowance | 32 |
| Total inbound WebSocket messages | 2,880 + 240 + 960 + 32 | 4,112 |
| Server bot actions | Conservative takeover allowance; no extra seat | 120 |
| Upgrades | Four initial connections plus two reconnects/player | 12 |
| Future admission HTTP | Separate allowance | 5 |
| Worker-first asset HTTP | 100/player; ten times the local ten/person sample | 400 |
| Alarm invocations | One/minute, with zero retries assumed | 120 |

Application heartbeats are not WebSocket protocol pings.
They remain included even if later handled through the hibernation auto-response API.
Server bot actions add processing and persistence, without adding inbound WebSocket messages.
External bot clients would require additional connection and incoming-message terms.

```text
Worker requests = 400 + 12 + 5 = 417
DO request equivalents = ceil(4112 / 20) + 17 + 120 = 343
```

The request-equivalent calculation conservatively rounds the aggregate message quotient upward.
Server bot actions execute inside the already-counted events here.
Independent bot alarms or RPC calls require additional request counts.

Assume snapshot-only persistence, with one written row for each listed event.
Include separate alarm handling and scheduling writes.
Read at most one snapshot row per inbound event, bot action, admission/upgrade HTTP request, or alarm wakeup.

```text
SQLite writes = 4112 + 120 + 17 + 120 + 120 = 4489
SQLite reads  = 4112 + 120 + 17 + 120 = 4369
Duration bound = 7200 seconds × 0.128 GB = 921.6 GB-s
```

| Account resource | One modeled table-night | Daily allowance consumed |
| --- | ---: | ---: |
| Worker requests | 417 | 0.417% |
| DO request equivalents | 343 | 0.343% |
| SQLite writes | 4,489 | 4.489% |
| SQLite reads | 4,369 | 0.08738% |
| Continuously active DO duration | 921.6 GB-s | 7.089% |

Duration is the limiting resource under these assumptions.
Fourteen continuously active table-nights consume 12,902.4 GB-s, almost the entire 13,000 GB-s allowance.
Reserving half the duration allowance leaves seven modeled table-nights/day.
These totals include sequential and simultaneous table-nights within the same UTC day.
They exclude other account usage, retries, abandoned objects, and post-session work.
This arithmetic does not establish supported concurrency.

These totals cover the table, not shared registry, profile, invitation, media, or background services.
Account usage equals table usage plus those authorities and unrelated traffic.
For example, one continuously active two-hour registry adds another 921.6 GB-s.
Fourteen table-nights plus that registry exceed the daily allowance.

As a whole-game planning illustration, reserve two additional authorities throughout one family session.
That allocates 2,764.8 GB-s, or 21.268% of daily duration, before unrelated traffic.
Two such sessions fit within the proposed half-budget reserve; seven is only the table-only calculation.
This assumes one shared registry and one shared profile/invitation authority, not separate continuously active objects per profile.
Allowing 400 extra API requests and object calls raises request totals to 817 Worker requests and 743 DO equivalents.
Allowing 800 extra reads and writes raises SQL totals to 5,169 reads and 5,289 writes.
Reserve 16 MiB for retained profile and picture data, independently of the 128 KiB table payload.
Those shared-service allowances are planning assumptions, not measured costs or an approved architecture.
The profile, media, operations, and acceptance children must replace them with schema-specific measurements before deployment.

Allocate 128 KiB of snapshot payload/table, approximately eight times the observed 15,455-byte snapshot.
Observed SQLite database size was 28,672 bytes.
Payload allowances exclude database overhead, indexes, retained results, profiles, history, and media.
The account's 5 GB stored-data allowance does not reset daily.
Retention deletes consume written rows.
Indexes can add written rows; migrations and history scans also require explicit allowances.
Measure `rowsRead`, `rowsWritten`, and `databaseSize` when available.
[SQLite API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#sql-api), updated 2026-09-21.

## Local evidence boundary

Two real UI tabs generated 20 same-origin HTTP requests through Worker-first assets.
The local snapshot measured 15,455 bytes; SQLite measured 28,672 bytes.
A gracefully stopped Wrangler process restarted successfully and restored state.
This does not prove crash durability, kept-socket hibernation, cloud CPU headroom, billing, latency, or account quotas.
The duration model deliberately assumes continuous activity throughout the two-hour session.
No optimistic hibernation-duration result was measured.
Wrangler's configured limits are enforced on Cloudflare's network, not local development.
[Wrangler limits](https://developers.cloudflare.com/workers/wrangler/configuration/#limits), retrieved 2026-10-18.

## Production port boundaries

These references pin the audited production baseline, rather than the evolving prototype.
The Node host is not a portable library: importing it starts HTTP, WebSockets, filesystem saves, and process handlers.

| Component | Reuse | Required Cloudflare work |
| --- | --- | --- |
| Shared rules, board, AI | Import pure TypeScript and existing legality tests. | Benchmark real turns and bot catch-up inside deployed DO handlers. |
| Intent validation and private projection | Extract host logic and preserve protocol semantics. | Keep seed, RNG, opponent hands, hidden fortunes, and seat credentials private. |
| HTTP, `ws`, filesystem, process lifecycle | Preserve behavior, not Node adapters. | Replace with Worker fetch, hibernation sockets, SQLite, and DO lifecycle. |
| Socket identity | Preserve seat IDs, player IDs, connection stamps, and refusal semantics. | Rebuild socket ownership from attachments; persist replay receipts where required. |
| Saves | Reuse reviewed schema concepts and restart tests. | Version SQLite state; commit before broadcasting; handle failed writes and migrations explicitly. |
| Timers and bots | Preserve turn rules, grace, holds, offers, and bot choices. | Persist absolute deadlines; schedule one earliest-due alarm; bound deterministic catch-up. |
| Room admission | Preserve unique codes, global caps, and creation budgets. | Provide atomic shared registry authority; table-local counters cannot enforce global limits. |
| Client routing | Preserve same-origin operation. | Resolve table identity before upgrading; the current client sends code only after the root upgrade. |
| Peeks and spectators | Preserve narrow public peeks and private spectator projections. | Implement DO subscriptions, watcher limits, and reconnect ownership. |
| Chat and pictures | Reuse validation and rate-limit arithmetic. | Replace disk emote lookup, RAM avatars, secret scanning, and process-local buckets. |

Engine sources: [rules](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/src/lib/game/rules.ts#L3),
[board](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/src/lib/game/board.ts#L66),
and [host projections](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L358).
Adapters: [host imports](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L1),
[save schema](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L205),
and [client connection](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/src/lib/net/table.ts#L180).

### Hibernation and persistence

Constructor reconstruction must distinguish connected hibernating sockets from actual disconnected players.
The current Node loader marks restored humans absent and rebuilds timers.
Copying that behavior into every DO constructor would break hibernating tables.
Persist deadline ownership, grace and hold expiry, trade expiry, bot answer state, replay receipts, and necessary rate buckets.
The existing snapshot omits several of those transient fields.
Reconstruct seat, watcher, connection-stamp, and trusted-address metadata from serialized attachments.
Serialize attachments again when their metadata changes.

Use one alarm for the earliest absolute deadline.
Process all due work deterministically, save progress, and schedule the next deadline.
Alarm delivery can repeat; duplicate execution must not replay turns, results, trades, or rewards.
Remove recurring JavaScript timers, including the Node keepalive interval, to allow hibernation.
Application heartbeats can use hibernation auto-responses where their semantics permit.
Keep reconnect, turn-budget, and room-expiry behavior explicit under delayed alarms.

Sources: [restart restoration](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L331),
[turn deadlines](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L480),
[disconnect holds](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L1373),
and [keepalive](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L1450).
Cloudflare's [WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) explains attachment reconstruction; checked 2026-10-18.

### Trust, shared services, and personal data

The current host trusts `CF-Connecting-IP` only when the TCP peer is loopback.
It also exempts loopback traffic lacking that header from metering.
Those rules rely on a local cloudflared process and do not transfer directly to Workers.
Derive addresses at trusted Cloudflare ingress and pass normalized internal metadata through a protected binding contract.
Discard caller-supplied internal identity headers and enforce origin checks.
Do not retain the Node loopback exemption in cloud admission code.
Use a shared authority for account-wide and per-IP admission budgets across rooms.
Persist appropriate bucket state so hibernation cannot reset abuse limits.

Sources: [IP trust and admission](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L43),
[socket IP assignment](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L1210),
[avatar authorization](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L622),
and [narrow peeks](https://github.com/jarrodjohnson-gif/emberisle/blob/ea9be1d/server/host.mjs#L1300).
Preserve the protections established by [#581](https://github.com/jarrodjohnson-gif/emberisle/issues/581)
and [#770](https://github.com/jarrodjohnson-gif/emberisle/pull/770).

One DO per table does not solve global profile uniqueness, sessions, PIN limits, media retention, or administration.
Profile results require a durable outbox and an idempotent profile authority across object boundaries.
Preserve frozen rosters, deletion tombstones, and private result visibility.
Cloud profile deletion must remove profile-owned uploads and bindings, while preventing delayed results from recreating deleted data.
Preserve curated public repository assets; their deletion requires separate explicit approval under the existing profile design.
RSVP colour reservations require their own atomic authority and release rules.

Reuse [profile design](../design/profiles.md), [#765](https://github.com/jarrodjohnson-gif/emberisle/issues/765),
[#768](https://github.com/jarrodjohnson-gif/emberisle/issues/768), and [#778](https://github.com/jarrodjohnson-gif/emberisle/issues/778).
The existing profile implementation issues remain their owners; this research does not duplicate them.

#778's earlier owner decision keeps pictures beside the profile store on Jarrod's PC.
#779 explicitly investigates removing that PC dependency.
Research permission does not silently authorize moving personal data or credentials.
The [review-desk question](https://github.com/jarrodjohnson-gif/emberisle/issues/779#issuecomment-6253914322)
records an owner data-location decision before cloud implementation.
Both Cloudflare and Oracle require that gate for personal data migration.

### Sized port nodes

Research filed these concrete next-layer children under #779, each in Backlog.
Each is Size S, with one scoped research or design document and an explicit completion test.
They define contracts before filing their own bounded implementation children.
The complete production port is Size M; this seven-session discovery/design layer is not its implementation estimate.

| Node | Contract and evidence |
| --- | --- |
| [#789](https://github.com/jarrodjohnson-gif/emberisle/issues/789) | Worker ingress, atomic room codes, registry ownership, and client routing. |
| [#790](https://github.com/jarrodjohnson-gif/emberisle/issues/790) | Protocol parity, private projections, durable state, replay, and engine extraction. |
| [#791](https://github.com/jarrodjohnson-gif/emberisle/issues/791) | Hibernation attachments, deadline ownership, alarms, and bounded bot catch-up. |
| [#792](https://github.com/jarrodjohnson-gif/emberisle/issues/792) | Trusted ingress, shared abuse budgets, avatar authorization, and media lifecycle. |
| [#793](https://github.com/jarrodjohnson-gif/emberisle/issues/793) | Cloud amendments to existing profile, picture, result, invitation, and RSVP work. |
| [#794](https://github.com/jarrodjohnson-gif/emberisle/issues/794) | Free account, quota refusal, backups, migrations, staged deployment, and rollback. |
| [#795](https://github.com/jarrodjohnson-gif/emberisle/issues/795) | Full-game parity, deployed hibernation, failure recovery, and a measured two-hour soak. |

## Oracle Always Free fallback

This runbook recommends future steps; none ran during this research.
Keep the existing Node host and save format unchanged.
Run shell blocks in Bash.
Obtain owner approval before accounts, card verification, firewall changes, credential transfers, public routing, or service interruption.
Stop before replacing existing files or moving existing saves; list exact paths for owner approval.

### Limits and operational risks

Checked October 18, 2026, using official provider documentation.

- A1 provides 1,500 OCPU-hours and 9,000 GB-hours monthly: 2 OCPU and 12 GB total.
- Create free compute and volumes in the tenancy's home region.
- Capacity shortages can require another availability domain or waiting.
- Shared allowances include 200 GB boot/block storage, five volume backups, and 10 TB monthly outbound transfer.
- Provision one A1 Ubuntu ARM64 VM with 1 OCPU, 6 GB memory, and a 50 GB boot volume.
- Keep replacement VMs and restored volumes inside the same aggregate allowances.
- Oracle can reclaim idle instances after seven days meeting every applicable threshold.
- Thresholds: CPU 95th percentile below 20%, network below 20%, and A1 memory below 20%.
- Quiet game traffic can meet those thresholds; do not manufacture load to defeat reclamation.

Source: [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
Current documentation confirms 2/12; it does not establish the alleged August 18 change date.

Most signups require a phone and card; free accounts incur charges only after upgrading.
Above-limit A1 instances can become disabled and deleted after trial expiry.
Source: [Oracle Free Tier lifecycle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).

Oracle rejects virtual, prepaid, single-use, and PIN-only cards.
Free Tier lacks an SLA and ongoing Oracle Support.
Accounts idle for 30 days risk suspension or termination.
PAYG upgrades cannot be downgraded.
Source: [Oracle FAQ](https://www.oracle.com/cloud/free/faq/).

Signup normally authorizes $1; upgrading normally authorizes $100, with bank-dependent reversal timing.
Do not upgrade merely to obtain capacity without separate spending approval.
Source: [Oracle payment authorizations](https://docs.oracle.com/en-us/iaas/Content/Billing/Tasks/changingpaymentmethod.htm).

### 1. Record the existing host

- Record its commit, Node version, service ownership, environment settings, save path, tunnel UUID, and restore process.
- Record absolute paths privately; keep save contents and credentials outside Git.
- Confirm the source commit's save schema matches the destination.
- Existing room loading expires saves after 24 hours; finish migration within that window.
- Rehearse using a disposable room before scheduling downtime.

### 2. Prepare Ubuntu and Node

Create the VM through the OCI Console only after approving signup and the selected home region.
Choose Compute → Instances → Create instance, using an Ubuntu ARM64 image and `VM.Standard.A1.Flex`.
Set 1 OCPU, 6 GB memory, and a 50 GB boot volume.
Confirm the Console marks the configuration Always Free eligible and shows no paid extras.
Keep combined tenancy usage inside the allowances above, including temporary restore resources.
Select a VCN/subnet with approved outbound internet access and SSH administration.
Upload the owner's SSH public key; keep its private key on the management machine with mode `0600`.
Record the VM address and verify the SSH host fingerprint through the OCI Console before connecting.
If free capacity is unavailable, try another availability domain or wait; do not upgrade automatically.

Use a fresh VM and verified SSH host key.
Run these commands only after approval for machine configuration.
Choose the current approved Node 22 patch from the [official archive](https://nodejs.org/en/download/archive/v22.23.3).

```sh
set -eu
test "$(uname -m)" = aarch64
sudo apt-get update
sudo apt-get install -y ca-certificates curl xz-utils git ufw gnupg rsync
NODE_VERSION=v22.23.3
NODE_FILE="node-${NODE_VERSION}-linux-arm64.tar.xz"
mkdir -p "$HOME/emberisle-install"
cd "$HOME/emberisle-install"
curl --fail --location --proto '=https' --tlsv1.2 -O "https://nodejs.org/dist/${NODE_VERSION}/${NODE_FILE}"
curl --fail --location --proto '=https' --tlsv1.2 -O "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
awk -v file="$NODE_FILE" '$2 == file {print}' SHASUMS256.txt > selected.sha256
test "$(wc -l < selected.sha256)" -eq 1
sha256sum --check selected.sha256
test ! -e "/opt/node-${NODE_VERSION}-linux-arm64"
sudo tar -xJf "$NODE_FILE" -C /opt
export PATH="/opt/node-${NODE_VERSION}-linux-arm64/bin:$PATH"
node --version
node -p 'process.arch'
```

Require the expected version, `arm64`, and checksum `OK` before continuing.
Checksums verify the downloaded archive against Node's HTTPS manifest.
For signature verification, follow the archive's official signed-SHASUMS verification link.

### 3. Install the unchanged application

Use a reviewed commit containing the current production save schema.
Keep the checkout separate from persistent data.
These commands assume the named paths do not exist.

```sh
read -r -p 'Reviewed full commit SHA: ' RELEASE_COMMIT
test ! -e /opt/emberisle
sudo useradd --system --create-home --home-dir /var/lib/emberisle --shell /usr/sbin/nologin emberisle
sudo install -d -o emberisle -g emberisle -m 0755 /opt/emberisle
sudo install -d -o emberisle -g emberisle -m 0700 /var/lib/emberisle/rooms
sudo install -d -o root -g root -m 0700 /etc/emberisle /var/backups/emberisle
sudo -u emberisle git clone https://github.com/jarrodjohnson-gif/emberisle.git /opt/emberisle/app
cd /opt/emberisle/app
sudo -u emberisle git checkout --detach "$RELEASE_COMMIT"
sudo -u emberisle env PATH="$PATH" npm ci
sudo -u emberisle env PATH="$PATH" npm --prefix server ci
sudo -u emberisle env PATH="$PATH" npm run build
git rev-parse HEAD
```

Record the printed commit beside the backup metadata.
Never copy another architecture's `node_modules`.

Create `/etc/emberisle/host.env` using `sudoedit`; set permissions to `0600` afterward.
This template contains no secrets.
Do not add an unsupported `HOST` setting.

```ini
PORT=8787
ROOMS_DIR=/var/lib/emberisle/rooms
DIST=/opt/emberisle/app/dist
NODE_ENV=production
```

Create `/etc/systemd/system/emberisle.service` using `sudoedit`.
Use the exact Node directory installed above.

```ini
[Unit]
Description=Emberisle host
After=network.target

[Service]
Type=simple
User=emberisle
Group=emberisle
WorkingDirectory=/opt/emberisle/app/server
EnvironmentFile=/etc/emberisle/host.env
ExecStart=/opt/node-v22.23.3-linux-arm64/bin/node --import ./register.mjs host.mjs
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
SuccessExitStatus=130 143
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/emberisle/rooms

[Install]
WantedBy=multi-user.target
```

### 4. Isolate ingress and configure staging

`server.listen(PORT)` can bind every interface; loopback routing alone does not isolate the host.
The source trusts `CF-Connecting-IP` only for loopback peers.
Restrict local accounts because local processes can impersonate that trust boundary.

Keep an existing SSH session open during firewall changes.
Confirm OCI console recovery access before enabling UFW.
Approve the exact administrator CIDR first.

```sh
read -r -p 'Approved administrator CIDR: ' ADMIN_CIDR
sudo ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw deny 8787/tcp
sudo ufw enable
sudo ufw status verbose
```

Ensure `/etc/default/ufw` enables IPv6 filtering.
Restrict OCI security-list/NSG ingress similarly; never allow public 8787, including IPv6.
Test a second SSH session before closing the first.
Allow required outbound DNS, HTTPS, and cloudflared TCP/UDP 7844.
Cloudflared requires no public inbound application ports.
Source: [Cloudflare connectivity](https://developers.cloudflare.com/cloudflare-one/networks/connectivity-options/).

Install ARM64 cloudflared using the [official locally managed tunnel guide](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/).
Run account login and named-tunnel creation on the approved management machine only.
Create a separate named staging tunnel after owner approval.
Keep the account-wide `cert.pem` on the owner's management machine.
Keep its directory mode `0700` and certificate mode `0600`.
Never transfer `cert.pem`, account tokens, or the whole `.cloudflared` directory.

Approve transferring this tunnel's UUID-named credential JSON before running the following management-machine commands.
Use an SSH destination with an already verified host key.
These commands copy one credential into a fresh private staging directory.

```sh
set -eu
read -r -p 'Approved staging tunnel UUID: ' TUNNEL_UUID
read -r -p 'Verified OCI SSH destination, ubuntu@host: ' OCI_SSH
[[ "$TUNNEL_UUID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
[[ "$OCI_SSH" =~ ^[A-Za-z0-9][A-Za-z0-9_.@:-]*$ ]]
TUNNEL_CREDENTIAL="$HOME/.cloudflared/${TUNNEL_UUID}.json"
test -f "$TUNNEL_CREDENTIAL"
chmod 0600 "$TUNNEL_CREDENTIAL"
ssh -o StrictHostKeyChecking=yes "$OCI_SSH" "umask 077; mkdir -m 0700 emberisle-tunnel-${TUNNEL_UUID}"
scp -o StrictHostKeyChecking=yes -p "$TUNNEL_CREDENTIAL" "${OCI_SSH}:emberisle-tunnel-${TUNNEL_UUID}/${TUNNEL_UUID}.json"
```

Run the following installation commands on OCI after approval for the exact destination path.
The existence check prevents replacing an existing tunnel credential.

```sh
set -eu
read -r -p 'Approved staging tunnel UUID: ' TUNNEL_UUID
[[ "$TUNNEL_UUID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
sudo install -d -o root -g root -m 0700 /etc/cloudflared
sudo test ! -e "/etc/cloudflared/${TUNNEL_UUID}.json"
sudo install -o root -g root -m 0600 "$HOME/emberisle-tunnel-${TUNNEL_UUID}/${TUNNEL_UUID}.json" "/etc/cloudflared/${TUNNEL_UUID}.json"
sudo stat -c '%a %U:%G %n' "/etc/cloudflared/${TUNNEL_UUID}.json"
```

Require `600 root:root` in the metadata output.
Retain the private staging copy until the owner approves its specific deletion.

After approving the new DNS record, run this on the management machine:

```sh
read -r -p 'Approved staging hostname: ' STAGING_HOSTNAME
cloudflared tunnel route dns "$TUNNEL_UUID" "$STAGING_HOSTNAME"
```

Use a new hostname without an existing record; do not replace production DNS during staging.
Replace the hostname below with that same approved name.

Create `/etc/cloudflared/config.yml`, replacing non-secret identifiers:

```yaml
tunnel: STAGING_TUNNEL_UUID
credentials-file: /etc/cloudflared/STAGING_TUNNEL_UUID.json
ingress:
  - hostname: staging.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

```sh
sudo chmod 0600 /etc/emberisle/host.env /etc/cloudflared/config.yml
sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
sudo cloudflared --config /etc/cloudflared/config.yml service install
sudo systemctl daemon-reload
sudo systemctl enable --now emberisle cloudflared
curl --fail http://127.0.0.1:8787/ >/dev/null
sudo systemctl status emberisle cloudflared --no-pager
sudo journalctl -u emberisle -n 30 --no-pager
```

From the management machine, run `curl --fail "https://$STAGING_HOSTNAME/"` and open two browsers on that hostname.
Require successful joins and WebSocket traffic through the tunnel before continuing.

Explicit configuration avoids root-home lookup surprises.
Source: [Cloudflared Linux service](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/linux/).

### 5. Back up and rehearse restoration

Take consistent application backups after stopping the writer.
Run the following commands from a root shell after approved interruption.
GPG prompts privately; never put passphrases in commands or environment variables.

```sh
sudo bash
set -euo pipefail
umask 077
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE="/var/backups/emberisle/rooms-${STAMP}.tar.gpg"
systemctl stop emberisle
trap 'systemctl start emberisle' EXIT
tar -C /var/lib/emberisle -cf - rooms | gpg --symmetric --cipher-algo AES256 --output "$ARCHIVE"
(cd /var/backups/emberisle && sha256sum "$(basename "$ARCHIVE")") > "${ARCHIVE}.sha256"
systemctl start emberisle
trap - EXIT
exit
```

Copy the encrypted archive and checksum to an approved independent backup destination using SSH.
Verify the checksum there; keep the passphrase separately in the owner's password manager.
Repeat daily and before deployments; record successful copies and rehearse restoration monthly.
Do not delete retained backups automatically without an approved retention policy.

Restore privately into a fresh directory first:

```sh
sudo bash
set -euo pipefail
umask 077
read -r -p 'Absolute encrypted archive path: ' ARCHIVE
(cd "$(dirname "$ARCHIVE")" && sha256sum --check "$(basename "$ARCHIVE").sha256")
RESTORE_DIR=$(mktemp -d /var/lib/emberisle/restore.XXXXXX)
gpg --decrypt "$ARCHIVE" | tar -xf - -C "$RESTORE_DIR"
/opt/node-v22.23.3-linux-arm64/bin/node -e 'const fs=require("node:fs"),p=require("node:path"),d=process.argv[1]; for(const n of fs.readdirSync(d)) if(n.endsWith(".json")) JSON.parse(fs.readFileSync(p.join(d,n),"utf8"))' "$RESTORE_DIR/rooms"
printf '%s\n' "$RESTORE_DIR"
exit
```

Stop on any failed decryption, extraction, or JSON validation.
Test restored copies on an isolated service and staging tunnel:

```sh
read -r -p 'Validated restore directory: ' RESTORE_DIR
sudo chown -R emberisle:emberisle "$RESTORE_DIR"
sudo systemd-run --unit=emberisle-restore --property=User=emberisle --property=Group=emberisle --property=UMask=0077 --property=WorkingDirectory=/opt/emberisle/app/server --setenv=PORT=8788 --setenv="ROOMS_DIR=$RESTORE_DIR/rooms" --setenv=DIST=/opt/emberisle/app/dist /opt/node-v22.23.3-linux-arm64/bin/node --import ./register.mjs host.mjs
curl --fail http://127.0.0.1:8788/ >/dev/null
```

Temporarily point the staging tunnel origin at `127.0.0.1:8788` and restart cloudflared.
Default-deny ingress must also protect test port 8788.
Verify room recovery, player rejoin, and save updates; JSON syntax alone does not prove recovery.
Stop the rehearsal using `sudo systemctl stop emberisle-restore`.
Return the staging origin to port 8787 and restart cloudflared.
Keep restore copies private; never serve their directory.

Optional OCI boot backups provide another recovery path, within the five-backup allowance.
Restore them into new volumes; account for temporary storage and compute headroom.
Running-instance boot backups are crash-consistent; stopped application backups provide explicit consistency.
Source: [Oracle boot restore](https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/create-restore-bv-boot-volume-backup.htm).

### 6. Cut over and roll back

1. Approve downtime and routing changes; record current production routing and both service-control commands.
2. Verify staging joins, WebSockets, restart recovery, reboot startup, offsite backups, and restore rehearsal.
3. From another machine, confirm direct public IPv4 and IPv6 connections to port 8787 fail.
4. Stop production cloudflared admissions; stop the old host gracefully and confirm its process exited.
5. Back up old saves; transfer their encrypted archive and checksum through approved SSH access.
6. Stop the OCI staging writer; extract production saves into a fresh private restore directory.
7. Obtain approval for exact directory moves; log each source and destination in a private migration manifest.
8. Preserve the staging rooms directory; rename the validated production rooms directory into its place.
9. Set owner `emberisle:emberisle`, directory mode `0700`, and file mode `0600` on restored saves.
10. Start OCI; verify saves load without errors before changing production hostname routing.
11. Route production to the OCI tunnel; verify two clients join and recover after reconnecting.
12. Keep the old host and old tunnel stopped; never run two writers for the same production rooms.

Test public-origin bypass for `/`, `/avatars`, `/avatars/<test-id>.jpg`, and any deployed profile-media routes.
Require connection failure directly to the public IP and port, including spoofed `CF-Connecting-IP` requests.
Verify a newly uploaded avatar loads through the tunneled staging hostname.
Current avatar bytes live in memory; restarts do not preserve them.
Check any persistent profile media separately if the deployed commit adds it.
Do not infer loopback binding from cloudflared's origin URL; the host listens on all interfaces.

Use this directory-swap pattern only after approving its exact paths.
Run it while the application and rehearsal services are stopped.
Set `RESTORE_DIR` to the newly validated production restore directory.

```sh
sudo bash
set -euo pipefail
umask 077
read -r -p 'Validated production restore directory: ' RESTORE_DIR
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
PREVIOUS="/var/lib/emberisle/rooms-before-${STAMP}"
MANIFEST="/var/backups/emberisle/moves-${STAMP}.tsv"
test -d "$RESTORE_DIR/rooms"
test ! -e "$PREVIOUS"
printf '%s\t%s\n' /var/lib/emberisle/rooms "$PREVIOUS" >> "$MANIFEST"
mv /var/lib/emberisle/rooms "$PREVIOUS"
printf '%s\t%s\n' "$RESTORE_DIR/rooms" /var/lib/emberisle/rooms >> "$MANIFEST"
mv "$RESTORE_DIR/rooms" /var/lib/emberisle/rooms
chown -R emberisle:emberisle /var/lib/emberisle/rooms
find /var/lib/emberisle/rooms -type d -exec chmod 0700 {} +
find /var/lib/emberisle/rooms -type f -exec chmod 0600 {} +
systemctl start emberisle
journalctl -u emberisle -n 30 --no-pager
exit
```

For rollback, stop OCI admissions and its host first.
Back up OCI's latest saves; restore them privately onto the stopped old host using the same validation sequence.
Preserve previous directories and log every approved move.
Start the old host; restore recorded hostname routing; verify joins and save updates.
Keep OCI stopped after rollback.
Never resume stale old saves after OCI accepted gameplay.
If saves cannot transfer safely, keep admissions closed and resolve recovery before reopening.

## Rejected alternatives

Checked **2026-10-18**, using official provider documentation.

- **Render Free:** sleeps after 15 idle minutes, loses ephemeral files, and offers no persistent disk: [Free limitations](https://render.com/docs/free).
- **Railway Free:** includes $1/month, below even 256 MB continuously allocated RAM at $10/GB-month: [plans](https://docs.railway.com/pricing/plans), [rates](https://docs.railway.com/pricing).
- **Fly.io trial:** ends after two VM-hours or seven days; trial machines automatically stop after five minutes: [trial terms](https://fly.io/docs/about/free-trial/).

Railway's free allowance is real; calling it trial-only would be inaccurate.
The 256 MB example costs approximately $2.50/month before CPU, storage, or egress.
That illustrates insufficient allowance for guaranteed continuous allocation; it does not measure this host's actual memory consumption.

## Recommendation and work order

**Port directly to Cloudflare Workers Free with SQLite Durable Objects; keep the current PC host until production acceptance passes.**
The local proof resolves runtime feasibility, and the conservative table-night model fits the published free allowances.
Oracle adds signup friction and idle-reclamation risk without advancing the intended serverless architecture.
Retain its runbook as a fallback if the deployed Cloudflare acceptance gate fails.
Do not move twice merely to advertise an earlier cloud address.

1. Resolve the personal-data location decision with the review desk and owner before cloud storage implementation.
2. Define routing and state contracts through #789 and #790.
3. Define alarm, security, and shared-profile boundaries through #791, #792, and #793.
4. Define operations and acceptance through #794 and #795; file bounded implementation children from those contracts.
5. Implement and test those children locally, preserving the existing PC host.
6. Obtain owner approval for the account, data location, deployment, and public routing.
7. Run deployed full-game parity, connected-socket hibernation, failure recovery, and the two-hour Free-account soak.
8. Cut over only after quota evidence, private-data behavior, backups, and single-writer rollback pass review.

No step in this research creates an account, configures production, transfers credentials, or moves real saves.
Only the named review desk merges the research PR.
