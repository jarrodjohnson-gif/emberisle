// #746: save a named Cloudflare tunnel without touching ~/.cloudflared/config.yml.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const tunnelDirectory = () => path.resolve(process.env.EMBERISLE_TUNNEL_DIR || fileURLToPath(new URL("../.emberisle-tunnel/", import.meta.url)));

function validate(settings) {
  if (settings?.version !== 1) throw new Error("Unsupported named-tunnel settings version.");
  const { hostname, tunnelId, port, credentialsFile } = settings;
  const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  if (typeof hostname !== "string" || hostname.length > 253 || !new RegExp(`^${label}(?:\\.${label})+$`).test(hostname)
    || /^\d+(?:\.\d+){3}$/.test(hostname) || hostname === "trycloudflare.com" || hostname.endsWith(".trycloudflare.com")) {
    throw new Error("Use an owned DNS hostname, such as play.yourdomain.com, without https:// or a path.");
  }
  if (typeof tunnelId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(tunnelId)) {
    throw new Error("Use the tunnel UUID printed by cloudflared tunnel create, not its name.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("The origin port must be an integer from 1 to 65535.");
  if (typeof credentialsFile !== "string" || !path.isAbsolute(credentialsFile)) throw new Error("Use an absolute tunnel credentials path.");
  if (!statSync(credentialsFile).isFile()) throw new Error("The tunnel credentials path must name a file.");
  return settings;
}

export function ingressConfig({ hostname, tunnelId, port, credentialsFile }) {
  // JSON string quoting is also valid YAML and preserves Windows paths and spaces.
  return `tunnel: ${JSON.stringify(tunnelId)}\ncredentials-file: ${JSON.stringify(credentialsFile)}\ningress:\n  - hostname: ${JSON.stringify(hostname)}\n    service: http://127.0.0.1:${port}\n  - service: http_status:404\n`;
}

export function configureTunnel({ hostname, tunnelId, port = 8787, credentialsFile }, directory = tunnelDirectory()) {
  const settings = validate({ version: 1, hostname: hostname?.toLowerCase(), tunnelId, port,
    credentialsFile: path.resolve(credentialsFile || path.join(os.homedir(), ".cloudflared", `${tunnelId}.json`)) });
  // Exclusive directory creation protects both previous settings and any other Cloudflare setup.
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(path.join(directory, "config.yml"), ingressConfig(settings), { flag: "wx", mode: 0o600 });
  writeFileSync(path.join(directory, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return settings;
}

export function readTunnel(directory = tunnelDirectory()) {
  let raw;
  try { raw = readFileSync(path.join(directory, "settings.json"), "utf8"); }
  catch (error) {
    if (error.code === "ENOENT" && !existsSync(directory)) return null;
    throw new Error("Cannot read saved named-tunnel settings. See docs/named-tunnel.md.");
  }
  let settings;
  try { settings = JSON.parse(raw); } catch { throw new Error("Invalid named-tunnel settings JSON. See docs/named-tunnel.md."); }
  validate(settings);
  if (readFileSync(path.join(directory, "config.yml"), "utf8") !== ingressConfig(settings)) {
    throw new Error("Named-tunnel ingress differs from the saved address or port. See docs/named-tunnel.md.");
  }
  return settings;
}

export function tunnelPort(settings, override) {
  const port = Number(override || settings?.port || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535.");
  if (settings && port !== settings.port) throw new Error(`PORT must match the named tunnel's saved origin port ${settings.port}.`);
  return port;
}

export function runTunnel(settings, directory = tunnelDirectory()) {
  // Never pass a shell command or a tunnel token. cloudflared reads its own credentials file.
  return spawnSync("cloudflared", ["tunnel", "--config", path.join(directory, "config.yml"), "run", settings.tunnelId], { stdio: "inherit" });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, hostname, tunnelId, port = "8787", credentialsFile, ...extra] = process.argv.slice(2);
    if (command === "--setup" && hostname && tunnelId && !extra.length) {
      const settings = configureTunnel({ hostname, tunnelId, port: Number(port), credentialsFile });
      console.log(`Saved permanent address: https://${settings.hostname}`);
      console.log(`Create DNS once: cloudflared tunnel route dns ${settings.tunnelId} ${settings.hostname}`);
      console.log("Each game night: npm run night; then run node scripts/named-tunnel.mjs --run in a second terminal.");
    } else if (command === "--run" && process.argv.length === 3) {
      const settings = readTunnel();
      if (!settings) throw new Error("No named tunnel configured. See docs/named-tunnel.md.");
      const result = runTunnel(settings);
      if (result.error) throw new Error("Cannot start cloudflared. Install it and ensure it is on PATH.");
      process.exitCode = result.status ?? 1;
    } else {
      throw new Error("Usage: node scripts/named-tunnel.mjs --setup HOSTNAME TUNNEL-UUID [PORT] [CREDENTIALS-FILE], or --run");
    }
  } catch (error) {
    console.error(`Named tunnel: ${error.code === "EEXIST" ? "Saved configuration already exists; it was not overwritten." : error.message}`);
    process.exitCode = 1;
  }
}
