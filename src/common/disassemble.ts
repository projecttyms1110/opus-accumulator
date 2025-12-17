import { disassembleOgg } from "../ogg/oggDisassemble";
import { OpusStream } from "../types/opus";
import { disassembleWebM } from "../webm/webmDisassemble";
import { AudioFormat } from "./audioTypes";
import { detectFormat } from "./formatDetection";
import debug from "./debugger";

/**
 * Format-agnostic disassembly: detects format and extracts Opus frames
 */
export const disassembleOpusFile = (data: Uint8Array): OpusStream => {
    const format = detectFormat(data);
    
    debug.debugLog(`Detected format: ${AudioFormat[format]}`);
    
    switch (format) {
        case AudioFormat.OGG_OPUS:
            return disassembleOgg(data);
        case AudioFormat.WEBM:
            return disassembleWebM(data);
        case AudioFormat.UNKNOWN:
            throw new Error('Unknown audio format (not Ogg Opus or WebM)');
    }
};