// Fully working, zero-dependency Opus-in-Ogg concatenator for WebAssembly

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
export class OggPage {
    version: u8 = 0;
    headerType: u8 = 0;
    granulePosition: i64 = 0;
    serialNumber: u32 = 0;
    pageSequence: u32 = 0;
    checksum: u32 = 0;
    segments: u8 = 0;
    bodySize: i32 = 0;
    pageSize: i32 = 0;
    offset: i32 = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CRC32 table (precomputed once)
// ─────────────────────────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let i: u32 = 0; i < 256; i++) {
    let c: u32 = i << 24;
    for (let j: u8 = 0; j < 8; j++) {
        c = (c & 0x80000000) ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
    }
    crcTable[i] = c;
}

function calculateCRC(data: Uint8Array): u32 {
    let crc: u32 = 0;
    for (let i = 0; i < data.length; i++) {
        const idx = ((crc >>> 24) ^ data[i]) & 0xff;
        crc = ((crc << 8) ^ crcTable[idx]) >>> 0;
    }
    return crc;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ogg page parsing
// ─────────────────────────────────────────────────────────────────────────────
function parseOggPage(data: Uint8Array, offset: i32): OggPage | null {
    if (offset + 27 > data.length) return null;

    // OggS magic
    if (
        data[offset] !== 0x4f || // 'O'
        data[offset + 1] !== 0x67 || // 'g'
        data[offset + 2] !== 0x67 || // 'g'
        data[offset + 3] !== 0x53    // 'S'
    ) return null;

    const base = changetype<usize>(data.buffer) + data.byteOffset + offset;

    const page = new OggPage();
    page.version = data[offset + 4];
    page.headerType = data[offset + 5];
    page.granulePosition = load<i64>(base + 6, true);
    page.serialNumber = load<u32>(base + 14, true);
    page.pageSequence = load<u32>(base + 18, true);
    page.checksum = load<u32>(base + 22, true);
    page.segments = data[offset + 26];
    page.offset = offset;

    let bodySize: i32 = 0;
    const segTableOffset = offset + 27;
    for (let i: i32 = 0; i < <i32>page.segments; i++) {
        bodySize += data[segTableOffset + i];
    }
    page.bodySize = bodySize;
    page.pageSize = 27 + page.segments + bodySize;

    return page;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Update page (serial, sequence, granule, checksum, clear EOS)
// ─────────────────────────────────────────────────────────────────────────────
function updatePage(
    data: Uint8Array,
    offset: i32,
    newSerial: u32,
    newSequence: u32,
    newGranule: i64   // -1 means "don't touch"
): Uint8Array | null {
    const page = parseOggPage(data, offset);
    if (!page) return null;

    const pageData = new Uint8Array(page.pageSize);
    pageData.set(data.subarray(offset, offset + page.pageSize));

    const ptr = changetype<usize>(pageData.buffer) + pageData.byteOffset;

    store<u32>(ptr + 14, newSerial, true);           // serial number
    store<u32>(ptr + 18, newSequence, true);         // page sequence

    if (newGranule !== -1) {
        store<i64>(ptr + 6, newGranule, true);         // granule position
    }

    // Clear EOS flag (bit 2) — important for concatenation
    const headerType = load<u8>(ptr + 5);
    if (headerType & 0x04) {
        store<u8>(ptr + 5, headerType & ~0x04);
    }

    // Zero checksum, recalculate
    store<u32>(ptr + 22, 0, true);
    const crc = calculateCRC(pageData);
    store<u32>(ptr + 22, crc, true);

    return pageData;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main function — concatenate multiple Opus-in-Ogg files
// ─────────────────────────────────────────────────────────────────────────────
export function concatenateOpusFiles(files: Array<Uint8Array>): Uint8Array {
    const pages = new Array<Uint8Array>();
    let globalPageSequence: u32 = 0;
    let cumulativeGranule: i64 = 0;
    let serialNumber: u32 = 0;  // will be set from first file

    let firstFile = true;

    for (let f = 0; f < files.length; f++) {
        const data = files[f];
        let offset: i32 = 0;
        let pageIndexInFile: i32 = 0;
        let maxGranuleInFile: i64 = 0;
        let serialSet = false;

        while (offset < data.length) {
            const page = parseOggPage(data, offset);
            if (!page) break;

            // Track max granule in this file
            if (page.granulePosition > maxGranuleInFile) {
                maxGranuleInFile = page.granulePosition;
            }

            if (firstFile) {
                // First file: keep OpusHead (page 0), skip OpusTags (page 1), use its serial
                if (!serialSet) {
                    serialNumber = page.serialNumber;
                    serialSet = true;
                }

                if (pageIndexInFile === 1) {
                    // Skip OpusTags
                    offset += page.pageSize;
                    pageIndexInFile++;
                    continue;
                }

                const updated = updatePage(data, offset, serialNumber, globalPageSequence, -1);
                if (updated) pages.push(updated);
                globalPageSequence++;
            } else {
                // Subsequent files: skip first two pages (OpusHead + OpusTags)
                if (pageIndexInFile < 2) {
                    offset += page.pageSize;
                    pageIndexInFile++;
                    continue;
                }

                let newGranule: i64 = -1;
                if (page.granulePosition >= 0) {
                    newGranule = page.granulePosition + cumulativeGranule;
                }

                const updated = updatePage(data, offset, serialNumber, globalPageSequence, newGranule);
                if (updated) pages.push(updated);
                globalPageSequence++;
            }

            offset += page.pageSize;
            pageIndexInFile++;
        }

        if (firstFile) firstFile = false;
        cumulativeGranule += maxGranuleInFile;
    }

    // Concatenate all pages
    let totalSize: i32 = 0;
    for (let i = 0; i < pages.length; i++) {
        totalSize += pages[i].length;
    }

    const result = new Uint8Array(totalSize);
    let pos: i32 = 0;
    for (let i = 0; i < pages.length; i++) {
        result.set(pages[i], pos);
        pos += pages[i].length;
    }

    return result;
}