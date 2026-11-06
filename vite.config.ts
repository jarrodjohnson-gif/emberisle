import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// #543: the island is dynamic-imported, so the browser learns its file only once the index has run. The built page names it
// up front instead (the island sits behind every screen), and, for a reload with a held seat, the online chunk too: they
// download and compile off the main thread while the index runs, and the import() that follows finds them in memory.
function preloadChunks(): Plugin {
  let base = "/";
  return {
    name: "emberisle-preload-chunks",
    apply: "build",
    configResolved(c) {
      base = c.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const file = (name: string) => Object.keys(ctx.bundle ?? {}).find((f) => new RegExp(`^assets/${name}-[\\w-]+\\.js$`).test(f));
        const island = file("IslandCanvas");
        const online = file("online");
        const loading = file("LoadingScreen");
        if (!island || !online || !loading) throw new Error("emberisle-preload-chunks: the IslandCanvas, online or LoadingScreen chunk is missing from the build");
        return [
          { tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `${base}${island}` }, injectTo: "head" },
          // #1281: the loading screen is the first thing a fresh visit shows.
          { tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `${base}${loading}` }, injectTo: "head" },
          {
            tag: "script",
            children: `try{if(localStorage.getItem("emberisle-seat")){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href="${base}${online}";document.head.appendChild(l)}}catch(e){}`,
            injectTo: "head",
          },
        ];
      },
    },
  };
}

// #834: the commit and build time the Table menu shows. A source download has no git, so the commit reads "dev".
function buildSha(): string {
  try {
    if (!existsSync(new URL("./.git", import.meta.url))) return "dev";
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: new URL(".", import.meta.url), stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

// #1262: Ruffle and the Sandwich Stacker SWF are files under /minigames/, not JS imports. The build copies them into
// dist/minigames/ (source maps left out); the dev server reads the same paths from node_modules and docs/spike/928.
const RUFFLE_DIR = fileURLToPath(new URL("./node_modules/@ruffle-rs/ruffle/", import.meta.url));
const SWF_FILE = fileURLToPath(new URL("./docs/spike/928/sandwichStacker.swf", import.meta.url));
const MINIGAME_TYPES: Record<string, string> = { ".js": "text/javascript", ".wasm": "application/wasm", ".swf": "application/x-shockwave-flash" };
function minigameFiles(): Map<string, string> {
  const files = new Map<string, string>([["sandwichStacker.swf", SWF_FILE]]);
  for (const f of readdirSync(RUFFLE_DIR)) {
    if (f.endsWith(".map") || !statSync(RUFFLE_DIR + f).isFile()) continue;
    files.set(`ruffle/${f}`, RUFFLE_DIR + f);
  }
  return files;
}
function minigames(): Plugin {
  return {
    name: "emberisle-minigames",
    generateBundle() {
      for (const [name, file] of minigameFiles()) this.emitFile({ type: "asset", fileName: `minigames/${name}`, source: readFileSync(file) });
    },
    configureServer(server) {
      const files = minigameFiles();
      server.middlewares.use("/minigames", (req, res, next) => {
        let name = "";
        try {
          // A bare "%" in the path throws. That request is not a minigame file.
          name = decodeURIComponent((req.url ?? "").split("?")[0]).slice(1);
        } catch {
          return next();
        }
        const file = files.get(name);
        if (!file) return next();
        const ext = file.slice(file.lastIndexOf("."));
        res.setHeader("content-type", MINIGAME_TYPES[ext] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadChunks(), minigames()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rolldownOptions: {
      output: {
        // #488: everything the first paint imports stays in the index chunk. Left alone, rolldown moves modules shared by the
        // index and two lazy chunks (the store, the button, ...) into a common chunk of their own, which the index would
        // then load anyway. The lazy chunks hold only what the index does not (src/components/game/chunks.ts), and stay
        // plain dynamic entries with named exports, which a retry under a fresh URL relies on (src/lib/lazy.ts). The one
        // module both lazy chunks share and the index does not (the lucide Minus icon) gets a chunk of its own, `minus`.
        codeSplitting: { groups: [{ name: "index", tags: ["$initial"] }] },
      },
    },
  },
});
