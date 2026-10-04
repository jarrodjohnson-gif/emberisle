// The app's own "@/..." imports (tsconfig paths) resolve to src/, so a prove can load a module the browser uses (store.ts).
const SRC = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) specifier = new URL(specifier.slice(2), SRC).href;
  if ((specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("file:")) && !/\.[a-z]+$/i.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
