import { OpusStream } from "../types/opus";
/**
 * Format-agnostic disassembly: detects format and extracts Opus frames
 */
export declare const disassembleOpusFile: (data: Uint8Array) => OpusStream;
