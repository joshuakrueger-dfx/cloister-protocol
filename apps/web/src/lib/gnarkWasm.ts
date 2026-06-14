// Browser backend for the Cloister SDK: runs the gnark prover (compiled to WASM,
// MIT, GPL-free) inside a Web Worker and wires it into the SDK's pluggable hash +
// prove backend. Init + proving happen OFF the main thread → the UI never freezes.
// Only the relayer/RPC submission needs the network.
//
// Worker + assets live in /public/gnark: cloister-worker.js, wasm_exec.js,
// cloister.wasm, and the proving artifacts circuit.r1cs / pk.bin / vk.bin.

import { setHashBackend, setProveBackend } from "@cloister/sdk";

export interface ProverStatus {
  phase: "idle" | "loading" | "ready" | "error";
  detail?: string;
}

interface Pending {
  resolve: (v: string) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
const pending = new Map<number, Pending>();
let nextId = 1;
let bootPromise: Promise<void> | null = null;
let isReady = false;

function call(op: "hash" | "prove", payload: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!worker) return reject(new Error("prover worker not started"));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, payload });
  });
}

// Startet den Prover-Worker EINMAL und verdrahtet ihn als SDK-Backend.
// onStatus erlaubt der UI, den (einmaligen) Lade-/Init-Fortschritt anzuzeigen.
export function initGnarkBackend(onStatus?: (s: ProverStatus) => void): Promise<void> {
  if (!bootPromise) {
    bootPromise = new Promise<void>((resolve, reject) => {
      onStatus?.({ phase: "loading", detail: "starting prover" });
      worker = new Worker("/gnark/cloister-worker.js");
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m?.type === "ready") {
          // Hash (Poseidon2) + Proof (Groth16) laufen jetzt im Worker.
          setHashBackend(async (items: bigint[]) =>
            BigInt(await call("hash", items.map((x) => x.toString()))),
          );
          setProveBackend(async (witnessInput: unknown) => JSON.parse(await call("prove", witnessInput)));
          isReady = true;
          onStatus?.({ phase: "ready" });
          resolve();
          return;
        }
        if (m?.type === "boot-error") {
          bootPromise = null;
          onStatus?.({ phase: "error", detail: m.error });
          reject(new Error(m.error));
          return;
        }
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          if (m.ok) p.resolve(m.result);
          else p.reject(new Error(m.error));
        }
      };
      worker.onerror = (e) => {
        bootPromise = null;
        onStatus?.({ phase: "error", detail: e.message });
        reject(new Error("prover worker error: " + e.message));
      };
    });
  }
  return bootPromise;
}

export function proverReady(): boolean {
  return isReady;
}
