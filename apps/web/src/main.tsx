import { Buffer } from "buffer";
// @cloister/sdk (Note-Verschlüsselung, Hex-Helfer) nutzt Buffer; im Browser bereitstellen.
if (!(globalThis as { Buffer?: unknown }).Buffer) (globalThis as { Buffer?: unknown }).Buffer = Buffer;

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import { PwaPrompts } from "./components/PwaPrompts";
import { Overlays } from "./lib/overlays";

// Hintergrund-Layer (smoke/veil/grain) — global, hinter allem.
const bg = document.createElement("div");
bg.innerHTML = '<div class="smoke"></div><div class="veil"></div><div class="grain"></div>';
document.body.prepend(...Array.from(bg.children));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <PwaPrompts />
    <Overlays />
  </StrictMode>,
);
