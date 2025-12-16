import { OpusFrame, OpusStream } from "../types/opus";
import { findOggStart, parseOggPage } from "./oggParsing";

export const disassembleOgg = (data: Uint8Array): OpusStream => {
    const oggStart = findOggStart(data);
    if (oggStart === -1) {
        throw new Error('No Ogg data found');
    }

    const frames: OpusFrame[] = [];
    let offset = oggStart;
    let pageCount = 0;
    let serialNumber: number | undefined;
    let channels = 2;
    let preskip = 312;
    let sampleRate = 48000;
    let lastGranule = BigInt(0);

    while (offset < data.length) {
        const page = parseOggPage(data, offset);
        if (!page) break;

        if (pageCount === 0) {
            // Parse OpusHead for metadata
            serialNumber = page.serialNumber;
            const bodyOffset = 27 + page.segments;
            channels = data[offset + bodyOffset + 9];
            const view = new DataView(data.buffer, data.byteOffset + offset + bodyOffset);
            preskip = view.getUint16(10, true);
            sampleRate = view.getUint32(12, true);
        } else if (pageCount === 1) {
            // Skip OpusTags
        } else {
            // Data page - extract frame(s)
            const bodyOffset = 27 + page.segments;
            const bodyEnd = bodyOffset + page.bodySize;
            
            // Calculate samples for this page
            const currentGranule = page.granulePosition;
            const samples = Number(currentGranule - lastGranule);
            
            // For simplicity, treat entire page body as one frame
            // (In reality, pages can contain multiple frames with lacing)
            frames.push({
                data: data.slice(offset + bodyOffset, offset + bodyEnd),
                samples: samples,
            });
            
            lastGranule = currentGranule;
        }

        offset += page.pageSize;
        pageCount++;
    }

    return {
        frames,
        serialNumber,
        channels,
        preskip,
        sampleRate,
    };
};