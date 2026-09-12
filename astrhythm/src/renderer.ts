import type { Note } from "./parser";

const LANE_COUNT = 12;

// B. Lookup table for note colors (avoids switch-case overhead)
const NOTE_COLOR_MAP: Record<number, string> = {
  10: "#ff528a", // Pink
  20: "#ffda33", // Yellow
  30: "#5ae0fe", // Blue
  31: "#d891ffdd", // Purple
  40: "#9d52ffdd", // Purple
  50: "#9d52ff", // Purple (Flick)
  80: "#33daff", // Cyan (Normal Hold Start)
  82: "#ff528a", // Pink (Scratch Hold Start)
  81: "#ffda33", // Yellow (Critical Hold Start)
  83: "#ffda33", // Yellow (Scratch Critical Hold Start)
  100: "#33daff", // Cyan (Hold Body)
  101: "#33daff", // Cyan (Critical Hold Body)
  110: "#9d52ff", // Purple (Scratch Hold Body)
  111: "#9d52ff", // Purple (Scratch Critical Hold Body)
  200: "#338aff", // Blue
};
const DEFAULT_NOTE_COLOR = "#ffffff";

function getNoteColor(noteType: number): string {
  return NOTE_COLOR_MAP[noteType] ?? DEFAULT_NOTE_COLOR;
}

// F. Pre-computed RGBA colors for hold backgrounds (alpha=0.4 ≈ 0x66)
const HOLD_BG_COLOR_MAP: Record<number, string> = {};
for (const [nt, hex] of Object.entries(NOTE_COLOR_MAP)) {
  // Convert #rrggbb to rgba(r,g,b,0.4)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  HOLD_BG_COLOR_MAP[Number(nt)] = `rgba(${r},${g},${b},0.4)`;
}
const DEFAULT_HOLD_BG_COLOR = "rgba(255,255,255,0.4)";

function getHoldBgColor(noteType: number): string {
  return HOLD_BG_COLOR_MAP[noteType] ?? DEFAULT_HOLD_BG_COLOR;
}

// D. Binary search: find first index where notes[i].startTick >= target
function lowerBound(notes: Note[], target: number): number {
  let lo = 0,
    hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].startTick < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// G. Cached split-line color strings
const splitColorMap: Record<number, { r: number; g: number; b: number }> = {
  1010: { r: 255, g: 0, b: 10 },
  1020: { r: 50, g: 50, b: 254 },
  10020: { r: 254, g: 100, b: 254 },
};

