// Reject failed host startup instead of leaving a proof's top-level await unsettled.
export function hostPort(host) {
  return new Promise((resolve, reject) => {
    let pending = "";
    const cleanup = () => {
      host.stdout.off("data", data);
      host.off("error", error);
      host.off("exit", exit);
    };
    const error = (cause) => {
      cleanup();
      reject(new Error(`proof host failed to spawn (${cause.code ?? "unknown"})`));
    };
    const exit = (code, signal) => {
      cleanup();
      reject(new Error(`proof host exited before listening (code ${code}, signal ${signal})`));
    };
    const data = (chunk) => {
      pending += String(chunk);
      let end;
      while ((end = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        const match = line.match(/\blistening (\d+)\r?$/);
        if (match) {
          const port = Number(match[1]);
          if (port < 1 || port > 65535) continue;
          cleanup();
          resolve(port);
          return;
        }
      }
      // Bound unrelated output without echoing child logs or environment values.
      pending = pending.slice(-4096);
    };
    host.stdout.on("data", data);
    host.once("error", error);
    host.once("exit", exit);
    if (host.exitCode !== null) exit(host.exitCode, host.signalCode);
    else if (host.signalCode !== null) exit(null, host.signalCode);
  });
}
