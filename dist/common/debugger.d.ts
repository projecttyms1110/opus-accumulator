declare const exports: {
    isDebug: boolean;
    customLogger: ((...args: any[]) => void) | null;
    debugLog: (...args: any[]) => void;
};
export default exports;
