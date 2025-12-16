import { WebMFrame } from "./webM";
/**
 * Read EBML variable-length integer (VINT)
 * First byte encodes both the length and part of the value
 */
export declare const readVINT: (data: Uint8Array, offset: number) => {
    value: number;
    size: number;
};
/**
 * Read EBML element size
 */
export declare const readElementSize: (data: Uint8Array, offset: number) => {
    size: number;
    dataSize: number;
};
/**
 * Parse a SimpleBlock or Block element
 */
export declare const parseBlock: (data: Uint8Array, clusterTimecode: number) => WebMFrame;
