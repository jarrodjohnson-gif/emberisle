// #87: build the client, start the rules host, and print the join line.
// The tunnel is Jarrod's step. This process does not start cloudflared.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
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
  const build = spawn("npm", ["run", "build"], { stdio: "inherit" });
  const built = await new Promise((resolve) => build.on("exit", resolve));
  if (built !== 0) process.exit(built ?? 1);

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
