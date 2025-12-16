const exports: {
    isDebug: boolean;
    customLogger: ((...args: any[]) => void) | null;
    debugLog: (...args: any[]) => void;
} = {
    isDebug: false,
    customLogger: null,
    debugLog: (...args: any[]) => {
        if (!exports.isDebug) return;
        if (exports.customLogger) {
            exports.customLogger(...args);
        } else {
            console.debug(...args);
        }
    }
}

export default exports;