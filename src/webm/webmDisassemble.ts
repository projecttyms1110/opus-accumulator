import { OpusFrame, OpusStream } from "../types/opus";
import { EBML_IDS } from "./EBMLTypes";
import { decodeString, processSimpleBlock, readId, readVINT } from "./webmParse";
import debug from "../common/debugger";

const debugLog = (...args: any[]) => debug.debugLog('disassembler', ...args);

export const disassembleWebM = (data: Uint8Array): OpusStream => {
    debugLog('Extracting WebM frames');
    const { frames: webMFrames, channels, sampleRate } = extractFramesAndMeta(data);
    debugLog(`Extracted ${webMFrames.length} WebM frames`);

    // Extract codec info from WebM (simplified - assume defaults)
    const preskip = 312;
    const samplesPerFrame = 960; // 20ms at 48kHz

    const frames: OpusFrame[] = webMFrames.map(frame => ({
        data: frame,
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
export const extractFramesAndMeta = (buffer: Uint8Array): { frames: Uint8Array[], channels: number, sampleRate: number } => {
    const parentEnds = [buffer.length];
    const frames: Uint8Array[] = [];
    let offset = 0;
    let currentTrackEntryNo = -1;
    let opusTrackNo = -1;
    let elementsCount = 0;
    let channels = 0;
    let sampleRate = 0;

    while (parentEnds.length > 0) {
        elementsCount++;

        const currentEnd = parentEnds[parentEnds.length - 1];

        // 1. Check if we've finished the current container
        if (offset >= currentEnd) {
            parentEnds.pop();
            continue;
        }

        // 2. Read element ID and size
        const id = readId(buffer, offset);
        const elementSize = readVINT(buffer, offset + id.size);
        const dataStart = offset + id.size + elementSize.size;

        // 3. Determine the end of this element
        // if size is unknown, we assume it goes to the end of the parent
        // so it inherits the parent's end
        const dataEnd = elementSize.isUnknown
            ? currentEnd
            : dataStart + Number(elementSize.value);

        // 4. Decision based on element ID:
        // Enter, Process, or Skip
        switch (id.value) {
            // --- CONTAINERS: Enter (Push to stack and continue to the body) ---
            case EBML_IDS.EBML:
            case EBML_IDS.Segment:
            case EBML_IDS.Tracks:
            case EBML_IDS.TrackEntry:
            case EBML_IDS.Cluster:
                parentEnds.push(dataEnd);
                offset = dataStart;
                debugLog(`Entering container ID 0x${id.value.toString(16)} at offset ${offset}, ends at ${dataEnd}`);
                break;

            // --- LEAF ELEMENTS WITH REQUIRED DATA (Process) ---
            case EBML_IDS.TrackNumber:
                // Note current TrackNumber (inside TrackEntry, for CodecID lookup)
                const trackNo = readVINT(buffer, dataStart); // Value is a VINT
                currentTrackEntryNo = Number(trackNo.value);
                offset = dataEnd;
                debugLog(`Found TrackEntry number: ${currentTrackEntryNo}`);
                break;

            case EBML_IDS.CodecID:
                // Check if this TrackEntry is Opus
                const codec = decodeString(buffer, dataStart, Number(elementSize.value));
                if (codec === "A_OPUS") {
                    opusTrackNo = currentTrackEntryNo;
                    debugLog(`Identified Opus track number: ${opusTrackNo}`);
                }
                offset = dataEnd;
                debugLog(`Processed CodecID: ${codec} for TrackEntry number: ${currentTrackEntryNo}`);
                break;

            case EBML_IDS.ChannelCount:
                if (currentTrackEntryNo !== opusTrackNo) {
                    offset = dataEnd;
                    debugLog(`Skipping ChannelCount for non-Opus TrackEntry number: ${currentTrackEntryNo}`);
                    break;
                }
                channels = Number(readVINT(buffer, dataStart).value);
                offset = dataEnd;
                debugLog(`Processed ChannelCount: ${channels} for TrackEntry number: ${currentTrackEntryNo}`);
                break;

            case EBML_IDS.SamplingFrequency:
                if (currentTrackEntryNo !== opusTrackNo) {
                    offset = dataEnd;

                    debugLog(`Skipping SamplingFrequency for non-Opus TrackEntry number: ${currentTrackEntryNo}`);
                    break;
                }
                sampleRate = Number(readVINT(buffer, dataStart).value);
                offset = dataEnd;
                debugLog(`Processed SamplingFrequency: ${sampleRate} for TrackEntry number: ${currentTrackEntryNo}`);
                break;

            case EBML_IDS.SimpleBlock:
                // Process SimpleBlock frame (extract if Opus frames)
                debugLog(`Processing SimpleBlock at offset ${dataStart}`);
                if (opusTrackNo === -1) {
                    debugLog(`No Opus track identified yet, skipping SimpleBlock`);
                    break;
                }

                const blockTrackNo = readVINT(buffer, dataStart);

                debugLog(`SimpleBlock TrackNumber: ${blockTrackNo.value}, Opus TrackNumber: ${opusTrackNo}`);

                if (Number(blockTrackNo.value) !== opusTrackNo)
                    break;

                const flags = buffer[dataStart + blockTrackNo.size + 2];
                const lacingType = (flags & 0x06) >> 1;

                debugLog(`SimpleBlock lacing type: ${lacingType} ( ${['Xiph', 'Fixed', 'EBML'][lacingType - 1]})`);

                // Skip header: TrackNo VINT + 2 (Timecode) + 1 (Flags)
                const blockDataStart = dataStart + blockTrackNo.size + 2 + 1;
                const blockDataEnd = dataEnd;

                const newFrames = processSimpleBlock(buffer.subarray(blockDataStart, blockDataEnd), lacingType);

                debugLog(`Extracted ${newFrames.length} frames from SimpleBlock`);

                frames.push(...newFrames);
                offset = dataEnd;
                break;

            // --- ANYTHING ELSE (Skip) ---
            default:
                debugLog(`Skipping unrecognized element ID 0x${id.value.toString(16)} at offset ${offset}, size=${elementSize.value}${elementSize.isUnknown ? ' (unknown size)' : ''}`);
                if (elementSize.isUnknown) {
                    // If we hit an unknown-sized element we don't recognize, 
                    // we are forced to treat it as a container to look for IDs we DO know.
                    parentEnds.push(dataEnd);
                } else {
                    offset = dataEnd;
                }
                break;
        }
    }

    debugLog(`Total elements processed: ${elementsCount}`);

    return { frames, channels, sampleRate };
}