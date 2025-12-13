interface OggPage {
    version: number;
    headerType: number;
    granulePosition: bigint;
    serialNumber: number;
    pageSequence: number;
    checksum: number;
    segments: number;
    bodySize: number;
    pageSize: number;
    offset: number;
}

let isDebug = false;
let customLogger: ((...args: any[]) => void) | null = null;

export const setDebug = (enabled: boolean) => {
    isDebug = enabled;
};

export const setCustomDebugLogger = (logger: (...args: any[]) => void) => {
    customLogger = logger;
};

const debugLog = (...args: any[]) => {
    if (!isDebug) return;
    if (customLogger) {
        customLogger(...args);
    } else {
        console.debug(...args);
    }
};

// CRC32 lookup table
const makeCRCTable = (): Uint32Array => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i << 24;
        for (let j = 0; j < 8; j++) {
            c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
        }
        table[i] = c >>> 0;
    }
    return table;
};

const crcTable: Uint32Array = makeCRCTable();

const calculateCRC = (data: Uint8Array): number => {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
        crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
    }
    return crc;
};

const parseOggPage = (data: Uint8Array, offset: number): OggPage | null => {
    if (offset + 27 > data.length) return null;

    // Check for "OggS" magic
    if (
        data[offset] !== 0x4f ||
        data[offset + 1] !== 0x67 ||
        data[offset + 2] !== 0x67 ||
        data[offset + 3] !== 0x53
    ) {
        return null;
    }

    const view = new DataView(data.buffer, data.byteOffset + offset);

    const version = data[offset + 4];
    const headerType = data[offset + 5];
    const granulePosition = view.getBigInt64(6, true);
    const serialNumber = view.getUint32(14, true);
    const pageSequence = view.getUint32(18, true);
    const checksum = view.getUint32(22, true);
    const segments = data[offset + 26];

    let bodySize = 0;
    for (let i = 0; i < segments; i++) {
        bodySize += data[offset + 27 + i];
    }

    const pageSize = 27 + segments + bodySize;

    return {
        version,
        headerType,
        granulePosition,
        serialNumber,
        pageSequence,
        checksum,
        segments,
        bodySize,
        pageSize,
        offset,
    };
};

const updatePage = (
    data: Uint8Array,
    offset: number,
    newSerial: number,
    newSequence: number,
    newGranule: bigint | null,
): Uint8Array | null => {
    const page = parseOggPage(data, offset);
    if (!page) return null;

    const pageData = new Uint8Array(page.pageSize);
    pageData.set(data.slice(offset, offset + page.pageSize));

    const view = new DataView(pageData.buffer);

    // Update serial number
    view.setUint32(14, newSerial, true);

    // Update page sequence
    view.setUint32(18, newSequence, true);

    // Update granule position if not -1
    if (newGranule !== null) {
        view.setBigInt64(6, newGranule, true);
    }

    // Always clear EOS flag (bit 2 of headerType) for append-only compatibility
    if (pageData[5] & 0x04) {
        pageData[5] = pageData[5] & ~0x04;
    }

    // Zero out checksum
    view.setUint32(22, 0, true);

    // Calculate new checksum
    const crc = calculateCRC(pageData);
    view.setUint32(22, crc, true);

    // Log the updated page details
    debugLog(
        `Page updated to: seq=${page.pageSequence}, granule=${page.granulePosition}, size=${page.pageSize}, headerType=${page.headerType}`,
    );

    return pageData;
};

/**
 * Create a minimal OpusTags page with length/duration info omitted
 * @param serialNumber stream serial number
 * @param pageSequence page sequence number
 * @returns Uint8Array representing the OpusTags page
 */
