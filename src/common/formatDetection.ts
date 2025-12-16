import { findOggStart } from "../ogg/oggParsing";
import { readVINT } from "../webm/webmParse";
import { AudioFormat } from "./audioTypes";

export const detectFormat = (data: Uint8Array): AudioFormat => {
    // Check for Ogg
    const oggStart = findOggStart(data);
    if (oggStart !== -1) {
        return AudioFormat.OGG_OPUS;
    }
    
    // Check for WebM/Matroska EBML header
    if (data.length >= 4) {
        const { value: id } = readVINT(data, 0);
        if (id === 0x1A45DFA3) { // EBML
            return AudioFormat.WEBM;
        }
    }
    
    return AudioFormat.UNKNOWN;
};