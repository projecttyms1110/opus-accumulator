import debug from "./common/debugger";
import { disassembleOpusFile } from "./common/disassemble";
import { assembleOgg } from "./ogg/oggAssemble";
import { findOggStart, parseOggPage } from "./ogg/oggParsing";

export const setDebug = (enabled: boolean) => {
    debug.isDebug = enabled;
};

export const setCustomDebugLogger = (logger: (...args: any[]) => void) => {
    debug.customLogger = logger;
};

const { debugLog } = debug;

/**
 * Concatenate multiple Opus-in-Ogg or Opus-in-WebM files into a single logical bitstream.
 * Adjusts page headers, granule positions, and replaces OpusTags.
 */
export const concatChunks = (
    chunks: Uint8Array[],
): Uint8Array => {
    if (chunks.length === 0) {
        throw new Error('No chunks provided');
    }

    debugLog(`\n=== Concatenating ${chunks.length} chunks ===`);

    // First chunk - prepare it (auto-detects Ogg or WebM)
    let { result, meta } = prepareAccumulator(chunks[0]);

    debugLog(`First chunk prepared: ${result.length} bytes, granule=${meta.cumulativeGranule}`);

    if (chunks.length === 1) {
        return result;
    }

    // Remaining chunks - add them (auto-detects each)
    ({ result } = appendToAccumulator(result, chunks.slice(1), meta));

    debugLog(`Final result: ${result.length} bytes\n`);

    return result;
};

export interface AccumulatorState {
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
export const prepareAccumulator = (
    data: Uint8Array
): { result: Uint8Array; meta: AccumulatorState } => {
    debugLog(`\n=== Preparing accumulator from ${data.length} byte file ===`);

    // Disassemble (auto-detects format)
    const stream = disassembleOpusFile(data);

    // Assemble into clean Ogg with headers
    const { data: result } = assembleOgg(stream, { includeHeaders: true });

    // Extract metadata from the prepared file
    const oggStart = findOggStart(result);
    let offset = oggStart;
    let lastPageSequence = 0;
    let maxGranule = BigInt(0);
    let serialNumber = stream.serialNumber ?? 0;

    while (offset < result.length) {
        const page = parseOggPage(result, offset);
        if (!page) break;

        if (serialNumber === 0) serialNumber = page.serialNumber;
        lastPageSequence = page.pageSequence;
        if (page.granulePosition > maxGranule) {
            maxGranule = page.granulePosition;
        }

        offset += page.pageSize;
    }

    debugLog(`Prepared accumulator: serial=${serialNumber}, lastSeq=${lastPageSequence}, granule=${maxGranule}, size=${result.length}`);

    return {
        result,
        meta: {
            serialNumber,
            lastPageSequence,
            cumulativeGranule: maxGranule,
            totalSize: result.length,
        }
    };
};

/**
 *  Append new chunks to an existing accumulator
 * @param acc File to append to
 * @param chunks additional chunks to append, `.opus` (opus-in-ogg) files
 * @param accMeta Metadata about the current accumulator state
 * @returns Updated accumulator (concatenated Opus file ready for further appending) and metadata for next append
 */
export const appendToAccumulator = (
    acc: Uint8Array,
    chunks: Uint8Array[],
    accMeta: AccumulatorState
): { result: Uint8Array; meta: AccumulatorState } => {
    debugLog(`\n=== Appending ${chunks.length} chunks to accumulator ===`);
    debugLog(`Starting state: seq=${accMeta.lastPageSequence}, granule=${accMeta.cumulativeGranule}, size=${accMeta.totalSize}`);

    const dataPages: Uint8Array[] = [];
    let pageSequence = accMeta.lastPageSequence + 1;
    let granule = accMeta.cumulativeGranule;

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        debugLog(`\n--- Processing chunk ${i + 1}/${chunks.length} (${chunk.length} bytes) ---`);

        // Disassemble chunk (auto-detects format)
        const stream = disassembleOpusFile(chunk);

        // Assemble into data pages only (no headers)
        const { data: chunkData, pageCount, finalGranule } = assembleOgg(stream, {
            serialNumber: accMeta.serialNumber,
            startingSequence: pageSequence,
            startingGranule: granule,
            includeHeaders: false,
        });

        dataPages.push(chunkData);

        // Update state
        granule = finalGranule;
        pageSequence += pageCount;
        debugLog(`Chunk assembled: ${pageCount} pages, granule advanced to ${finalGranule}`);
    }

    // Combine accumulator + new data
    const totalSize = acc.length + dataPages.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalSize);
    result.set(acc, 0);

    let offset = acc.length;
    for (const page of dataPages) {
        result.set(page, offset);
        offset += page.length;
    }

    debugLog(`\nFinal state: seq=${pageSequence - 1}, granule=${granule}, total size=${result.length}`);

    return {
        result,
        meta: {
            serialNumber: accMeta.serialNumber,
            lastPageSequence: pageSequence - 1,
            cumulativeGranule: granule,
            totalSize: result.length,
        }
    };
};