const createMinimalOpusTagsPage = (
    serialNumber: number,
    pageSequence: number,
): Uint8Array => {
    const vendorString = "ogg-opus-concat";
    const vendorLength = vendorString.length;

    // OpusTags structure:
    // - "OpusTags" magic signature (8 bytes)
    // - vendor string length (4 bytes, little-endian)
    // - vendor string
    // - user comment list length (4 bytes, little-endian) = 0
    const bodySize = 8 + 4 + vendorLength + 4;
    const body = new Uint8Array(bodySize);
    let offset = 0;

    // Magic signature
    body.set(new TextEncoder().encode("OpusTags"), offset);
    offset += 8;

    // Vendor string length (little-endian)
    body[offset++] = vendorLength & 0xff;
    body[offset++] = (vendorLength >> 8) & 0xff;
    body[offset++] = (vendorLength >> 16) & 0xff;
    body[offset++] = (vendorLength >> 24) & 0xff;

    // Vendor string
    body.set(new TextEncoder().encode(vendorString), offset);
    offset += vendorLength;

    // User comment list length = 0
    body[offset++] = 0;
    body[offset++] = 0;
    body[offset++] = 0;
    body[offset++] = 0;

    // Create Ogg page with proper segment table
    const segments = Math.ceil(bodySize / 255);
    const segmentTable = new Uint8Array(segments);
    for (let i = 0; i < segments - 1; i++) {
        segmentTable[i] = 255;
    }
    segmentTable[segments - 1] = bodySize % 255 || 255;

    const pageSize = 27 + segments + bodySize;
    const page = new Uint8Array(pageSize);
    const view = new DataView(page.buffer);

    // OggS magic
    page[0] = 0x4f;
    page[1] = 0x67;
    page[2] = 0x67;
    page[3] = 0x53;

    // Version
    page[4] = 0;

    // Header type (continuation of logical bitstream)
    page[5] = 0x00;

    // Granule position (0 for header)
    view.setBigInt64(6, BigInt(0), true);

    // Serial number
    view.setUint32(14, serialNumber, true);

    // Page sequence
    view.setUint32(18, pageSequence, true);

    // Checksum (will be calculated below)
    view.setUint32(22, 0, true);

    // Segments
    page[26] = segments;

    // Segment table
    page.set(segmentTable, 27);

    // Body
    page.set(body, 27 + segments);

    // Calculate and set checksum
    const crc = calculateCRC(page);
    view.setUint32(22, crc, true);

    return page;
};

/**
 * Scan for first "OggS" magic bytes in data
 * @param data 
 * @returns position of first OggS or -1 if not found
 */
const findOggStart = (data: Uint8Array): number => {
    for (let i = 0; i <= data.length - 4; i++) {
        if (data[i] === 0x4f && data[i + 1] === 0x67 &&
            data[i + 2] === 0x67 && data[i + 3] === 0x53) {
            return i;
        }
    }
    return -1; // Not found
};

/**
 * Concatenate multiple Opus-in-Ogg files into a single logical bitstream.
 * Adjusts page headers, granule positions, and replaces OpusTags.
 */
