import { OpusFrame, OpusStream } from "../types/opus";
import { WebMFrame } from "./webM";
import { EBML_IDS } from "./matroskaTypes";
import { parseBlock, readElementSize, readVINT } from "./webmParse";
import debug from "../common/debugger";

const { debugLog } = debug;

export const disassembleWebM = (data: Uint8Array): OpusStream => {
    debugLog('Extracting WebM frames');
    const webmFrames = extractWebMFrames(data);
    debugLog(`Extracted ${webmFrames.length} WebM frames`);

    // Extract codec info from WebM (simplified - assume defaults)
    const channels = 2;
    const preskip = 312;
    const sampleRate = 48000;
    const samplesPerFrame = 960; // 20ms at 48kHz

    const frames: OpusFrame[] = webmFrames.map(frame => ({
        data: frame.data,
        samples: samplesPerFrame, // WebM doesn't store this, assume 20ms frames
    }));

    debugLog(`Converted to ${frames.length} Opus frames`);
    debugLog(`Returning Opus stream with channels=${channels}, preskip=${preskip}, sampleRate=${sampleRate}`);
    return {
        frames,
        channels,
        preskip,
        sampleRate,
    };
};

/**
 * Extract Opus frames from a WebM/Matroska file
 */
export const extractWebMFrames = (data: Uint8Array): WebMFrame[] => {
    const frames: WebMFrame[] = [];
    let offset = 0;
    let clusterTimecode = 0;

    // Find codec info first
    let opusTrackNumber = -1;

    while (offset < data.length) {
        if (offset + 8 > data.length) break;

        // Read element ID
        const { value: elementId, size: idSize } = readVINT(data, offset);
        offset += idSize;

        // Read element size
        const { size: sizeBytes, dataSize } = readElementSize(data, offset);
        offset += sizeBytes;

        if (offset + dataSize > data.length) break;

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
                    } else if (subId === EBML_IDS.CodecID) {
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
                    } else if (subId === EBML_IDS.SimpleBlock) {
                        const blockData = data.slice(clusterOffset, clusterOffset + subDataSize);
                        const frame = parseBlock(blockData, clusterTimecode);

                        // Only include frames from Opus track
                        if (opusTrackNumber === -1 || frame.trackNumber === opusTrackNumber) {
                            frames.push(frame);
                        }
                    } else if (subId === EBML_IDS.BlockGroup) {
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