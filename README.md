# ogg-opus-concat

**Concatenate multiple Opus-in-Ogg files into a single valid .opus stream — instantly, without re-encoding.**

Perfect for **MediaRecorder**, WebRTC recordings, voice messages, or any app that receives audio in chunks.

```ts
import { concatenateOpusFiles } from "ogg-opus-concat";

const merged = await concatenateOpusFiles([chunk1, chunk2, chunk3, ...]);
// → Uint8Array ready to play or save as .opus
```

### Why this exists

`MediaRecorder` (and many streaming audio sources) emits **self-contained Ogg/Opus files** on every `ondataavailable`.  
Each chunk has its own headers (OpusHead + OpusTags), sequence numbers, and checksums.

Simply appending them → **corrupted file** (wrong sequence numbers, duplicate headers, invalid checksums).

This package fixes all of that **in ~12 KB of WebAssembly**:
- Keeps the first file’s headers intact
- Strips duplicate OpusHead/OpusTags from subsequent chunks
- Rewrites page sequence numbers and serial numbers
- Adjusts granule positions so playback is seamless
- Recalculates every page CRC32
- Clears EOS flags when needed
- **Never re-encodes audio** — 100% lossless

You can safely append new chunks forever. The result is always a valid, seekable, gapless `.opus` file.

### Features

- Zero dependencies
- Tiny: ~12 KB (WASM) → ~4 KB gzipped
- Works in browser and Node.js
- No native modules, no ffmpeg, no decoding
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

    const result = await concatenateOpusFiles(buffers);

    const blob = new Blob([result], { type: "audio/opus" });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.controls = true;
    document.body.appendChild(audio);
  });
</script>
```

### Live Demo

~~https://chamnie.github.io/ogg-opus-concat-demo~~ (TBD)

### Install

```bash
npm install ogg-opus-concat
```

```ts
import { concatenateOpusFiles } from "ogg-opus-concat";
```

### License

[0BSD](LICENSE) — free for any project, open or closed source.  
Just keep the copyright line:  
© 2025 Chamie (https://github.com/chamie)