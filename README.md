# Astrarium

_Stella exstinguitur, lux in caelo remanet._

Astrarium is a modular monorepo toolkit designed for rhythm game data research, automated asset synchronization, and high-performance in-browser chart playback.

---

## Monorepo Packages

| Package                         | Path                          | Description                                                                                   | Status               |
| ------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| **[Astrhythm](astrhythm/)**     | [`astrhythm`](astrhythm/)     | Canvas-based rhythm game chart viewer and playback simulator with procedural audio synthesis. | Ready                |
| **[Astration](astration/)**     | [`astration`](astration/)     | Python data pipeline for asset extraction, decryption, catalog syncing, and format decoding.  | Ready                |
| **[Astravestis](astravestis/)** | [`astravestis`](astravestis/) | Shared design system and UI component library built with Storybook and Tailwind CSS.          | In Development (WIP) |

---

## Prerequisites

- **Node.js**: `20.0.0` or higher
- **pnpm**: `10.0.0` or higher
- **Vite+ (`vp`)**: Toolchain runner (`npm i -g vite-plus`)
- **Python**: `3.10` or higher (for `astration`)

---

## Quick Start

### 1. Install Workspace Dependencies

```bash
vp install
# or: pnpm install
```

### 2. Code Quality & Format Check

```bash
vp check
# or auto-fix: vp check --fix
```

### 3. Build All Packages

```bash
vp run -r build
# or: pnpm run build
```

### 4. Launch Chart Viewer (`astrhythm`)

```bash
vp dev -C astrhythm
# or: pnpm --filter astrhythm dev
```

Visit `http://localhost:5173` in your browser. Drag and drop your chart (`.csv` or `.enc`) along with the audio file (`.wav` or `.mp3`) to begin simulation.

### 5. Run Asset Pipeline (`astration`)

```bash
cd astration
python -m venv .venv
# Windows:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
python __main__.py --help
```

See [astration/README.md](astration/) for detailed command reference and configuration details.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Disclaimer

Astrarium is an independent open-source project created strictly for educational, research, and personal archive purposes.
