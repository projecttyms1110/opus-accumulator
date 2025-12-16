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

/**
 * Concatenate multiple Opus-in-Ogg or Opus-in-WebM files into a single logical bitstream.
 * Adjusts page headers, granule positions, and replaces OpusTags.
 */
export const concatenateOpusFiles = async (
    chunks: Uint8Array[],
): Promise<Uint8Array> => {
    if (chunks.length === 0) {
        throw new Error('No chunks provided');
    }

    // First chunk - prepare it (auto-detects Ogg or WebM)
    const { prepared, meta } = prepareForConcat(chunks[0]);

    if (chunks.length === 1) {
        return prepared;
    }

    // Remaining chunks - add them (auto-detects each)
    const { result } = addToAcc(prepared, chunks.slice(1), meta);

    return result;
};

export interface AppendMeta {
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
export const prepareForConcat = (
    data: Uint8Array
): { prepared: Uint8Array; meta: AppendMeta } => {
    // Disassemble (auto-detects format)
    const stream = disassembleOpusFile(data);
    
    // Assemble into clean Ogg with headers
    const { data: prepared } = assembleOgg(stream, { includeHeaders: true });
    
    // Extract metadata from the prepared file
    const oggStart = findOggStart(prepared);
    let offset = oggStart;
    let lastPageSequence = 0;
    let maxGranule = BigInt(0);
    let serialNumber = stream.serialNumber ?? 0;
    
    while (offset < prepared.length) {
        const page = parseOggPage(prepared, offset);
        if (!page) break;
        
        if (serialNumber === 0) serialNumber = page.serialNumber;
        lastPageSequence = page.pageSequence;
        if (page.granulePosition > maxGranule) {
            maxGranule = page.granulePosition;
        }
        
        offset += page.pageSize;
    }
    
    return {
        prepared,
        meta: {
            serialNumber,
            lastPageSequence,
            cumulativeGranule: maxGranule,
            totalSize: prepared.length,
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
export const addToAcc = (
    acc: Uint8Array,
    chunks: Uint8Array[],
    accMeta: AppendMeta
): { result: Uint8Array; meta: AppendMeta } => {
    const dataPages: Uint8Array[] = [];
    let pageSequence = accMeta.lastPageSequence + 1;
    let granule = accMeta.cumulativeGranule;
    
    for (const chunk of chunks) {
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