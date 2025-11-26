declare namespace __AdaptedExports {
  /** Exported memory */
  export const memory: WebAssembly.Memory;
  // Exported runtime interface
  export function __new(size: number, id: number): number;
  export function __pin(ptr: number): number;
  export function __unpin(ptr: number): void;
  export function __collect(): void;
  export const __rtti_base: number;
  /**
   * assembly/index/concatenateOpusFiles
   * @param files `~lib/array/Array<~lib/typedarray/Uint8Array>`
   * @returns `~lib/typedarray/Uint8Array`
   */
  export function concatenateOpusFiles(files: Array<Uint8Array>): Uint8Array;
}
/** Instantiates the compiled WebAssembly module with the given imports. */
export declare function instantiate(module: WebAssembly.Module, imports: {
  env: unknown,
}): Promise<typeof __AdaptedExports>;
