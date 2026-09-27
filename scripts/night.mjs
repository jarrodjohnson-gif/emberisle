// #87: build the client, start the rules host, and print the join line.
// The tunnel is Jarrod's step. This process does not start cloudflared.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

// Prefer a real LAN address (192.168.x, 10.x, 172.16-31.x) over a virtual adapter's
// (Hyper-V, WSL, a VPN), which is often unreachable from another machine on the network.
const PRIVATE_RANGES = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

export function lanAddress() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) candidates.push(net.address);
    }
  }
  for (const pattern of PRIVATE_RANGES) {
    const hit = candidates.find((a) => pattern.test(a));
    if (hit) return hit;
  }
  return candidates[0] ?? null;
}

export function joinLines(port, lan) {
  return [
    `On this PC:        http://127.0.0.1:${port}`,
    lan ? `On your network:   http://${lan}:${port}` : "On your network:   (no LAN address found)",
    "Friends on the internet — run this in a second terminal and leave it open:",
    `  cloudflared tunnel --url http://127.0.0.1:${port}`,
    "Paste the https://….trycloudflare.com line it prints. They open that link and Join with the table code.",
  ].join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && process.argv.includes("--print")) {
  console.log(joinLines(process.env.PORT || "8787", lanAddress()));
} else if (isMain) {
  const port = process.env.PORT || "8787";
  // Call Vite's build() in-process (as scripts/tabs-prove.mjs does with createServer): no shell,
  // works the same on Windows, macOS, and Linux, and a build error throws with a readable message
  // instead of spawning "npm", which is npm.cmd on Windows and needs shell: true to find.
  try {
    await build({ root: fileURLToPath(new URL("../", import.meta.url)) });
  } catch (err) {
    console.error("Build failed:", err.message ?? err);
    process.exit(1);
  }

  const host = spawn(process.execPath, ["--import", "./register.mjs", "host.mjs"], {
    cwd: fileURLToPath(new URL("../server/", import.meta.url)),
    env: { ...process.env, PORT: String(port) },
    stdio: ["inherit", "pipe", "inherit"],
  });
  const stop = () => host.kill("SIGTERM");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  host.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    const heard = String(chunk).match(/listening (\d+)/);
    if (heard) console.log(`\n${joinLines(heard[1], lanAddress())}\n`);
  });
  host.on("exit", (code) => process.exit(code ?? 0));
}
