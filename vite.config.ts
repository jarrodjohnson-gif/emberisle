import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
