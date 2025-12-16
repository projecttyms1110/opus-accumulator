type WebMFrame = {
    data: Uint8Array;
    timestamp: number;
    trackNumber: number;
};
/**
 * Extract Opus frames from a WebM/Matroska file
 */
export declare const extractWebMFrames: (data: Uint8Array) => WebMFrame[];
/**
 * Convert WebM Opus frames to raw Opus packets suitable for Ogg encapsulation
 */
export declare const webmFramesToOpusPackets: (frames: WebMFrame[]) => Uint8Array[];
export {};