export const concatenateOpusFiles = async (
    chunks: Uint8Array[],
): Promise<Uint8Array> => {
    if (chunks.length === 0) {
        throw new Error('No chunks provided');
            }

    // First chunk - prepare it
    const { prepared, meta } = prepareForConcat(chunks[0]);

    if (chunks.length === 1) {
        return prepared;
    }

    // Remaining chunks - add them
    const { result } = addToAcc(prepared, chunks.slice(1), meta);

    return result;
};

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
export const prepareForConcat = (
    chunk: Uint8Array
): { prepared: Uint8Array; meta: AppendMeta } => {
    const oggStart = findOggStart(chunk);
    if (oggStart === -1) {
        throw new Error('No Ogg data found in file');
    }

    const pages: Uint8Array[] = [];
    let offset = oggStart;
    let pageCount = 0;
    let serialNumber: number = -Infinity;
    let newPageSequence = 0; // Track our new sequential numbering
    let maxGranule = BigInt(0);

    while (offset < chunk.length) {
        const page = parseOggPage(chunk, offset);
        if (!page) break;

        if (serialNumber === -Infinity) {
            serialNumber = page.serialNumber;
        }

        // Handle first two pages specially
        if (pageCount === 0) {
            // Keep OpusHead as-is (but ensure sequence is 0)
            const pageData = new Uint8Array(page.pageSize);
            pageData.set(chunk.slice(offset, offset + page.pageSize));
            const view = new DataView(pageData.buffer);
            view.setUint32(18, newPageSequence, true);
            view.setUint32(22, 0, true);
            const crc = calculateCRC(pageData);
            view.setUint32(22, crc, true);
            pages.push(pageData);
            newPageSequence++;
        } else if (pageCount === 1) {
            // Replace OpusTags with minimal version
            const minimalTags = createMinimalOpusTagsPage(serialNumber, newPageSequence);
            pages.push(minimalTags);
            newPageSequence++;
        } else {
            // For data pages: clear EOS flag and renumber sequence
            const pageData = new Uint8Array(page.pageSize);
            pageData.set(chunk.slice(offset, offset + page.pageSize));
            const view = new DataView(pageData.buffer);

            // Update page sequence
            view.setUint32(18, newPageSequence, true);

            // Clear EOS flag if present
            if (pageData[5] & 0x04) {
                pageData[5] = pageData[5] & ~0x04;
            }

            // Recalculate CRC
            view.setUint32(22, 0, true);
            const crc = calculateCRC(pageData);
            view.setUint32(22, crc, true);

            pages.push(pageData);
            newPageSequence++;
        }

        if (page.granulePosition >= BigInt(0) && page.granulePosition > maxGranule) {
            maxGranule = page.granulePosition;
        }

        offset += page.pageSize;
        pageCount++;
    }

    // Combine all pages
    const totalSize = pages.reduce((sum, page) => sum + page.length, 0);
    const prepared = new Uint8Array(totalSize);
    let resultOffset = 0;
    for (const page of pages) {
        prepared.set(page, resultOffset);
        resultOffset += page.length;
    }

    return {
        prepared,
        meta: {
            serialNumber,
            lastPageSequence: newPageSequence - 1,
            cumulativeGranule: maxGranule,
            totalSize: prepared.length
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
    const pages: Uint8Array[] = [];
    let globalPageSequence = accMeta.lastPageSequence + 1;
    let cumulativeGranule = accMeta.cumulativeGranule;

    for (const chunk of chunks) {
        const oggStart = findOggStart(chunk);
        if (oggStart === -1) {
            debugLog('ERROR: No Ogg data found in chunk');
            continue;
        }

        let offset = oggStart;
        let pageCount = 0;
        let maxGranuleInChunk = BigInt(0);

        while (offset < chunk.length) {
            const page = parseOggPage(chunk, offset);
            if (!page) break;

            // Skip header pages (OpusHead and OpusTags)
            if (pageCount < 2) {
                pageCount++;
                offset += page.pageSize;
                continue;
            }

            if (page.granulePosition >= BigInt(0) && page.granulePosition > maxGranuleInChunk) {
                maxGranuleInChunk = page.granulePosition;
            }

            // Adjust granule position
            let newGranule: bigint | null = null;
            if (page.granulePosition >= BigInt(0)) {
                newGranule = page.granulePosition + cumulativeGranule;
            }

            const newPage = updatePage(
                chunk,
                offset,
                accMeta.serialNumber,
                globalPageSequence,
                newGranule
            );

            if (newPage) {
                pages.push(newPage);
                globalPageSequence++;
            }

            offset += page.pageSize;
            pageCount++;
        }

        cumulativeGranule += maxGranuleInChunk;
    }

    // Combine accumulator + new pages
    const newPagesSize = pages.reduce((sum, page) => sum + page.length, 0);
    const result = new Uint8Array(acc.length + newPagesSize);
    result.set(acc, 0);

    let resultOffset = acc.length;
    for (const page of pages) {
        result.set(page, resultOffset);
        resultOffset += page.length;
    }

    return {
        result,
        meta: {
            serialNumber: accMeta.serialNumber,
            lastPageSequence: globalPageSequence - 1,
            cumulativeGranule,
            totalSize: result.length
        }
    };
};