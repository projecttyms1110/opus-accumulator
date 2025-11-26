let wasmInstance = null;

export async function concatenateOpusFiles(files) {
  if (!wasmInstance) {
    const wasmBuffer = await fetch(
      new URL('./ogg-opus-concat.wasm', import.meta.url)
    ).then(res => res.arrayBuffer());

    wasmInstance = await WebAssembly.instantiate(wasmBuffer);
  }

  const { concatenateOpusFiles, __allocArray, __retain, __release, Uint8Array_ID } = wasmInstance.instance.exports;

  // Convert JS arrays to AS arrays
  const retained = files.map(file => {
    const ptr = __allocArray(Uint8Array_ID, file);
    return __retain(ptr);
  });

  try {
    const resultPtr = concatenateOpusFiles(retained.length, ...retained);
    const result = wasmInstance.__getUint8Array(resultPtr);
    return Uint8Array.from(result); // copy to avoid WASM memory issues
  } finally {
    retained.forEach(ptr => __release(ptr));
  }
}