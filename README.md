# ogg-opus-concat

**Concatenate multiple Opus-in-Ogg files into a single valid .opus stream — instantly, without re-encoding.**

Perfect for **MediaRecorder**, WebRTC recordings, voice messages, or any app that receives audio in chunks.
```ts
import { concatenateOpusFiles } from "ogg-opus-concat";

const merged = await concatenateOpusFiles([chunk1, chunk2, chunk3]);
// → Uint8Array ready to play or save as .opus
```

### Why this exists

`MediaRecorder` (and many streaming audio sources) emits **self-contained Ogg/Opus files** on every `ondataavailable`.  
Each chunk has its own headers (OpusHead + OpusTags), sequence numbers, and checksums.
Well, Chrome gives you WebM with Opus inside and Safari doesn't give you anything but mp4, but the common ground is often Opus,
natively or through some libs. And that's especially useful as with '.opus' files' native Ogg format you can add frames by just
appending them to the end of the file, without re-writing anything.

Yet simply appending the files together → **corrupted file** (wrong sequence numbers, duplicate headers, invalid checksums,
"playlist" file with many files inside) that could only be played/processed successfully if you're lucky with your tools.

This package fixes all of that **in pure TypeScript**:
- Keeps the first file's headers intact
- Strips duplicate OpusHead/OpusTags from subsequent chunks
- Rewrites page sequence numbers and serial numbers
- Adjusts granule positions so playback is seamless
- Recalculates every page CRC32
- Clears EOS flags for append-only compatibility
- Skips non-Ogg junk data (ID3 tags, EXIF, etc.)
- **Never re-encodes audio** — 100% lossless

You can safely append new chunks forever. The result is always a valid, seekable, gapless `.opus` file.

### Features

- Zero dependencies
- Tiny: ~5 KB minified + gzipped
- Works in browser and Node.js
- **Supports both Ogg Opus and WebM Opus** - auto-detects format
- Pure TypeScript — no WebAssembly, no native modules, no ffmpeg, no decoding
- Efficient incremental appending without re-parsing entire files
- ~~Battle-tested with MediaRecorder, WebRTC, WhatsApp-style voice messages~~ (not yet, to be updated)

### Usage

#### Basic concatenation
```html
<input type="file" multiple accept=".opus,audio/ogg" id="files">
<script type="module">
  import { concatenateOpusFiles } from "https://cdn.skypack.dev/ogg-opus-concat";

  document.getElementById("files").addEventListener("change", async e => {
    const buffers = await Promise.all(
      Array.from(e.target.files).map(f => f.arrayBuffer().then(b => new Uint8Array(b)))
    );

    const result = await concatenateOpusFiles(buffers);

    const blob = new Blob([result], { type: "audio/opus" });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.controls = true;
    document.body.appendChild(audio);
  });
</script>
```

#### Mix Ogg and WebM files
```ts
// Chrome gives you WebM, Firefox gives you Ogg
const chromeChunk = new Uint8Array(...); // WebM
const firefoxChunk = new Uint8Array(...); // Ogg

// Just concatenate them - format is auto-detected!
const merged = await concatenateOpusFiles([chromeChunk, firefoxChunk]);
```

#### Efficient incremental appending
Perfect for live recording scenarios where you want to append chunks without re-processing the entire file:
```ts
import { prepareForConcat, addToAcc } from "ogg-opus-concat";

// Load or create your initial recording
let recordingFile = await loadExistingRecording(); // Uint8Array

// Prepare it once for efficient appending
let { prepared, meta } = prepareForConcat(recordingFile);
recordingFile = prepared; // Use the prepared version

// Recording loop - append chunks as they arrive
mediaRecorder.ondataavailable = async (event) => {
  const chunk = new Uint8Array(await event.data.arrayBuffer());
  
  // Efficiently append without re-parsing the entire file
  const { result, meta: newMeta } = addToAcc(recordingFile, [chunk], meta);
  
  recordingFile = result;
  meta = newMeta;
  
  // Optionally save to disk/IndexedDB
  await saveRecording(recordingFile);
};
```

**Why this matters:**
- `prepareForConcat()` parses the file once, extracts metadata, clears EOS flags, and replaces OpusTags
- `addToAcc()` only processes new chunks — no need to re-parse the accumulator file
- Perfect for append-only architectures where sync and recording are separate threads
- Scales to recordings of any length (hours+) without performance degradation

### Live Demo

~~https://chamie.github.io/ogg-opus-concat-demo~~ (TBD)

### Install
```bash
npm install ogg-opus-concat
```
```ts
import { concatenateOpusFiles, prepareForConcat, addToAcc } from "ogg-opus-concat";
```

### API

#### `concatenateOpusFiles(chunks: Uint8Array[]): Promise<Uint8Array>`

Takes an array of Opus-in-Ogg file buffers and returns a single concatenated buffer containing a valid
Ogg file with all the Opus frames inside.

**Example:**
```ts
const merged = await concatenateOpusFiles([chunk1, chunk2, chunk3]);
```

---

#### `prepareForConcat(file: Uint8Array): { prepared: Uint8Array; meta: AppendMeta }`

Prepares an existing Opus file for efficient incremental appending. This function:
- Clears all EOS (End of Stream) flags
- Replaces OpusTags with a minimal version (removes duration metadata)
- Renumbers all page sequences to be continuous
- Returns metadata needed for `addToAcc()`

**Returns:**
- `prepared`: The prepared file ready for appending
- `meta`: Metadata object containing `{ serialNumber, lastPageSequence, cumulativeGranule, totalSize }`

**Example:**
```ts
const existingFile = await loadFile('recording.opus');
const { prepared, meta } = prepareForConcat(existingFile);
```

---

#### `addToAcc(acc: Uint8Array, chunks: Uint8Array[], accMeta: AppendMeta): { result: Uint8Array; meta: AppendMeta }`

Efficiently appends new chunks to an accumulator file without re-parsing it.

**Parameters:**
- `acc`: The accumulator file (output from `prepareForConcat()` or previous `addToAcc()`)
- `chunks`: Array of new Opus chunks to append
- `accMeta`: Metadata from `prepareForConcat()` or previous `addToAcc()`

**Returns:**
- `result`: The new concatenated file
- `meta`: Updated metadata for the next append operation

**Example:**
```ts
let { result, meta } = addToAcc(prepared, [newChunk1, newChunk2], meta);
// Keep appending more chunks
({ result, meta } = addToAcc(result, [newChunk3], meta));
```

---

#### `AppendMeta` interface
```ts
interface AppendMeta {
  serialNumber: number;      // Ogg stream serial number
  lastPageSequence: number;  // Last page sequence number in file
  cumulativeGranule: bigint; // Total granule position (duration in 48kHz samples)
  totalSize: number;         // Total file size in bytes
}
```


### License

[0BSD](LICENSE) — free for any project, open or closed source.  
Just keep the copyright line:  
© 2025 Chamie (https://github.com/chamie)