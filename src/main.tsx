import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { online } from "@/components/game/chunks";
import { EmberisleApp } from "@/components/game/EmberisleApp";
import { useGame } from "@/lib/game/store";
import "./styles.css";

// Phone haptics must be ready before either restored network events or the first interactive tap.
// This async function leaves the entry module synchronous, so the lazy module can share its React imports.
void (async () => {
  try {
    if (matchMedia("(pointer: coarse)").matches && typeof navigator.vibrate === "function") await import("./lib/haptics");
  } catch { /* the optional motor must not prevent the game from loading */ }
  // The dial still starts before React, in parallel with the first render and island load (#196/#543).
  if (useGame.getState().rejoinTable()) void online.prefetch();
  createRoot(document.getElementById("root")!).render(
    <StrictMode><EmberisleApp /></StrictMode>,
  );
})();
