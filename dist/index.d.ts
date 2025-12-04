export declare const setDebug: (enabled: boolean) => void;
export declare const setCustomDebugLogger: (logger: (...args: any[]) => void) => void;
/**
 * Concatenate multiple Opus-in-Ogg files into a single logical bitstream.
 * Adjusts page headers, granule positions, and replaces OpusTags.
 */
export declare const concatenateOpusFiles: (chunks: Uint8Array[]) => Promise<Uint8Array>;
interface AppendMeta {
    serialNumber: number;
    lastPageSequence: number;
    cumulativeGranule: bigint;
    totalSize: number;
}
/**
 * Parse and prepare an existing Opus file for appending
 * Returns the prepared file (with EOS cleared, OpusTags replaced) and metadata
 * required for concatenation of more files within the same logical bitstream.
 */
export declare const prepareForConcat: (chunk: Uint8Array) => {
    prepared: Uint8Array;
    meta: AppendMeta;
};
export {};
