// Ambient declaration for the plain-JS @cloister/sdk (no shipped .d.ts).
// Loose typing — the app uses a thin slice (keys, witness, notes, backend wiring).
declare module "@cloister/sdk" {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export const FIELD_SIZE: bigint;
  export const ZERO_VALUE: bigint;
  export const MERKLE_LEVELS: number;
  export function poseidon(items: bigint[]): Promise<bigint>;
  export function setHashBackend(fn: (items: bigint[]) => Promise<bigint>): void;
  export function setProveBackend(fn: (witnessInput: any) => Promise<any>): void;
  export function hasHashBackend(): boolean;
  export function useHttpBackend(baseUrl: string, fetchImpl?: typeof fetch): void;
  export function generateMnemonic(): string;
  export function validateMnemonic(m: string): boolean;
  export function spendKeyFromMnemonic(m: string, account?: number): bigint;
  export const SUBGROUP_ORDER: bigint;
  export function randomField(): bigint;
  export class Keypair {
    privateKey: bigint;
    publicKey: bigint;
    enc: { publicKey: Uint8Array; secretKey: Uint8Array };
    derive(): Promise<Keypair>;
    address(): { pubKey: bigint; encPubKey: string };
    static create(priv: bigint): Promise<Keypair>;
    static fromMnemonic(m: string, account?: number): Promise<Keypair>;
  }
  export class Note {
    amount: bigint;
    pubKey: bigint;
    blinding: bigint;
    constructor(args: { amount: bigint; pubKey: bigint; blinding?: bigint });
    commitment(): Promise<bigint>;
  }
  export class MerkleTree {
    levels: number;
    leaves: bigint[];
    zeros: bigint[];
    constructor(levels?: number);
    init(): Promise<MerkleTree>;
    root(): Promise<bigint>;
    path(index: number): Promise<{ pathElements: bigint[]; pathIndices: bigint; root: bigint }>;
  }
  export class ShieldedWallet {
    notes: Array<{ note: Note; index: number; lane: number; spent: boolean }>;
    constructor(kp: Keypair, tree: MerkleTree, label?: string);
    spendable(): Array<{ note: Note; index: number; lane: number; spent: boolean }>;
    balance(): bigint;
    markSpent(indices: number[]): void;
  }
  export function syncFromIndexer(
    indexerUrl: string,
    tree: MerkleTree,
    wallets: ShieldedWallet[],
  ): Promise<{ scanned: number; tagMatched: number; decrypted: number }>;
  export function buildWitness(opts: any): Promise<any>;
  export function buildTransaction(opts: any): Promise<{
    proof: { a: string[]; b: string[][]; c: string[] };
    publicSignals: string[];
    proofHex: string;
    root: string;
    newRoot: string;
    associationRoot: string;
    inputNullifiers: string[];
    outputCommitments: string[];
    extData: any;
    [k: string]: any;
  }>;
  export function noteNullifier(commitment: bigint, pathIndices: bigint, privateKey: bigint): Promise<bigint>;
  export function toSolidityProof(proof: any): { a: string[]; b: string[][]; c: string[] };
  export class OcpClient {
    constructor(baseUrl: string);
  }
}
