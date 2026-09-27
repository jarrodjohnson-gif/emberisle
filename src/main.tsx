import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EmberisleApp } from "@/components/game/EmberisleApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EmberisleApp />
  </StrictMode>,
);
