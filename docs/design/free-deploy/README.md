# Design: permanent free hosting for the game

Refs [#779](https://github.com/jarrodjohnson-gif/emberisle/issues/779). Design stage only.
Nothing here deploys, creates an account, or changes `src/` or `server/`.
Written 2026-10-31 by Claude Opus 5.5 (desk subagent builder).
Corrected 2026-11-12 by Claude Fable 5.2: the Oracle VM can drop a game, so the recommendation changed.
Reworked 2026-11-12 after the owner's answer (D): the Mac is a stopgap, not the home. The recommendation is now a server.
Reworked again 2026-11-12 after his second answer (D): free, off until someone switches it on, and not on his computer.

## Owner request

Jarrod asked: "get this game deployed permanently somewhere free".
`docs/DECISIONS.md` (2026-10-27) parks the Cloudflare papers #789–795 and keeps hosting on his Mac.
That row states the goal: hosting that runs 24/7 or starts on command.
The reason is sharing the game on Threads and Instagram.
On 2026-11-12 the owner ruled the Mac out as the long-term home: it will not be on all day.
Later that day he set the shape (card `q1240-host-v2`): "Free, turned on demand, doesn't need to be 24/7 but not hosted on [my] computer, perhaps I turn on when people want to play?"
The owner clarified the requirement on 2026-11-03 (card `q1240-plan`).
Hosting need not run 24/7 throughout the week.
However, during active play it must stay up with zero drops.
Continuous weekly uptime is optional.
Zero drops during an active game session are mandatory.
This paper answers the request under that rule without porting the host.

Terms used below:

- **Host**: the unchanged `server/host.mjs` process. It serves the page, the WebSocket and the pictures.
- **Data folders**: `ROOMS_DIR`, `PROFILES_DIR` and `RESULTS_DIR`.
- **Tunnel**: a Cloudflare named tunnel run by `cloudflared` next to the host.
- **Public link**: one stable `https://` hostname, such as `play.<domain>`.
- **VM**: one always-free virtual machine.

## 1. What must run

### Parts

- One long-lived Node process: the host. Node `>=22.18` (`server/package.json`).
- The built client in `dist/`. The host serves it on the same origin (`docs/design/same-origin.md`).
- Disk that survives restarts for the three data folders.
- WebSocket support with no short idle cut. The host pings every 30 s (`PING_MS`).
- One stable public HTTPS and WSS link. Players bookmark it and install it on phones.

GitHub Pages already publishes `dist/` nightly (`.github/workflows/pages.yml`).
That copy has no host, so it cannot run an online table by itself.
The deployment keeps the host serving its own page, so one link carries everything.

### Two host rules that decide the platform

- The host trusts `cf-connecting-ip` only from a loopback peer (`server/host.mjs`, #581).
- Profile sign-in needs HTTPS. Behind a proxy, the host accepts that only from loopback with `cf-connecting-ip` and `x-forwarded-proto: https` (`server/profile-protocol.mjs`, `profileGate`).

So `cloudflared` must run on the same machine as the host.
A platform proxy on another address makes every player share one address bucket.
It also turns profile sign-in off ("https" refusal).
Fixing that means changing host code, which this request does not cover.

### Measured needs

Measured on 2026-10-31 in the coding sandbox, at commit `845303fe`.
The script is [`measure-host.mjs`](measure-host.mjs); its output is in [`measure-host.log`](measure-host.log).
It starts the real host with temp data folders.
Table A seats 4 humans that play at once. Table B seats 1 human and 3 bots.
`TURN_MS` is 400 ms, so the host's own bot plays any human who stalls.
A chat line goes out every 3 s.
This is far faster than a real game night, so CPU is an upper bound.

| Measure | Result |
|---|---|
| Node | `v22.22.0`, linux x64 |
| Host memory (RSS) at boot, no tables | 107.8 MB |
| Host memory during play, median | 140.4 MB |
| Host memory peak (kernel high-water) | 143.2 MB |
| Host CPU over 900 s | 23.2 s, or 2.57% of one core |
| Disk: `rooms/` | 57,160 bytes, 2 files |
| Disk: `profiles/` | 4 bytes, 1 file (no profiles made) |
| Disk: `results/` | 689 bytes, 1 file (table B finished) |
| Traffic to the 5 clients | 1,485.44 MiB in 208,112 frames, about 7,484 bytes (7.3 KiB) a frame |

Limits of this run:

- Table A played 1,723 turns in 15 minutes without finishing. Real play is far slower.
- The drivers hit the host's rate limit 482 times ("Slow down."). The host refused those frames, as designed.
- Profiles and pictures were not exercised, so their disk use is not measured.
- `cloudflared` memory was not measured; no tunnel ran in the sandbox.

Derived from the run: about 0.17 MB per client per turn, or 0.68 MB a turn for four players.
At that rate, 1 GB of outbound traffic covers about 1,500 four-player turns.

Build: `npm run build` produced `dist/` of 4.8 MB on disk.
`node_modules` for the host is one package, `ws`.
Room files are deleted after 24 hours (`ROOM_TTL`), so rooms do not grow without bound.

## 2. Options for the unchanged host

All provider facts were checked on **2026-10-31** on the official page linked beside them, unless a line says 2026-11-12.
"Not verified" means the page did not state it or could not be fetched.
Setup times are estimates, not measurements.

### A. Oracle Cloud Always Free VM (Ampere A1)

- **Free forever?** Yes: "Always Free offers that never expire." The $300 trial lasts 30 days. ([Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm))
- **Size:** 2 OCPUs and 12 GB memory total on A1, plus two AMD micro VMs of 1 GB each. ([Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm))
- **Disk:** 200 GB block storage total and five volume backups. (same page)
- **Traffic:** 10 TB outbound per month. (same page)
- **Card?** "Most users need a mobile phone number and a credit card." It "will not be charged unless you upgrade." ([Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm))
- **Always on?** Yes, but idle VMs "may be reclaimed." (Always Free resources)
- Idle means all three hold for 7 days: CPU p95, network and A1 memory each under 20%.
- The measured host is far under all three on any shape. Expect the VM to count as idle.
- **WebSocket and disk:** It is a normal VM, so both work. The tunnel carries WebSockets. ([Tunnel FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/))
- **Capacity:** "Out of host capacity" can block creating an A1 VM; Oracle says retry or wait. (Always Free resources)
- **Home region:** free VMs exist only in the home region chosen at signup. (Free Tier)
- **Surprise bill risk:** low while the account stays Always Free. Upgrading to Pay As You Go removes that guard.
- **Who does what:** Jarrod signs up and creates the VM. An agent writes the scripts that set it up.
- **Setup time (estimate):** 1–2 hours for Jarrod, if A1 capacity is available.
- **Failure modes:** likely idle reclaim; capacity errors at creation; no SLA (not verified today).
- Trial-era A1 VMs over 2 OCPU and 12 GB are deleted 30 days after the trial. (Free Tier)

Not verified today: two Oracle pages returned HTTP 403.
They are the [Oracle FAQ](https://www.oracle.com/cloud/free/faq/) and the [Free page](https://www.oracle.com/cloud/free/).
`docs/research/free-hosting.md` cited that FAQ on 2026-10-18 for three points.
They are card types, no SLA, and 30-day idle accounts.
Treat those three points as unconfirmed until someone re-reads the FAQ.

### B. Google Cloud Free Tier e2-micro

- **Free forever?** "The Free Tier has no end date," with 30 days' notice of changes. ([Free features](https://docs.cloud.google.com/free/docs/free-cloud-features))
- **Size:** one e2-micro per month in `us-west1`, `us-central1` or `us-east1`; 30 GB-months standard disk. (same page)
- **Machine:** e2-micro is 2 vCPUs at a 0.25 share and 1 GB memory. ([Machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines))
- **Traffic:** 1 GB outbound per month from North America. (Free features)
- **Card?** "A Google Cloud billing account is required." The page does not say whether a card is required for the Free Tier alone.
- **Always on?** Yes. The free VM is "non-preemptible", and the page has no idle reclaim rule. (Rechecked 2026-11-12. A missing rule is not a promise.)
- **Maintenance:** "By default, most instances are set to live migrate during host events." ([Host maintenance](https://docs.cloud.google.com/compute/docs/instances/host-maintenance-overview))
- Google calls a live migration "transparent to the guest OS and anything communicating with it", with a pause "typically much less than 1 second". ([Live migration](https://docs.cloud.google.com/compute/docs/instances/live-migration-process))
- That page does not list E2 among the types that cannot migrate. It does not mention open connections by name. The e2-micro's own default setting is not verified (the settings page returned 404).
- **CPU:** the two vCPUs sustain 25% of CPU time in total and can burst to 100% for about 30 seconds. The measured host used 2.57% of one core. (Machine types)
- **WebSocket and disk:** a normal VM, so both work.
- **Surprise bill risk:** real. It is a billing account.
- Alerts-only budgets "don't automatically cap" spending. ([Budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets))
- A spend-cap budget pauses services "until you manually lift the cap." (same page)
- Spend caps exist only "if supported for your service." Support for Compute Engine is not verified.
- **External IPv4 price:** not verified. The [network pricing](https://cloud.google.com/vpc/network-pricing) page did not load in full, on 2026-10-31 and again on 2026-11-12. The free-tier page does not say the address is free, so expect a possible small monthly charge.
- **Who does what:** as A.
- **Setup time (estimate):** 1–2 hours for Jarrod.
- **Failure modes:** the host peaked at 143 MB.
- Headroom beside the OS and `cloudflared` is not measured.
- Outbound traffic over 1 GB a month is billed. The price per GB is not verified.
- 1 GB is about 1,500 four-player turns.
- **Can Google end a game mid-play?** No rule found that stops a running or idle free VM. Google can change the offer with 30 days' notice. A hardware fault can still restart any VM.

### C. Free app platforms

| Platform | Free terms (checked 2026-10-31) | Why it fails the unchanged host |
|---|---|---|
| [Render Free](https://render.com/docs/free) | Sleeps after 15 idle minutes; about one minute to wake; 750 hours a month. | "Ephemeral filesystem"; persistent disks not supported. Rooms, profiles and results are lost. |
| [Koyeb Free](https://www.koyeb.com/docs/reference/instances) | One instance, 512 MB, 0.1 vCPU, 2 GB SSD; Frankfurt or Washington, D.C. | Scales to zero after 1 hour with no traffic; cannot use Volumes. |
| [Fly.io](https://docs.fly.io/about/free-trial) | Trial only: 2 machine hours or 7 days. Trial machines stop after 5 minutes. | Not free after the trial. Adding a card ends the trial and starts billing. |
| Railway | Not re-checked today. The 2026-10-18 research found a $1 monthly credit. | Below the cost of one always-on small instance (`docs/research/free-hosting.md`). |

All three platforms also put a proxy on a non-loopback address in front of the host.
That breaks profile sign-in and per-address limits, as section 1 explains.
Render's page does not say a card is needed to start.
If Free services use up their bandwidth and no payment method is added, Render suspends them for the month.
Koyeb's pages did not state a card rule.

### The fly-io, render and cursor checks on PRs

They are not deployments.
They are GitHub Apps installed on the repo: Claude, Render, Fly.io and Cursor.
Each push creates an empty check suite for each app.
On PR #1234 (`d405208e`) and PR heads from 2026-10-26 they sit `queued` with 0 check runs.
Source: `gh api repos/jarrodjohnson-gif/emberisle/commits/<sha>/check-suites`.
The repo has no `fly.toml`, `render.yaml` or `Dockerfile`.
The only deployment environment in use is `github-pages`.

### D. Cloudflare Workers and Durable Objects

- **Free forever?** Free plan usage "does not bill." Over a limit, "further operations of that type will fail with an error." ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/))
- **Limits:** 100,000 requests a day; 13,000 GB-s a day; 5 GB stored. (same page)
- **CPU:** 10 ms per HTTP request; 128 MB per isolate. ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/))
- **Card?** Not verified today.
- **Always on?** Yes, within quotas.
- **Cost of getting there:** the host does not run here unchanged. It needs the full port in #789–795.
- **Port size:** the host code to rework is about 3,350 lines across 12 files in `server/`.
- That covers HTTP, `ws`, file saves, timers, admission limits, profiles and results.
- The 50 host proofs (about 13,300 lines) need a cloud twin or an adapter.
- The 2026-10-18 research sized the full port as Size M, after seven Size S design papers.
- **Surprise bill risk:** none on Free; quota errors instead.
- **Failure modes:** a quota hit stops the game until the UTC day ends. Each request must fit 10 ms of CPU.
- **Status:** parked by the 2026-10-27 decision.

### E. Jarrod's Mac with a named tunnel (today's path)

- **Free?** Yes. Tunnel is "Available on all plans." ([Tunnel](https://developers.cloudflare.com/tunnel/)) The page states no price.
- **Today:** Jarrod runs `play` (`scripts/emberisle-up.sh`), which opens a quick tunnel.
- Quick tunnels "are for testing and development" and "have no uptime guarantee." ([Quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/))
- The named tunnel (#746, `docs/named-tunnel.md`) is built but not live. It needs a domain on Cloudflare.
- `hightidewash.net` has a pending Cloudflare zone; its Webflow records must move first (#746 comment, 2026-10-19).
- **Always on?** Only while the Mac is awake, online and running both commands.
- **Surprise bill risk:** none.
- **Failure modes:** sleep, reboots, home network loss, macOS updates.

### F. A small paid VM

Checked 2026-11-12 on each provider's own page. The owner is in the US, so US regions matter.

| Plan | Price a month | Memory | Traffic included | IPv4 included | US region |
|---|---|---|---|---|---|
| DigitalOcean Basic ([pricing](https://www.digitalocean.com/pricing/droplets)) | $4.00 | 512 MiB | 500 GiB out | Yes | Yes |
| AWS Lightsail ([pricing](https://aws.amazon.com/lightsail/pricing/)) | $5.00 | 0.5 GB | 1 TB | Yes | Yes |
| Fly.io shared-cpu-1x ([pricing](https://docs.fly.io/about/pricing)) | $2.19 | 256 MB | None; $0.02 a GB | Shared only | Yes |
| Hetzner CX23 ([pricing](https://www.hetzner.com/cloud/cost-optimized/)) | €5.99 | 4 GB | 20 TB | Yes | No: Europe only |
| Hetzner CPX11 ([pricing](https://www.hetzner.com/cloud/regular-performance/)) | €17.99 | 2 GB | 1 TB | Yes | Yes |

- Vultr, Scaleway and OVH: not verified. Their pages did not load.
- **Fit:** the host peaked at 143 MB. 512 MiB should hold it with the OS and `cloudflared`, but that is not measured. 256 MB on Fly.io is too tight to trust.
- **Always on?** Yes. A paid VM has no idle rule and no sleep.
- **Can the provider end a game mid-play?** DigitalOcean moves a VM without a restart for maintenance. If that fails, it sends a notice that it must "briefly shut down the Droplet". ([Live migration](https://docs.digitalocean.com/products/droplets/details/live-migration/)) Its uptime promise is not verified (the page returned 404). Lightsail and Fly.io maintenance rules are not verified.
- **Bill:** a fixed monthly price. DigitalOcean bills by the second with a monthly cap.
- **Other free offers checked and ruled out:** AWS's free plan for new accounts "ends after six months or when your credits are fully used". ([AWS](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html)) Azure's credit lasts 30 days. ([Azure](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account)) Fly.io has no free tier for new accounts. Railway's free plan is $1 of credit a month. ([Railway](https://docs.railway.com/reference/pricing/plans)) Each can end a game when the credit ends.

### Summary

| Option | Free forever | Card | Always on | Can the provider stop a game mid-play? | Unchanged host | Bill risk |
|---|---|---|---|---|---|---|
| A. Oracle A1 VM | Yes | Most users | Yes, but idle reclaim likely | Yes: reclaim can come at any time | Yes | Low unless upgraded |
| B. Google e2-micro | Yes, until Google changes it (30 days' notice) | Billing account | Yes | No rule found; maintenance moves the VM without a restart | Yes; 1 GB free traffic a month | Real |
| C. Render, Koyeb, Fly.io | Render, Koyeb yes; Fly.io trial | Varies | No: they sleep | Yes: they sleep | No: no disk, proxy | Low |
| D. Cloudflare DO | Yes | Not verified | Yes, within quota | Not checked | No: full port | None |
| E. Mac + named tunnel | Yes | No | While the Mac runs | No: there is no provider | Yes | None |
| F. Paid VM (DigitalOcean, $4) | No: $4 a month | Yes | Yes | No rule found; a failed move means a short shutdown, with notice | Yes | Fixed price |

## 3. Recommendation

The owner's rule, as of 2026-11-12: free, off by default, switched on by him or a friend when people want to play, never on his computer, and no drop while a game runs.

Host the game on the free Google e2-micro VM, kept stopped, and started for game night.
Do not use the Oracle VM or a sleep-and-wake platform. Leave #789–795 parked.

### How on demand works on the Google VM

1. **Off.** The VM is stopped. A stopped VM keeps its "attached disks, configuration settings, IP addresses, MAC addresses, and metadata". ([Stop and start](https://docs.cloud.google.com/compute/docs/instances/stop-start-instance)) So rooms, profiles and results stay on the disk.
2. **On.** Jarrod, or a friend he adds to the project, opens the Google Cloud console on a phone, picks the VM and taps "Start / Resume". (same page) The host and the tunnel start with the VM, as services.
   - Google has a phone app. Whether it has a Start button for a VM is not verified: its page would not load.
   - Boot time is not verified. Plan on a minute or two and measure it on the first night.
3. **Play.** The public link works once the tunnel is up. Nothing on the free VM page stops a running VM: it is "non-preemptible" and the page has no idle rule.
4. **Off again.** Tap Stop after the last game. Stopping mid-game would drop it, so the rule is: nobody stops the VM while a table is open. A later step can make the VM stop itself an hour after the last table closes; that is not designed here.

Before the VM is on, the link shows Cloudflare's tunnel error page. A small "The table is closed. Ask Jarrod to open it." page is a follow-up, not part of this paper.

### What it costs

- **Hours.** The free tier covers one e2-micro for every hour of the month ("limit is by time, not by instance"). Four game nights of four hours is 16 hours. ([Free features](https://docs.cloud.google.com/free/docs/free-cloud-features))
- **Disk while stopped.** Google says "you continue to incur charges for any disks ... or external IP addresses" while a VM is stopped. The free tier includes 30 GB-months of standard disk. No page says in so many words that a stopped VM's disk is inside it. Not verified.
- **Address.** The tunnel dials out, so the VM needs no reserved address. Use the default one, which is released on stop. A reserved address would be charged while the VM is stopped (price not verified), so do not reserve one.
- **Traffic.** 1 GB out a month is free, about 1,500 four-player turns at the measured rate. More is billed, price not verified.
- **Billing account.** Needed. A budget alert warns but does not cap.

### Meeting the "no drops during a game" requirement

1. **No host can promise zero drops.** A hardware fault or an outage can restart any server. What a host can offer is no rule that switches a running game off.
2. **The Google VM has no such rule.** For upkeep Google moves a VM without a restart ("transparent to the guest OS and anything communicating with it", pause "typically much less than 1 second"). Whether every open connection survives is Google's claim, not measured here. Google can change the free offer with 30 days' notice.
3. **The Oracle VM cannot meet the rule.** It reclaims VMs that look idle over seven days, and a VM that is off most of the week looks idle. Its phone app can start and stop a VM, but what a stopped Always Free VM keeps is not verified.
4. **Sleep-and-wake platforms do not fit.**
   - Render wakes itself on the first visit in "about one minute", and messages on an open connection keep it awake. But its free disk is wiped on every restart, and "Render might restart a Free web service at any time". ([Render free](https://render.com/docs/free))
   - Koyeb's free instance "can't be used with Volumes", so profiles would be lost. ([Koyeb](https://www.koyeb.com/docs/reference/instances))
   - Google Cloud Run cuts a WebSocket at its request limit, 60 minutes at most, so a long game drops at least once. ([Cloud Run](https://docs.cloud.google.com/run/docs/triggering/websockets))
   - Fly.io has no free tier for new accounts.
   - These also put a proxy in front of the host, which breaks the loopback rule in section 1.
5. **What a drop does to a game, on any host.** Every player drops at once. The host saves each room within 250 ms of a change. The page retries for 10 minutes. When the server is back, players open the link and rejoin their seats.
6. **Until the VM exists.** There is no host that meets the rule. The Mac with the named tunnel (#746) can still run a game night if Jarrod chooses to, but it is not the plan.

### Runbook

This runbook was written for the Oracle VM. It is kept for reference: the Oracle VM is no longer an option on the card.
The Google and DigitalOcean steps are the same in shape (sign up, make the VM, run the provision script, point the tunnel at it). They are written as their own issue once the owner picks.
For the Mac stopgap, follow `docs/named-tunnel.md`; nothing here is needed.

#### Jarrod does these himself

Never paste a password, key, token or tunnel credential into chat, an issue or the repo.

1. Pick the domain for the public link (question 2).
2. If it is `hightidewash.net`: copy the Webflow records into the Cloudflare zone first, then switch nameservers at Squarespace.
3. Sign up at Oracle Cloud with a phone number and a card. Choose a US home region near the players.
4. Do not upgrade to Pay As You Go.
5. Create one VM: shape `VM.Standard.A1.Flex`, 1 OCPU, an Ubuntu ARM64 image (see question 4 for memory).
6. Add his own SSH public key when creating it. Keep the private key on his Mac.
7. Leave the VM's security list with no new inbound rules.
8. Over SSH on the VM, run `cloudflared tunnel login`.
   The VM has no browser. `cloudflared` then prints "Please open the following URL and log in".
   Open that URL on the Mac and pick the domain. Leave `cloudflared` running until it finishes.
   The account certificate, `cert.pem`, is saved on the VM and stays there.
   Sources: [Cloudflare guide](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/), [cloudflared source](https://github.com/cloudflare/cloudflared/blob/master/token/transfer.go).
9. On the VM, run `cloudflared tunnel create emberisle`. Its credentials file stays on the VM.
10. Run the `cloudflared tunnel route dns ...` line that the setup script prints.
11. Turn on a boot volume backup policy in the Oracle console (it counts against the five free backups).
12. Set an Oracle budget with an alert at $1 of actual spend. This is a tripwire, not a cap.
13. For the fallback, copy the tunnel credentials file to the Mac over SSH.
    Keep it in `~/.cloudflared/` on the Mac. Never put it in the repo, chat or an issue.

If A1 shows "out of host capacity", retry later or in another availability domain. Do not upgrade.

#### An agent then builds these in the repo (one issue each)

1. `deploy/vm/provision.sh`: installs Node 22, `cloudflared` and git; creates an `emberisle` user; clones the repo.
2. `deploy/vm/emberisle-host.service`: systemd unit for `node --import ./register.mjs host.mjs`.
   It sets `PORT=8787` and the three data folders under `/var/lib/emberisle/`.
   It uses `Restart=always`, a memory ceiling, and `SIGTERM` so the host flushes rooms.
3. `deploy/vm/cloudflared.service`: runs the tunnel from `scripts/named-tunnel.mjs` settings.
4. `deploy/vm/update.sh` plus a systemd timer: pull `main`, run `npm ci` and `npm run build`, restart only if the code changed.
   This pulls like `play` does, so GitHub holds no SSH key or Oracle secret.
5. `deploy/vm/health.sh` plus a timer: fetch the public link, expect `<title>Emberisle</title>`, open a WSS `peek`.
   On failure it restarts the host once and logs the result.
6. `deploy/vm/backup.sh` plus a nightly timer: archive the data folders to `/var/backups/emberisle/` and keep 14 copies.
   Jarrod's Mac can pull those archives over SSH. They never go into the public repo.
7. A kill switch, documented in `deploy/vm/README.md`:
   - `sudo systemctl stop cloudflared` takes the public link down at once.
   - Deleting the public hostname in the Cloudflare dashboard works from a phone.
   - Stopping the VM in the Oracle console stops everything.
8. A restore guide. Run one host per profile store; never two (`docs/design/profiles.md`, #1029).
9. A fallback guide for the manual switch, below.

#### Fallback: switch to the Mac by hand

Only one host and one tunnel connector may run at any time.
Cloudflare sends each request to the "geographically closest replica" of a tunnel.
It offers no traffic steering between replicas. ([Tunnel availability](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/))
So two connectors would split players across two hosts with two profile stores.
That breaks the "never two" rule above.

Switch to the Mac:

1. On the VM, stop `cloudflared`, then stop the host. The host flushes rooms on `SIGTERM`.
2. Copy the three data folders from the VM to the Mac.
3. If the VM is gone, restore last night's backup archive on the Mac instead.
   Changes since that backup are lost.
4. On the Mac, start the host on those folders, then run `node scripts/named-tunnel.mjs --run`.
5. Open the public link and join a table.

Switch back the same way: stop the Mac tunnel and host, copy the folders back, then start the VM services.

Each script gets a proof registered in `package.json` and `ci.yml`, per AGENTS.md rule 6.
Those proofs run against stubs in CI. Only the live checks below need the VM.

#### Costs if limits are exceeded

- While the account is Always Free, Oracle says the card "will not be charged unless you upgrade."
- After the trial, paid resources "are reclaimed by Oracle unless you upgrade your account." (Free Tier)
- How Oracle blocks over-limit use on a free account is not verified. Expect refusal or reclaim, not a bill.
- After an upgrade, Oracle "will only charge you for resource usage above the Always Free limits." (Always Free resources)
- Oracle budgets are "soft limits" that send email; they do not stop spending. ([Budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm))
- No Oracle price was checked, because this design never leaves Always Free.

#### How to avoid a surprise bill

- Never upgrade to Pay As You Go.
- Create only the one A1 VM, its boot volume, and backups within five.
- Keep everything in the home region.
- Never add a resource that the Always Free page does not list.
- Set a budget alert at $1 of actual spend as a tripwire.
  Budgets are "soft limits": they send email and stop nothing. Alerts are checked every 24 hours.
  Whether Always Free accounts can create budgets, and any minimum amount, are not verified.

#### How it is tested

1. Health proof from outside: `health.sh` against the public link returns the page title and a WSS `peek` reply.
2. Two real clients over the public link: Jarrod's Mac and a phone on mobile data.
   Both join one table, and one places an outpost.
3. Profile check: sign in on the public link; it must not say HTTPS is required.
4. Restart: `sudo reboot` the VM mid-game. Both services return and both clients rejoin their seats.
5. Restore: restore last night's archive onto a fresh folder and boot a host on it, offline.
6. Paste real output in the PR for each step, per AGENTS.md rule 11.

#### Ongoing risks

- **Idle reclaim is likely.** Even the fast run used 2.57% of a core and 143 MB.
  That is far under each 20% threshold on any A1 shape. Expect the VM to count as idle.
  Oracle says idle VMs "may be reclaimed"; it does not say when.
  A smaller memory shape is the only honest lever (question 4). It may still not be enough.
  Do not create fake load to avoid reclaim (`docs/research/free-hosting.md`).
- **A reclaim can come mid-game.** Every player drops. See "What a reclaim does to a game" above.
  This is why game nights run on the Mac.
- **Fallback:** nightly backups plus the Mac, switched by hand as above.
  The health timer shows when the VM is gone. The provision script rebuilds a new VM.
- **Capacity:** a rebuilt VM may face "out of host capacity". The Mac covers that gap.
- **Personal data:** profiles and pictures would live on the VM. That needs Jarrod's OK (question 3).

## 4. Questions for Jarrod

1. **Which home?** This is the one card at the end of this page.
   Recommendation: the free Google VM, off until game night.
   Questions 3 and 5 follow. Question 4 matters only for the Oracle VM.
2. **Which domain for the public link?**
   Options: `play.hightidewash.net` after moving its Webflow records to Cloudflare, or a new domain.
   Recommendation: `hightidewash.net`, since it is free. A new domain costs money (price not checked).
3. **May real profiles, pictures and results live on the VM?**
   The 2026-10-18 OK on #779 covered Cloudflare storage after #795's checks, not a VM at Google, DigitalOcean or Oracle.
   Recommendation: yes, with backups only on the VM and your Mac, never in the repo.
4. **Oracle only: how much memory for the VM?**
   Options: 1 OCPU with 6 GB, as the 2026-10-18 research chose, or the smallest A1 memory for 1 OCPU.
   The host needs about 143 MB. On 6 GB that is about 2%, so the VM is idle by Oracle's test.
   A smaller shape raises the memory share, one of the three idle tests. It adds no fake load.
   CPU and network will stay under 20% either way, so even this may not prevent reclaim.
   Oracle's smallest A1 memory for 1 OCPU is not verified.
   Recommendation: the smallest A1 memory Oracle allows for 1 OCPU.
   The game loses nothing at 143 MB, and it is the only lever against reclaim. The fallback still stands.
5. **How should new code reach the VM?**
   Options: the VM pulls `main` nightly; on every merge; or only when you say so.
   Recommendation: nightly, like the Pages publish, so a bad merge rarely hits a live game night.

## Sources checked 2026-10-31

Rechecked or added on 2026-11-12: Google [Free features](https://docs.cloud.google.com/free/docs/free-cloud-features), [Host maintenance](https://docs.cloud.google.com/compute/docs/instances/host-maintenance-overview), [Live migration](https://docs.cloud.google.com/compute/docs/instances/live-migration-process), [Machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines); DigitalOcean [pricing](https://www.digitalocean.com/pricing/droplets) and [live migration](https://docs.digitalocean.com/products/droplets/details/live-migration/); AWS [Lightsail pricing](https://aws.amazon.com/lightsail/pricing/) and [free plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html); Fly.io [pricing](https://docs.fly.io/about/pricing); Hetzner [cost-optimized](https://www.hetzner.com/cloud/cost-optimized/) and [regular](https://www.hetzner.com/cloud/regular-performance/); Azure [free account](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account); Railway [plans](https://docs.railway.com/reference/pricing/plans). Did not load: Google network pricing, Google host maintenance settings, DigitalOcean SLA, Vultr, Scaleway, OVH.

On-demand facts added 2026-11-12: Google [Stop and start](https://docs.cloud.google.com/compute/docs/instances/stop-start-instance), [Reserve an address](https://docs.cloud.google.com/vpc/docs/reserve-static-external-ip-address); Oracle [mobile app](https://docs.oracle.com/iaas/Content/GSG/Concepts/mobile.htm); Fly.io [autostop](https://docs.fly.io/launch/autostop-autostart); Render [free](https://render.com/docs/free); Koyeb [scale to zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero); Cloud Run [WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets), [request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout). Did not load: the Google Cloud app page, Google pricing for stopped disks and addresses.

- Oracle: [Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm), [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm). FAQ and Free page: HTTP 403.
- Google: [Free features](https://docs.cloud.google.com/free/docs/free-cloud-features), [Machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines), [Budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets). Network pricing: did not load in full.
- Render: [Free](https://render.com/docs/free), [WebSockets](https://render.com/docs/websocket). Pricing page: figures did not load.
- Koyeb: [Instances](https://www.koyeb.com/docs/reference/instances), [Pricing](https://www.koyeb.com/pricing).
- Fly.io: [Free trial](https://docs.fly.io/about/free-trial).
- Cloudflare: [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Tunnel](https://developers.cloudflare.com/tunnel/), [Tunnel FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/), [Tunnel availability](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/), [Named tunnel guide](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/), [cloudflared login source](https://github.com/cloudflare/cloudflared/blob/master/token/transfer.go), [Quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
- Repo: `server/host.mjs`, `server/profile-protocol.mjs`, `server/package.json`, `.github/workflows/pages.yml`, `docs/named-tunnel.md`, `docs/research/free-hosting.md`, #746, #779.

## Owner decision needed

One card.

**Card: "Where should the game be hosted?"**

TLDR: You asked for free, off until someone switches it on, and not on your computer. One option fits all three: Google's free server, kept off and started from your phone on game night.

- **A (recommended): Google's free server, off until game night.** You or a friend tap Start in Google's console on a phone, wait a minute or two (not measured yet), and share the link. Tap Stop after. Nothing switches it off while a game runs. Profiles and saved games stay on its disk.
  It needs a billing account. Free: every hour of the month, 30 GB of disk, 1 GB of traffic. Not verified: the price past 1 GB, and that the disk stays free while the server is off.
- **B: a server that wakes itself when someone opens the link (Render).** No Start tap: the first visit wakes it in about a minute. But it forgets profiles and saved games on every restart, and it can restart at any time, so a game can drop. This breaks your rule.
- **C: a paid server, always on, $4 a month (DigitalOcean).** Nothing to switch on. Not free.
- **D: none of these.** Say what is missing and I will look again.

After A, three questions follow: which domain (question 2), may profiles live on the server (question 3), and how new code reaches it (question 5).
