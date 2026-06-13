// Self-custody Vault: verschlüsselt die Seed-Phrase mit einem Passwort (WebCrypto,
// PBKDF2 → AES-GCM) und legt sie in localStorage ab. Die Keys verlassen das Gerät nie.

const VAULT_KEY = "cloister.vault.v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

interface VaultBlob {
  salt: string;
  iv: string;
  ct: string;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 210000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function vaultExists(): boolean {
  return !!localStorage.getItem(VAULT_KEY);
}

export function clearVault(): void {
  localStorage.removeItem(VAULT_KEY);
}

export async function saveVault(mnemonic: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(mnemonic));
  const blob: VaultBlob = { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

export async function openVault(password: string): Promise<string> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error("no vault on this device");
  const blob = JSON.parse(raw) as VaultBlob;
  const key = await deriveKey(password, unb64(blob.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
    return dec.decode(pt);
  } catch {
    throw new Error("wrong password");
  }
}
