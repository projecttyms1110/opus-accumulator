export type DebugCategory = 'parser' | 'disassembler' | 'assembler' | 'index';

const exports: {
    isDebug: boolean;
    customLogger: ((...args: any[]) => void) | null;
    /** Empty set means all categories enabled */
    enabledCategories: Set<DebugCategory>;
    debugLog: (...args: any[]) => void;
} = {
    isDebug: false,
    customLogger: null,
    enabledCategories: new Set<DebugCategory>([]),
    debugLog: (category: DebugCategory, ...args: any[]) => {
        if (!exports.isDebug) return;

        if (exports.enabledCategories.size && !exports.enabledCategories.has(category)) return;

        if (exports.customLogger) {
            exports.customLogger(category, ...args);
        } else {
            console.debug(`Category: ${category}`, ...args);
        }
    }
}

export default exports;