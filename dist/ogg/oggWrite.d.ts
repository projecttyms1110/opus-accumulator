/**
 * Create a minimal OpusTags page with length/duration info omitted
 * @param serialNumber stream serial number
 * @param pageSequence page sequence number
 * @returns Uint8Array representing the OpusTags page
 */
export declare const createMinimalOpusTagsPage: (serialNumber: number, pageSequence: number) => Uint8Array;
/**
 * Create an OpusHead identification header page
 */
export declare const createOpusHeadPage: (serialNumber: number, channels?: number, preskip?: number, sampleRate?: number) => Uint8Array;
/**
 * Create an Ogg page from body data
 */
export declare const createOggPage: (options: {
    headerType: number;
    granulePosition: bigint;
    serialNumber: number;
    pageSequence: number;
    body: Uint8Array;
}) => Uint8Array;
/**
 * Wrap raw Opus packets into a complete Ogg Opus file
 */
export declare const wrapOpusPacketsInOgg: (packets: Uint8Array[], options?: {
    channels?: number;
    preskip?: number;
    sampleRate?: number;
    serialNumber?: number;
}) => Uint8Array;