// Pre-compute rgba strings at various alpha levels (quantized to 0.05 steps)
const splitColorCache = new Map<string, string>();
function getSplitColorString(rgb: { r: number; g: number; b: number }, alpha: number): string {
  // Quantize alpha to reduce unique string count
  const a = (Math.round(alpha * 20) / 20).toFixed(2);
  const key = `${rgb.r},${rgb.g},${rgb.b},${a}`;
  let cached = splitColorCache.get(key);
  if (!cached) {
    cached = `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
    splitColorCache.set(key, cached);
  }
  return cached;
}

// C. RenderNote with pre-computed fields
type RenderNote = {
  note: Note;
  x: number;
  y: number;
  w: number;
  endY: number;
  color: string;
  isHold: boolean;
  isJumpScratch: boolean;
  drawY: number;
};

type LineDraw = {
  bounds: number[];
  progress: number;
  alpha: number;
  color: { r: number; g: number; b: number };
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private laneWidth: number;

  // C. Reusable arrays to avoid per-frame GC
  private _visibleNotes: RenderNote[] = [];
  private _linesToDraw: LineDraw[] = [];
  // H. Public getter for visible notes (avoids creating a new mapped array)
  private _visibleNoteResults: Note[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.laneWidth = (this.width * 0.8) / LANE_COUNT;
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.laneWidth = (this.width * 0.8) / LANE_COUNT;
  }

  // H. Getter: access visible notes without allocating
  public getVisibleNotes(): Note[] {
    return this._visibleNoteResults;
  }

  private drawScratchArrows(
    x: number,
    y: number,
    w: number,
    noteHeight: number,
    isJumpScratch: boolean,
    gimmickValue: number,
    laneWidth: number,
  ) {
    const h = noteHeight;
    const arrowW = h * 0.8;
    const padding = h * 0.4;
    const step = arrowW + padding;

    // translateY(-50%)
    const centerY = y - h / 2;
    // 縦に約2倍引き伸ばす
    const topY = centerY - h * 0.8;
    const bottomY = centerY + h * 0.8;

    if (isJumpScratch && gimmickValue !== 0) {
      const numLanes = Math.abs(gimmickValue);
      // gap = 2 (左右1pxずつ)を引く
      const totalW = numLanes * laneWidth - 2;
      const count = Math.max(1, Math.floor(totalW / step));

      let startX = x;
      if (gimmickValue < 0) {
        startX = x + w - totalW;
      }

      if (gimmickValue > 0) {
        // >>> 右向き矢印
        for (let i = 0; i < count; i++) {
          const offsetX = startX + i * step + (step - arrowW) / 2;
          this.ctx.moveTo(offsetX, topY);
          this.ctx.lineTo(offsetX + arrowW, centerY);
          this.ctx.lineTo(offsetX, bottomY);
        }
      } else {
        // <<< 左向き矢印
        for (let i = 0; i < count; i++) {
          const offsetX = startX + totalW - (i + 1) * step + (step - arrowW) / 2;
          this.ctx.moveTo(offsetX + arrowW, topY);
          this.ctx.lineTo(offsetX, centerY);
          this.ctx.lineTo(offsetX + arrowW, bottomY);
        }
      }
    } else {
      const halfW = w / 2;
      const count = Math.max(1, Math.floor(halfW / step));
      const centerX = x + w / 2;

      // <<< 左向き矢印
      for (let i = 0; i < count; i++) {
        const offsetX = centerX - (i + 1) * step + (step - arrowW) / 2;
        this.ctx.moveTo(offsetX + arrowW, topY);
        this.ctx.lineTo(offsetX, centerY);
        this.ctx.lineTo(offsetX + arrowW, bottomY);
      }

      // >>> 右向き矢印
      for (let i = 0; i < count; i++) {
        const offsetX = centerX + i * step + (step - arrowW) / 2;
        this.ctx.moveTo(offsetX, topY);
        this.ctx.lineTo(offsetX + arrowW, centerY);
        this.ctx.lineTo(offsetX, bottomY);
      }
    }
  }

  private static getBoundaries(mode: number): number[] {
    const ones = mode % 10;
    switch (ones) {
      case 1:
        return [0, 12];
      case 2:
        return [0, 6, 12];
      case 3:
        return [0, 4, 8, 12];
      case 4:
        return [0, 3, 6, 9, 12];
      case 5:
        return [0, 3, 5, 7, 9, 12];
      case 6:
        return [0, 2, 4, 6, 8, 10, 12];
      default:
        return [];
    }
  }

  public render(
    notes: Note[],
    currentTime: number,
    speed: number,
    showSimLines: boolean = true,
  ): void {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    const laneWidth = this.laneWidth;

    ctx.clearRect(0, 0, width, height);

    const startX = width * 0.1;
    const hitLineY = height * 0.85;

    // ---- Hit line ----
    ctx.beginPath();
    ctx.moveTo(startX, hitLineY);
    ctx.lineTo(startX + laneWidth * LANE_COUNT, hitLineY);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    // E. Lane lines: single batch
    ctx.beginPath();
    for (let i = 0; i <= LANE_COUNT; i++) {
      const lx = startX + i * laneWidth;
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, height);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const pixelsPerSecond = speed * height * 0.5;
    const NOTE_GAP = 10;
    const halfGap = NOTE_GAP / 2;
    const noteHeight = 12;

    // C. Reuse arrays
    const visibleNotes = this._visibleNotes;
    visibleNotes.length = 0;
    const linesToDraw = this._linesToDraw;
    linesToDraw.length = 0;

    // D. Compute time boundary for the visible screen bottom
    const screenBottomTime = currentTime - (height - hitLineY) / pixelsPerSecond;

    // ---- 0.5. Split line drawing ----
    const IN_DUR = 1.0;
    const OUT_DUR = 0.5;

    // D. Binary search: only scan noteType=0 notes that could be active
    // Active range: startTick >= currentTime - IN_DUR (for incoming animations)
    // But also need notes with endTick >= currentTime (for duration-based notes)
    // Conservative: start from notes whose startTick >= currentTime - IN_DUR - maxDuration
    // Since we don't know maxDuration, use a generous lookback
    const splitLookbackTime = currentTime - IN_DUR - 60; // 60s generous lookback for long-duration splits
    const splitStartIdx = lowerBound(notes, splitLookbackTime);

    for (let i = splitStartIdx; i < notes.length; i++) {
      const note = notes[i];
      // Early exit: if startTick is far in the future, no more relevant notes
      if (note.startTick > currentTime + IN_DUR) break;
      if (note.noteType !== 0) continue;

      const g = note.gimmickType;
      const v = note.gimmickValue;

      const bounds = Renderer.getBoundaries(g);
      if (bounds.length === 0) continue;

      const color = splitColorMap[v] || { r: 255, g: 255, b: 255 };

      const hasDuration = note.endTick > 0 && note.endTick !== note.startTick;

      const timeSinceStart = currentTime - note.startTick;
      if (timeSinceStart >= -IN_DUR) {
        let progress = 1.0;
        let alpha = 1.0;
        let isVisible = false;

        if (hasDuration) {
          const timeSinceEnd = currentTime - note.endTick;
          if (timeSinceStart < 0) {
            const t = (timeSinceStart + IN_DUR) / IN_DUR;
            progress = 1 - Math.pow(1 - t, 3);
            alpha = 1.0;
            isVisible = true;
          } else if (currentTime <= note.endTick) {
            progress = 1.0;
            alpha = 1.0;
            isVisible = true;
          } else if (timeSinceEnd < OUT_DUR) {
            progress = 1.0;
            alpha = 1.0 - timeSinceEnd / OUT_DUR;
            isVisible = true;
          }
        } else {
          if (timeSinceStart < 0) {
            const t = (timeSinceStart + IN_DUR) / IN_DUR;
            progress = 1 - Math.pow(1 - t, 3);
            alpha = 1.0;
            isVisible = true;
          } else if (timeSinceStart < OUT_DUR) {
            progress = 1.0;
            alpha = 1.0 - timeSinceStart / OUT_DUR;
            isVisible = true;
          }
        }

        if (isVisible) {
          linesToDraw.push({ bounds, progress, alpha, color });
        }
      }
    }

    // Split line rendering (batched by color+alpha)
    for (const line of linesToDraw) {
      ctx.beginPath();
      for (const b of line.bounds) {
        const x = startX + b * laneWidth;
        const lineLen = height * line.progress;
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - lineLen);
      }
      // G. Cached color string
      ctx.strokeStyle = getSplitColorString(line.color, line.alpha * 0.8);
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // ---- 1. Identify visible notes ----
    // D. Binary search for the start of visible notes
    // Notes with startTick < screenBottomTime might still be visible if they have endTick in range
    // Use a conservative lower bound: go back further to catch hold notes
    const noteScanStart = lowerBound(notes, screenBottomTime - 120); // 120s generous for very long holds

    for (let i = noteScanStart; i < notes.length; i++) {
      const note = notes[i];
      if (note.noteType === 0) continue;
      // 900 is included for counting but skipped in rendering

      const timeDiff = note.startTick - currentTime;
      const y = hitLineY - timeDiff * pixelsPerSecond;

      let endY = y;
      if (note.endTick > 0 && note.endTick !== note.startTick) {
        const endTimeDiff = note.endTick - currentTime;
        endY = hitLineY - endTimeDiff * pixelsPerSecond;
      }

      // Early exit: if y (bottom of note) is above screen and going further up
      if (y < 0 && endY < 0) {
        // For notes sorted by startTick, all subsequent notes will also be above
        break;
      }
      if (endY > height && y > height) continue;

      const x = startX + (note.lane - 1) * laneWidth + halfGap;
      const w = note.width * laneWidth - NOTE_GAP;
      const color = getNoteColor(note.noteType);

      // C. Pre-compute derived fields
      const isHold = note.endTick > 0 && note.endTick !== note.startTick;
      const isJumpScratch = note.gimmickType === 1;
      const drawY = isHold ? endY : y;

      visibleNotes.push({ note, x, y, w, endY, color, isHold, isJumpScratch, drawY });
    }

    // ---- 1.5. Simultaneous lines ----
    if (showSimLines) {
      const yGroups = new Map<number, RenderNote[]>();
      for (const vn of visibleNotes) {
        if (vn.note.noteType === 900) continue;
        if (vn.note.noteType === 30 || vn.note.noteType === 31) continue;

        let skipStart = false;
        if (
          vn.note.noteType === 100 ||
          vn.note.noteType === 101 ||
          vn.note.noteType === 110 ||
          vn.note.noteType === 111
        ) {
          if (vn.isHold) skipStart = true;
        }

        if (!skipStart) {
          const tick = vn.note.startTick;
          let group = yGroups.get(tick);
          if (!group) {
            group = [];
            yGroups.set(tick, group);
          }
          group.push(vn);
        }

        // Add Hold / CriticalHold ends
        if (vn.isHold) {
          const endTick = vn.note.endTick;
          let endGroup = yGroups.get(endTick);
          if (!endGroup) {
            endGroup = [];
            yGroups.set(endTick, endGroup);
          }
          endGroup.push({ ...vn, y: vn.endY });
        }
      }

      ctx.beginPath();
      for (const group of yGroups.values()) {
        if (group.length >= 2) {
          let minX = Infinity;
          let maxX = -Infinity;
          const lineY = group[0].y;

          for (const vn of group) {
            if (vn.x < minX) minX = vn.x;
            if (vn.x + vn.w > maxX) maxX = vn.x + vn.w;
          }

          ctx.moveTo(minX, lineY);
          ctx.lineTo(maxX, lineY);
        }
      }
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ---- 2. Pass 1: Hold backgrounds & JumpScratch backgrounds ----
    for (const vn of visibleNotes) {
      if (vn.note.noteType === 900) continue;
      const isJumpScratchNote = vn.isJumpScratch && vn.note.gimmickValue !== 0;

      if (vn.isHold) {
        // F. Use pre-computed rgba color instead of globalAlpha
        ctx.fillStyle = getHoldBgColor(vn.note.noteType);
        ctx.fillRect(vn.x, vn.endY, vn.w, vn.y - vn.endY);
      }

      // JumpScratch backgrounds
      if (isJumpScratchNote) {
        if (vn.isHold || vn.note.noteType === 40 || vn.note.noteType === 50) {
          const dy = vn.drawY;
          const numLanes = Math.abs(vn.note.gimmickValue);
          const totalW = numLanes * laneWidth - NOTE_GAP;
          let bgX = vn.x;
          if (vn.note.gimmickValue < 0) {
            bgX = vn.x + vn.w - totalW;
          }
          ctx.fillStyle = "#9d52ff";
          ctx.fillRect(bgX, dy - noteHeight / 2, totalW, noteHeight);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(bgX, dy - noteHeight / 2, totalW, noteHeight);
        }
      }
    }

    // ---- 3. Pass 2: Note bodies (E. Color-batched with Path2D) ----
    const colorPaths = new Map<string, Path2D>();
    const allStrokePath = new Path2D();

    for (const vn of visibleNotes) {
      if (vn.note.noteType === 900) continue;
      const isJumpScratchNote = vn.isJumpScratch && vn.note.gimmickValue !== 0;

      if (isJumpScratchNote) {
        if (vn.isHold && (vn.note.noteType === 110 || vn.note.noteType === 111)) {
          continue;
        }
        if (!vn.isHold && (vn.note.noteType === 40 || vn.note.noteType === 50)) {
          continue;
        }
      }

      if (vn.note.noteType === 30 || vn.note.noteType === 31) {
        // Rotated diamond: must use save/restore individually
        const cx = vn.x + vn.w / 2;
        const cy = vn.drawY;
        const size = laneWidth * 0.3;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);

        ctx.fillStyle = vn.color;
        ctx.fillRect(-size / 2, -size / 2, size, size);

        ctx.restore();
      } else {
        // E. Accumulate into Path2D by color
        let path = colorPaths.get(vn.color);
        if (!path) {
          path = new Path2D();
          colorPaths.set(vn.color, path);
        }
        path.rect(vn.x, vn.drawY - noteHeight / 2, vn.w, noteHeight);
        allStrokePath.rect(vn.x, vn.drawY - noteHeight / 2, vn.w, noteHeight);
      }
    }

    // E. Batch fill by color
    for (const [color, path] of colorPaths) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    // E. Single stroke for all note outlines
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke(allStrokePath);

    // ---- 4. Pass 3: Arrows (batch drawing) ----
    ctx.beginPath();
    for (const vn of visibleNotes) {
      if (vn.note.noteType === 900) continue;

      if (vn.isHold) {
        if (vn.note.noteType === 110 || vn.note.noteType === 111) {
          this.drawScratchArrows(
            vn.x,
            vn.endY,
            vn.w,
            noteHeight,
            vn.isJumpScratch,
            vn.note.gimmickValue,
            laneWidth,
          );
        }
      } else {
        if (vn.note.noteType === 40 || vn.note.noteType === 50) {
          this.drawScratchArrows(
            vn.x,
            vn.y,
            vn.w,
            noteHeight,
            vn.isJumpScratch,
            vn.note.gimmickValue,
            laneWidth,
          );
        }
      }
    }

    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    // White outline
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.stroke();

    // Purple inner stroke
    ctx.strokeStyle = "#9d52ff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // H. Build visible note results for external consumers (reuse array)
    const results = this._visibleNoteResults;
    results.length = 0;
    for (let i = 0; i < visibleNotes.length; i++) {
      results.push(visibleNotes[i].note);
    }
  }
}
