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
        // then load anyway. The lazy chunks hold only what the index does not (src/components/game/chunks.ts); the one
        // icon the sheets and the online chunk share lives with the sheets, not in a third chunk of its own.
        codeSplitting: {
          groups: [
            { name: "index", tags: ["$initial"] },
            { name: "sheets", test: /[\\/]src[\\/]components[\\/]game[\\/]sheets\.ts$/ },
          ],
        },
      },
    },
  },
});
