import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { online } from "@/components/game/chunks";
import { EmberisleApp } from "@/components/game/EmberisleApp";
import { useGame } from "@/lib/game/store";
import "./styles.css";

// A reload goes straight back to the held seat (#196): the dial and the lobby's chunk start before React renders, so the
// round trip to the host runs while the first render and the island load (#543).
if (useGame.getState().rejoinTable()) void online.prefetch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EmberisleApp />
  </StrictMode>,
);
