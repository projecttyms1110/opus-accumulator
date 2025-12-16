import { WebMFrame } from "./webM";

/**
 * Read EBML variable-length integer (VINT)
 * First byte encodes both the length and part of the value
 */
export const readVINT = (data: Uint8Array, offset: number): { value: number, size: number } => {
    const firstByte = data[offset];

    // Find the length by counting leading zero bits
    let mask = 0x80;
    let size = 1;
    while (size <= 8 && !(firstByte & mask)) {
        mask >>= 1;
        size++;
    }

    if (size > 8) {
        throw new Error('Invalid VINT');
    }

    // Read the value (removing the length marker bit)
    let value = firstByte & (mask - 1);
    for (let i = 1; i < size; i++) {
        value = (value << 8) | data[offset + i];
    }

    return { value, size };
};

/**
 * Read EBML element size
 */
export const readElementSize = (data: Uint8Array, offset: number): { size: number; dataSize: number } => {
    const { value, size } = readVINT(data, offset);
    return { size, dataSize: value };
};

/**
 * Parse a SimpleBlock or Block element
 */
export const parseBlock = (data: Uint8Array, clusterTimecode: number): WebMFrame => {
    let offset = 0;

    // Read track number (VINT)
    const { value: trackNumber, size: trackSize } = readVINT(data, offset);
    offset += trackSize;

    // Read timecode (signed 16-bit integer, relative to cluster)
    const timecodeRelative = (data[offset] << 8) | data[offset + 1];
    const timecode = clusterTimecode + (timecodeRelative << 16 >> 16); // sign extend
    offset += 2;

    // Read flags (1 byte) - we can ignore for simple extraction
    const flags = data[offset];
    offset += 1;

    // Rest is the frame data
    const frameData = data.slice(offset);

    return {
        data: frameData,
        timestamp: timecode,
        trackNumber,
    };
};
