/**
 * Read EBML variable-length integer (VINT)
 * First byte encodes both the length and part of the value
 */
const readVINT = (data, offset) => {
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
const readElementSize = (data, offset) => {
    const { value, size } = readVINT(data, offset);
    return { size, dataSize: value };
};
/**
 * Known Matroska/WebM element IDs
 */
const EBML_IDS = {
    EBML: 0x1A45DFA3,
    Segment: 0x18538067,
    Info: 0x1549A966,
    Tracks: 0x1654AE6B,
    Cluster: 0x1F43B675,
    Timecode: 0xE7,
    SimpleBlock: 0xA3,
    BlockGroup: 0xA0,
    Block: 0xA1,
    TrackEntry: 0xAE,
    TrackNumber: 0xD7,
    TrackType: 0x83,
    CodecID: 0x86,
};
/**
 * Parse a SimpleBlock or Block element
 */
const parseBlock = (data, clusterTimecode) => {
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
/**
 * Extract Opus frames from a WebM/Matroska file
 */
export const extractWebMFrames = (data) => {
    const frames = [];
    let offset = 0;
    let clusterTimecode = 0;
    // Find codec info first
    let opusTrackNumber = -1;
    while (offset < data.length) {
        if (offset + 8 > data.length)
            break;
        // Read element ID
        const { value: elementId, size: idSize } = readVINT(data, offset);
        offset += idSize;
        // Read element size
        const { size: sizeBytes, dataSize } = readElementSize(data, offset);
        offset += sizeBytes;
        if (offset + dataSize > data.length)
            break;
        // Handle different element types
        switch (elementId) {
            case EBML_IDS.TrackEntry: {
                // Parse track to find Opus codec
                let trackOffset = offset;
                let trackNum = -1;
                let codecId = '';
                while (trackOffset < offset + dataSize) {
                    const { value: subId, size: subIdSize } = readVINT(data, trackOffset);
                    trackOffset += subIdSize;
                    const { size: subSizeBytes, dataSize: subDataSize } = readElementSize(data, trackOffset);
                    trackOffset += subSizeBytes;
                    if (subId === EBML_IDS.TrackNumber) {
                        trackNum = data[trackOffset]; // Usually just 1 byte
                    }
                    else if (subId === EBML_IDS.CodecID) {
                        codecId = new TextDecoder().decode(data.slice(trackOffset, trackOffset + subDataSize));
                    }
                    trackOffset += subDataSize;
                }
                if (codecId === 'A_OPUS' && trackNum !== -1) {
                    opusTrackNumber = trackNum;
                }
                break;
            }
            case EBML_IDS.Cluster: {
                // Parse cluster to extract blocks
                let clusterOffset = offset;
                clusterTimecode = 0;
                while (clusterOffset < offset + dataSize) {
                    const { value: subId, size: subIdSize } = readVINT(data, clusterOffset);
                    clusterOffset += subIdSize;
                    const { size: subSizeBytes, dataSize: subDataSize } = readElementSize(data, clusterOffset);
                    clusterOffset += subSizeBytes;
                    if (subId === EBML_IDS.Timecode) {
                        // Cluster timecode (unsigned integer)
                        clusterTimecode = 0;
                        for (let i = 0; i < subDataSize; i++) {
                            clusterTimecode = (clusterTimecode << 8) | data[clusterOffset + i];
                        }
                    }
                    else if (subId === EBML_IDS.SimpleBlock) {
                        const blockData = data.slice(clusterOffset, clusterOffset + subDataSize);
                        const frame = parseBlock(blockData, clusterTimecode);
                        // Only include frames from Opus track
                        if (opusTrackNumber === -1 || frame.trackNumber === opusTrackNumber) {
                            frames.push(frame);
                        }
                    }
                    else if (subId === EBML_IDS.BlockGroup) {
                        // BlockGroup contains Block element
                        let bgOffset = clusterOffset;
                        while (bgOffset < clusterOffset + subDataSize) {
                            const { value: bgId, size: bgIdSize } = readVINT(data, bgOffset);
                            bgOffset += bgIdSize;
                            const { size: bgSizeBytes, dataSize: bgDataSize } = readElementSize(data, bgOffset);
                            bgOffset += bgSizeBytes;
                            if (bgId === EBML_IDS.Block) {
                                const blockData = data.slice(bgOffset, bgOffset + bgDataSize);
                                const frame = parseBlock(blockData, clusterTimecode);
                                if (opusTrackNumber === -1 || frame.trackNumber === opusTrackNumber) {
                                    frames.push(frame);
                                }
                            }
                            bgOffset += bgDataSize;
                        }
                    }
                    clusterOffset += subDataSize;
                }
                break;
            }
        }
        offset += dataSize;
    }
    return frames;
};
/**
 * Convert WebM Opus frames to raw Opus packets suitable for Ogg encapsulation
 */
export const webmFramesToOpusPackets = (frames) => {
    // WebM stores raw Opus packets, so we can use them directly
    // Just need to sort by timestamp and extract the data
    return frames
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(frame => frame.data);
};
