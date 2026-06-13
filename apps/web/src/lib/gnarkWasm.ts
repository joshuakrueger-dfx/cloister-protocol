// Browser backend for the Cloister SDK: loads the gnark prover compiled to WASM
// (MIT, GPL-free — no snarkjs/circomlib) and wires it into the SDK's pluggable
// hash + prove backend. Proving runs fully client-side; only the relayer/RPC
// submission needs the network.
//
// Assets live in /public/gnark: wasm_exec.js (Go runtime glue), cloister.wasm,
// and the proving artifacts circuit.r1cs / pk.bin / vk.bin.

import { setHashBackend, setProveBackend } from "@cloister/sdk";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Go: any;
    cloisterInit?: (r1cs: Uint8Array, pk: Uint8Array, vk: Uint8Array) => Promise<boolean>;
    cloisterReady?: () => boolean;
    cloisterProve?: (witnessJSON: string) => Promise<string>;
    cloisterHash?: (itemsJSON: string) => string;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`fetch ${path} → ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export interface ProverStatus {
  phase: "idle" | "loading" | "ready" | "error";
  detail?: string;
}

let bootPromise: Promise<void> | null = null;

// Initialisiert den WASM-Prover EINMAL und verdrahtet ihn als SDK-Backend.
// onStatus erlaubt der UI, den (einmaligen) Lade-/Init-Fortschritt anzuzeigen.
export function initGnarkBackend(onStatus?: (s: ProverStatus) => void): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      try {
        onStatus?.({ phase: "loading", detail: "loading prover runtime" });
        await loadScript("/gnark/wasm_exec.js");
        const go = new window.Go();
        const bytes = await fetchBytes("/gnark/cloister.wasm");
        const wasm = (await WebAssembly.instantiate(bytes.buffer as ArrayBuffer, go.importObject)) as unknown as WebAssembly.WebAssemblyInstantiatedSource;
        go.run(wasm.instance); // non-blocking; the Go runtime stays alive (select{})
        for (let i = 0; i < 200 && !window.cloisterInit; i++) await new Promise((r) => setTimeout(r, 20));
        if (!window.cloisterInit) throw new Error("WASM prover did not export its API");

        onStatus?.({ phase: "loading", detail: "loading proving keys" });
        const [r1cs, pk, vk] = await Promise.all([
          fetchBytes("/gnark/circuit.r1cs"),
          fetchBytes("/gnark/pk.bin"),
          fetchBytes("/gnark/vk.bin"),
        ]);
        onStatus?.({ phase: "loading", detail: "initializing prover" });
        await window.cloisterInit(r1cs, pk, vk);

        // SDK-Backend verdrahten: Poseidon2-Hash + Groth16-Proof laufen jetzt im WASM.
        setHashBackend(async (items: bigint[]) =>
          BigInt(window.cloisterHash!(JSON.stringify(items.map((x) => x.toString())))),
        );
        setProveBackend(async (witnessInput: unknown) =>
          JSON.parse(await window.cloisterProve!(JSON.stringify(witnessInput))),
        );
        onStatus?.({ phase: "ready" });
      } catch (e) {
        bootPromise = null; // erlaubt Retry
        onStatus?.({ phase: "error", detail: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    })();
  }
  return bootPromise;
}

export function proverReady(): boolean {
  return typeof window.cloisterReady === "function" && window.cloisterReady();
}
