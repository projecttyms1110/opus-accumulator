export type OpusFrame = {
    data: Uint8Array;
    samples: number;
};
export type OpusStream = {
    frames: OpusFrame[];
    serialNumber?: number;
    channels: number;
    preskip: number;
    sampleRate: number;
};
