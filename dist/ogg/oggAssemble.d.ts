import { OpusStream } from "../types/opus";
/**
 * Assemble frames into appendable Ogg Opus file
 * @param stream
 * @param options
 * @returns
 */
export declare const assembleOgg: (stream: OpusStream, options?: {
    serialNumber?: number;
    startingSequence?: number;
    startingGranule?: bigint;
    includeHeaders?: boolean;
}) => Uint8Array;
