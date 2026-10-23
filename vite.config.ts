import { readdirSync, readFileSync, statSync } from "node:fs";
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
        if (!island || !online) throw new Error("emberisle-preload-chunks: the IslandCanvas or online chunk is missing from the build");
        return [
          { tag: "link", attrs: { rel: "modulepreload", crossorigin: true, href: `${base}${island}` }, injectTo: "head" },
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

// #937: the lobby's "Play while you wait" box loads Ruffle (@ruffle-rs/ruffle, a devDependency) and the Sandwich Stacker SWF
// only when opened, from /minigames/. Its ~14 MB of wasm never enters a JS chunk and is not committed: the build copies the
// package (LICENSE_APACHE and LICENSE_MIT included, source maps left out) and the SWF into dist/minigames/, which both
// `vite preview` and server/host.mjs already serve; `vite dev` serves the same files from node_modules.
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
        const file = files.get(decodeURIComponent((req.url ?? "").split("?")[0]).slice(1));
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
