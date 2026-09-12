# Astrhythm

High-performance WebGL / HTML5 Canvas chart viewer and playback simulator for rhythm games.

---

## Features

- **Smooth 60+ FPS Canvas Rendering**: Optimized lane and note rendering with dynamic scroll speeds.
- **Full Note Type Support**:
  - Normal Tap, Critical Tap, Sound Notes
  - Flick / Scratch Notes
  - Hold Bodies, Hold Starts, and Hold Releases with continuous looping sound
- **Procedural Audio Synthesis**:
  - Integrated Web Audio API hit sound generator for instant zero-latency feedback without external asset files.
- **Timeline Density Graph**:
  - Visual note density bar chart across the entire song duration, color-coded by note categories (Tap, Hold, Flick).
- **Comprehensive Debug Suite**:
  - Real-time frame rate monitoring (current, average, min, max).
  - Sound effect state tracker.
  - Visible notes inspector and gimmick split viewer.

---

## Getting Started

### Prerequisites

- **Node.js**: 20.0 or higher
- **pnpm**: 10.0 or higher

### Running the Development Server

From the repository root:

```bash
vp dev -C astrhythm
# or: pnpm --filter astrhythm dev
```

Or from within the `astrhythm` directory:

```bash
vp dev
# or: pnpm dev
```

Open your browser at `http://localhost:5173`.

---

## How to Load Charts

1. Click **"Select files to load"** on the main screen.
2. In the file dialog, select both:
   - **Chart file**: `.csv` (or `.enc`)
   - **Audio file**: `.wav`, `.mp3`, `.m4a`, or `.ogg`
   - _(Optional)_ `music_config.csv`: If included in the selection, the playback offset (`DelaySeconds`) is parsed and applied automatically.
3. The chart and audio will decode, and the playback viewer will appear ready for interaction.

---

## Controls & Keyboard Shortcuts

| Key / Action           | Description                              |
| ---------------------- | ---------------------------------------- |
| **Click Play / Pause** | Toggle playback                          |
| **Seek Bar**           | Jump to any point in the track           |
| **Speed Slider**       | Adjust chart scroll speed (1.0x - 10.0x) |
| **Left Arrow (`←`)**   | Rewind 5 seconds                         |
| **Right Arrow (`→`)**  | Fast-forward 5 seconds                   |
| **`D`**                | Toggle debug overlay on / off            |
| **`N`**                | Toggle visible note inspector table      |
| **`S`**                | Toggle upcoming gimmick split table      |

---

## Building for Production

```bash
vp build
# or: pnpm build
```

Production assets are compiled into the `dist/` directory.
