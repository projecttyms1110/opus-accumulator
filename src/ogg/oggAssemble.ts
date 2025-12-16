import { OpusStream } from "../types/opus";
import { createMinimalOpusTagsPage, createOggPage, createOpusHeadPage } from "./oggWrite";

/**
 * Assemble frames into appendable Ogg Opus file
 * @param stream 
 * @param options 
 * @returns 
 */
export const assembleOgg = (stream: OpusStream, options?: {
    serialNumber?: number;
    startingSequence?: number;
    startingGranule?: bigint;
    includeHeaders?: boolean;
}): Uint8Array => {
    const serialNumber = options?.serialNumber ?? stream.serialNumber ?? Math.floor(Math.random() * 0xFFFFFFFF);
    const includeHeaders = options?.includeHeaders ?? true;
    let pageSequence = options?.startingSequence ?? 0;
    let granule = options?.startingGranule ?? BigInt(0);
    
    const pages: Uint8Array[] = [];
    
    // Add headers if requested
    if (includeHeaders) {
        pages.push(createOpusHeadPage(serialNumber, stream.channels, stream.preskip, stream.sampleRate));
        pageSequence++;
        
        pages.push(createMinimalOpusTagsPage(serialNumber, pageSequence));
        pageSequence++;
    }
    
    // Add data pages
    const MAX_PAGE_SIZE = 4000;
    let currentPageData: Uint8Array[] = [];
    let currentPageSize = 0;
    let currentPageSamples = 0;
    
    for (const frame of stream.frames) {
        // Flush page if needed
        if (currentPageSize + frame.data.length > MAX_PAGE_SIZE && currentPageData.length > 0) {
            const pageBody = new Uint8Array(currentPageSize);
            let offset = 0;
            for (const d of currentPageData) {
                pageBody.set(d, offset);
                offset += d.length;
            }
            
            granule += BigInt(currentPageSamples);
            
            const page = createOggPage({
                headerType: 0x00,
                granulePosition: granule,
                serialNumber,
                pageSequence,
                body: pageBody,
            });
            
            pages.push(page);
            pageSequence++;
            
            currentPageData = [];
            currentPageSize = 0;
            currentPageSamples = 0;
        }
        
        currentPageData.push(frame.data);
        currentPageSize += frame.data.length;
        currentPageSamples += frame.samples;
    }
    
    // Flush remaining
    if (currentPageData.length > 0) {
        const pageBody = new Uint8Array(currentPageSize);
        let offset = 0;
        for (const d of currentPageData) {
            pageBody.set(d, offset);
            offset += d.length;
        }
        
        granule += BigInt(currentPageSamples);
        
        const page = createOggPage({
            headerType: 0x00, // No EOS for append-ready files
            granulePosition: granule,
            serialNumber,
            pageSequence,
            body: pageBody,
        });
        
        pages.push(page);
    }
    
    // Combine pages
    const totalSize = pages.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalSize);
    let resultOffset = 0;
    for (const page of pages) {
        result.set(page, resultOffset);
        resultOffset += page.length;
    }
    
    return result;
};