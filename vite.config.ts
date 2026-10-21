import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { execSync } from "node:child_process";

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


const CLIENT_SHA = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return process.env.GIT_SHA || "unknown";
  }
})();

export default defineConfig({
  define: { "import.meta.env.VITE_GIT_SHA": JSON.stringify(CLIENT_SHA) },
  plugins: [react(), tailwindcss(), preloadChunks()],
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
