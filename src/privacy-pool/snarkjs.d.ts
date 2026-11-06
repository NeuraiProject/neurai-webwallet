declare module "snarkjs" {
  export const wtns: {
    calculate(input: Record<string, unknown>, wasmUrl: string | Uint8Array, output: { type: "mem" }): Promise<void>;
  };
  export const groth16: {
    prove(zkeySource: string | Uint8Array | { type: "bigMem"; data: Uint8Array[] }, witness: { type: "mem" }, logger?: unknown, options?: { singleThread: boolean }): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vk: unknown, publicSignals: string[], proof: unknown): Promise<boolean>;
  };
}
