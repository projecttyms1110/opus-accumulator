const exports = {
    isDebug: false,
    customLogger: null,
    debugLog: (...args) => {
        if (!exports.isDebug)
            return;
        if (exports.customLogger) {
            exports.customLogger(...args);
        }
        else {
            console.debug(...args);
        }
    }
};
export default exports;
