/**
 * Known Matroska/WebM element IDs
 */
export const EBML_IDS = {
    // Containers:
    EBML: 0x1A45DFA3n,
    Segment: 0x18538067n,
    Tracks: 0x1654AE6Bn,
    TrackEntry: 0xAEn,
    Cluster: 0x1F43B675n,
    BlockGroup: 0xA0n,

    // Leaves:
    SimpleBlock: 0xA3n,
    CodecID: 0x86n,
    TrackNumber: 0xD7n,
}

export enum LACING_TYPES {
    NONE = 0,
    XIPH = 1,
    FIXED_SIZE = 2,
    EBML = 3,
};