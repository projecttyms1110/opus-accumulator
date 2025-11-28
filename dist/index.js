const isDebug = false;
const debugLog = (...args) => isDebug && console.debug(...args);
// CRC32 lookup table
const makeCRCTable = () => {
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
const crcTable = makeCRCTable();
const calculateCRC = (data) => {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
        crc = ((crc << 8) ^ crcTable[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
    }
    return crc;
};
const parseOggPage = (data, offset) => {
    if (offset + 27 > data.length)
        return null;
    // Check for "OggS" magic
    if (data[offset] !== 0x4f ||
        data[offset + 1] !== 0x67 ||
        data[offset + 2] !== 0x67 ||
        data[offset + 3] !== 0x53) {
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
const updatePage = (data, offset, newSerial, newSequence, newGranule) => {
    const page = parseOggPage(data, offset);
    if (!page)
        return null;
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
    return pageData;
};
const createMinimalOpusTagsPage = (serialNumber, pageSequence) => {
    const vendorString = "opus-concat";
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
    // Create Ogg page
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
const findOggStart = (data) => {
    // Scan for first "OggS" magic bytes
    for (let i = 0; i <= data.length - 4; i++) {
        if (data[i] === 0x4f && data[i + 1] === 0x67 &&
            data[i + 2] === 0x67 && data[i + 3] === 0x53) {
            return i;
        }
    }
    return -1; // Not found
};
export const concatenateOpusFiles = async (chunks) => {
    const pages = [];
    let globalPageSequence = 0;
    let cumulativeGranule = BigInt(0);
    let serialNumber = -Infinity;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        // Find where Ogg data actually starts (skip any metadata/junk at the beginning)
        const oggStart = findOggStart(chunk);
        if (oggStart === -1) {
            debugLog(`ERROR: No Ogg data found in file!`);
            continue;
        }
        if (oggStart > 0) {
            debugLog(`Skipping ${oggStart} bytes of non-Ogg data at start`);
        }
        let offset = oggStart;
        let pageCount = 0;
        let maxGranuleInFile = BigInt(0);
        while (offset < chunk.length) {
            const page = parseOggPage(chunk, offset);
            if (!page) {
                debugLog(`Failed to parse page at offset ${offset}`);
                break;
            }
            debugLog(`Page ${pageCount}: seq=${page.pageSequence}, granule=${page.granulePosition}, size=${page.pageSize}, headerType=${page.headerType}`);
            // Track the maximum granule position in this file
            if (page.granulePosition >= BigInt(0) &&
                page.granulePosition > maxGranuleInFile) {
                maxGranuleInFile = page.granulePosition;
            }
            // First file: keep OpusHead (page 0), skip original OpusTags, add our own
            if (chunkIndex === 0) {
                // Capture serial number from first file's first page
                if (serialNumber === -Infinity) {
                    serialNumber = page.serialNumber;
                    debugLog(`Using serial number: ${serialNumber}`);
                }
                // Keep OpusHead page
                if (pageCount === 0) {
                    const newPage = updatePage(chunk, offset, serialNumber, globalPageSequence, null);
                    if (newPage) {
                        pages.push(newPage);
                        debugLog(`  -> Added OpusHead as global page ${globalPageSequence}`);
                        globalPageSequence++;
                        // Add minimal OpusTags page right after OpusHead
                        const opusTagsPage = createMinimalOpusTagsPage(serialNumber, globalPageSequence);
                        pages.push(opusTagsPage);
                        debugLog(`  -> Added minimal OpusTags as global page ${globalPageSequence}`);
                        globalPageSequence++;
                    }
                    pageCount++;
                    offset += page.pageSize;
                    continue;
                }
                // Skip original OpusTags page
                if (pageCount === 1) {
                    debugLog(`  -> Skipping original OpusTags page`);
                    pageCount++;
                    offset += page.pageSize;
                    continue;
                }
                // Add remaining pages from first file
                const newPage = updatePage(chunk, offset, serialNumber, globalPageSequence, null);
                if (newPage) {
                    pages.push(newPage);
                    if (page.headerType & 0x04) {
                        debugLog(`  -> Added as global page ${globalPageSequence} (EOS flag cleared)`);
                    }
                    else {
                        debugLog(`  -> Added as global page ${globalPageSequence}`);
                    }
                    globalPageSequence++;
                }
            }
            else {
                // Skip first two pages (headers) from subsequent files
                if (pageCount < 2) {
                    debugLog(`  -> Skipping header page`);
                    pageCount++;
                    offset += page.pageSize;
                    continue;
                }
                // Adjust granule position
                let newGranule = null;
                if (page.granulePosition >= BigInt(0)) {
                    newGranule = page.granulePosition + cumulativeGranule;
                    debugLog(`  -> Adjusted granule: ${page.granulePosition} + ${cumulativeGranule} = ${newGranule}`);
                }
                const newPage = updatePage(chunk, offset, serialNumber, globalPageSequence, newGranule);
                if (newPage) {
                    pages.push(newPage);
                    if (page.headerType & 0x04) {
                        debugLog(`  -> Added as global page ${globalPageSequence} (EOS flag cleared)`);
                    }
                    else {
                        debugLog(`  -> Added as global page ${globalPageSequence}`);
                    }
                    globalPageSequence++;
                }
            }
            offset += page.pageSize;
            pageCount++;
        }
        debugLog(`Max granule in file: ${maxGranuleInFile}`);
        cumulativeGranule += maxGranuleInFile;
        debugLog(`Cumulative granule after file: ${cumulativeGranule}`);
    }
    // Combine all pages
    const totalSize = pages.reduce((sum, page) => sum + page.length, 0);
    debugLog(`\n=== Final output: ${pages.length} pages, ${totalSize} bytes ===`);
    const result = new Uint8Array(totalSize);
    let resultOffset = 0;
    for (const page of pages) {
        result.set(page, resultOffset);
        resultOffset += page.length;
    }
    return result;
};
