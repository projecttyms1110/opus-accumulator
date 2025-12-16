import { disassembleOgg } from "../ogg/oggDisassemble";
import { disassembleWebM } from "../webm/webmDisassemble";
import { AudioFormat } from "./audioTypes";
import { detectFormat } from "./formatDetection";
/**
 * Format-agnostic disassembly: detects format and extracts Opus frames
 */
export const disassembleOpusFile = (data) => {
    const format = detectFormat(data);
    switch (format) {
        case AudioFormat.OGG_OPUS:
            return disassembleOgg(data);
        case AudioFormat.WEBM:
            return disassembleWebM(data);
        case AudioFormat.UNKNOWN:
            throw new Error('Unknown audio format (not Ogg Opus or WebM)');
    }
};
