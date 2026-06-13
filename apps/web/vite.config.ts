import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite-Config für das Cloister-Console-Front-end.
// Dev-Server fest auf Port 5180 (siehe Task-Vorgabe).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
});
