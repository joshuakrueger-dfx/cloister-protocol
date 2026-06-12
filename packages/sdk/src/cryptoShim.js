// Isomorphe Krypto-Helfer (Node + Browser/WebView), damit das SDK für die RN-WebView
// gebündelt werden kann. sha256-Ergebnis ist bit-identisch zu node:crypto → Keys/Note-
// Verschlüsselung bleiben unverändert.
import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

export function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return Buffer.from(b);
}

export function sha256(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : Uint8Array.from(input);
  return Buffer.from(nobleSha256(bytes));
}
