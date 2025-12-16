import { OggPage } from "./oggTypes";
/**
 * Scan for first "OggS" magic bytes in data
 * @param data
 * @returns position of first OggS or -1 if not found
 */
export declare const findOggStart: (data: Uint8Array) => number;
export declare const parseOggPage: (data: Uint8Array, offset: number) => OggPage | null;
