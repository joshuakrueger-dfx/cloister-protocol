// Wird von esbuild via --inject ZUERST ausgeführt, damit Buffer global ist, bevor
// Module wie blake-hash (circomlibjs-Dep) zur Eval-Zeit darauf zugreifen.
import { Buffer as _Buffer } from "buffer";
import _process from "process";
if (!globalThis.Buffer) globalThis.Buffer = _Buffer;
if (!globalThis.process) globalThis.process = _process;
export {};
