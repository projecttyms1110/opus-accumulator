# ogg-opus-concat

**Concatenate multiple Opus-in-Ogg files into a single valid .opus stream — instantly, without re-encoding.**

Perfect for **MediaRecorder**, WebRTC recordings, voice messages, or any app that receives audio in chunks.
```ts
import { concatenateOpusFiles } from "ogg-opus-concat";

const merged = concatenateOpusFiles([chunk1, chunk2, chunk3, ...]);
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
- Clears EOS flags when needed
- **Never re-encodes audio** — 100% lossless

You can safely append new chunks forever. The result is always a valid, seekable, gapless `.opus` file.

### Features

- Zero dependencies
- Tiny: ~2 KB minified + gzipped
- Works in browser and Node.js
- Pure TypeScript — no WebAssembly, no native modules, no ffmpeg, no decoding
- ~~Battle-tested with MediaRecorder, WebRTC, WhatsApp-style voice messages~~ (not yet, to be updated)

### Usage
```html
<input type="file" multiple accept=".opus,audio/ogg" id="files">
<script type="module">
  import { concatenateOpusFiles } from "https://cdn.skypack.dev/ogg-opus-concat";

  document.getElementById("files").addEventListener("change", async e => {
    const buffers = await Promise.all(
      Array.from(e.target.files).map(f => f.arrayBuffer().then(b => new Uint8Array(b)))
    );

    const result = concatenateOpusFiles(buffers);

    const blob = new Blob([result], { type: "audio/opus" });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.controls = true;
    document.body.appendChild(audio);
  });
</script>
```

### Live Demo

~~https://chamie.github.io/ogg-opus-concat-demo~~ (TBD)

### Install
```bash
npm install ogg-opus-concat
```
```ts
import { concatenateOpusFiles } from "ogg-opus-concat";
```

### API
```ts
function concatenateOpusFiles(files: Uint8Array[]): Uint8Array
```

Takes an array of Opus-in-Ogg file buffers and returns a single concatenated buffer.

### License

[0BSD](LICENSE) — free for any project, open or closed source.  
Just keep the copyright line:  
© 2025 Chamie (https://github.com/chamie)