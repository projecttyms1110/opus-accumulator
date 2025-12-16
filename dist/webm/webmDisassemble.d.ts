import { OpusStream } from "../types/opus";
import { WebMFrame } from "./webM";
export declare const disassembleWebM: (data: Uint8Array) => OpusStream;
/**
 * Extract Opus frames from a WebM/Matroska file
 */
export declare const extractWebMFrames: (data: Uint8Array) => WebMFrame[];
