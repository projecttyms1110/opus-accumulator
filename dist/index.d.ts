export declare const setDebug: (enabled: boolean) => void;
export declare const setCustomDebugLogger: (logger: (...args: any[]) => void) => void;
/**
 * Concatenate multiple Opus-in-Ogg or Opus-in-WebM files into a single logical bitstream.
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
 * Parse and prepare an existing Opus file (Ogg or WebM container) for appending
 * Returns the prepared file (with EOS cleared, OpusTags replaced) and metadata
 * required for concatenation of more files within the same logical bitstream.
 */
export declare const prepareForConcat: (data: Uint8Array) => {
    prepared: Uint8Array;
    meta: AppendMeta;
};
/**
 *  Append new chunks to an existing accumulator
 * @param acc File to append to
 * @param chunks additional chunks to append, `.opus` (opus-in-ogg) files
 * @param accMeta Metadata about the current accumulator state
 * @returns Updated accumulator (concatenated Opus file ready for further appending) and metadata for next append
 */
export declare const addToAcc: (acc: Uint8Array, chunks: Uint8Array[], accMeta: AppendMeta) => {
    result: Uint8Array;
    meta: AppendMeta;
};
export {};
