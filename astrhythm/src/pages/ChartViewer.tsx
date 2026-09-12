import { useState, useRef, useEffect, useMemo } from "react";
import { DebugOverlay } from "../components/ChartViewer/DebugOverlay";
import { ChartControls } from "../components/ChartViewer/ChartControls";
import { ChartCanvas } from "../components/ChartViewer/ChartCanvas";
import { parseChart } from "../parser";
import type { Note } from "../parser";
import { Renderer } from "../renderer";
import { getNoteCategory, NOTE_CATEGORIES, type NoteCategory } from "../utils/noteCategory";
import { initSynthesizedSounds } from "../utils/audioSynthesis";

export function ChartViewer() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(2.0);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [chartLoaded, setChartLoaded] = useState(false);
  const [csvFiles, setCsvFiles] = useState<{ name: string; text: string }[]>([]);
  const [selectedCsvFileName, setSelectedCsvFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const scratchSoundRef = useRef<AudioBuffer | null>(null);
  const criticalSoundRef = useRef<AudioBuffer | null>(null);
  const holdSoundRef = useRef<AudioBuffer | null>(null);
  const perfectSoundRef = useRef<AudioBuffer | null>(null);
  const holdEndSoundRef = useRef<AudioBuffer | null>(null);
  const holdSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const lastHitTimeRef = useRef<number>(-9999);
  const startTimeRef = useRef(0);
  const pauseTimeRef = useRef(0);
  const delaySecondsRef = useRef(0);
  const seActiveCountRef = useRef({ perfect: 0, critical: 0, scratch: 0, holdEnd: 0 });
  const currentTimeRef = useRef<number>(0);
  const seekRef = useRef<((time: number) => void) | null>(null);

  // J. Pre-allocated Sets for noteType lookups (avoid per-frame array allocations)
  const HOLD_BODY_TYPES = useMemo(() => new Set([100, 101, 110, 111]), []);
  const CRITICAL_TYPES = useMemo(() => new Set([20, 81, 101, 83, 111]), []);
  const SCRATCH_TYPES = useMemo(() => new Set([40, 50, 110]), []);
  const HOLD_END_TYPES = useMemo(() => new Set([100, 101]), []);

  const comboTicks = useMemo(() => {
    const ticks: number[] = [];
    for (const n of notes) {
      if (n.noteType === 0) continue;
      if ([100, 101, 110, 111].includes(n.noteType)) {
        if (n.endTick > 0 && n.endTick !== n.startTick) {
          ticks.push(n.endTick);
        }
      } else {
        ticks.push(n.startTick);
      }
    }
    ticks.sort((a, b) => a - b);
    return ticks;
  }, [notes]);

  const maxCombo = comboTicks.length;

  const currentCombo = useMemo(() => {
    if (comboTicks.length === 0) return 0;
    const currentHitTime = currentTime - delaySecondsRef.current;
    let low = 0;
    let high = comboTicks.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (comboTicks[mid] <= currentHitTime) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }, [comboTicks, currentTime]);

  const [showDebug, setShowDebug] = useState(false);
  const [showDebugNotes, setShowDebugNotes] = useState(true);
  const [showDebugSplits, setShowDebugSplits] = useState(true);
  const [showSimLines, setShowSimLines] = useState(true);
  const showDebugRef = useRef(false);
  const showDebugNotesRef = useRef(true);
  const showDebugSplitsRef = useRef(true);
  const showSimLinesRef = useRef(true);
  showDebugRef.current = showDebug;
  showDebugNotesRef.current = showDebugNotes;
  showDebugSplitsRef.current = showDebugSplits;
  showSimLinesRef.current = showSimLines;

  const lastFrameTimeRef = useRef<number>(performance.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const freqCanvasRef = useRef<HTMLCanvasElement>(null);
  const debugOverlayRef = useRef<HTMLPreElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    if (freqCanvasRef.current && notes.length > 0) {
      const canvas = freqCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const BAR_WIDTH = 3; // 各バーの横幅（太さ）
      const numBuckets = Math.floor(width / BAR_WIDTH);

      const duration = audioBufferRef.current
        ? audioBufferRef.current.duration
        : notes[notes.length - 1]?.startTick || 100;
      const activeCategories: NoteCategory[] = ["tap", "hold", "flick"];

      const buckets: Record<NoteCategory, number>[] = Array.from({ length: numBuckets }, () => ({
        tap: 0,
        hold: 0,
        flick: 0,
        ignore: 0,
      }));

      for (const n of notes) {
        const cat = getNoteCategory(n.noteType);
        if (cat === "ignore") continue;

        let t = n.startTick + (delaySecondsRef.current || 0);
        if (t < 0) t = 0;
        if (t > duration) t = duration;
        const bucketIdx = Math.floor((t / duration) * numBuckets);
        if (bucketIdx >= 0 && bucketIdx < numBuckets) {
          buckets[bucketIdx][cat]++;
        }
      }

      let maxTotal = 1;
      for (let i = 0; i < numBuckets; i++) {
        const total = activeCategories.reduce((sum, cat) => sum + buckets[i][cat], 0);
        if (total > maxTotal) {
          maxTotal = total;
        }
      }

      for (let i = 0; i < numBuckets; i++) {
        const x = i * BAR_WIDTH;
        let currentY = height;
        for (const cat of activeCategories) {
          const count = buckets[i][cat];
          if (count > 0) {
            const h = (count / maxTotal) * height;
            ctx.fillStyle = NOTE_CATEGORIES[cat].color;
            ctx.fillRect(x, currentY - h, BAR_WIDTH, h);
            currentY -= h;
          }
        }
      }
    }
  }, [notes, audioBufferRef.current]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "d" || e.key === "D") {
        setShowDebug((prev) => {
          showDebugRef.current = !prev;
          return !prev;
        });
      }
      if (e.key === "n" || e.key === "N") {
        setShowDebugNotes((prev) => {
          showDebugNotesRef.current = !prev;
          return !prev;
        });
      }
      if (e.key === "s" || e.key === "S") {
        setShowDebugSplits((prev) => {
          showDebugSplitsRef.current = !prev;
          return !prev;
        });
      }
      if (e.key === "ArrowLeft") {
        if (seekRef.current) seekRef.current(currentTimeRef.current - 5);
      }
      if (e.key === "ArrowRight") {
        if (seekRef.current) seekRef.current(currentTimeRef.current + 5);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const lastOverlayUpdateRef = useRef<number>(0);
  // L. Ring buffer for FPS timestamps (avoids O(n) shift())
  const frameTimestampsRef = useRef<{ buf: Float64Array; head: number; count: number }>({
    buf: new Float64Array(1024),
    head: 0,
    count: 0,
  });
  const fpsSamplesRef = useRef<{ buf: Float64Array; head: number; count: number }>({
    buf: new Float64Array(120),
    head: 0,
    count: 0,
  });

  const padNum = (val: number, intDigits: number = 3, decimals: number = 1): string => {
    if (!isFinite(val)) return "-".padStart(intDigits + (decimals > 0 ? decimals + 1 : 0), " ");
    const parts = val.toFixed(decimals).split(".");
    const intPart = parts[0].padStart(intDigits, " ");
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  };

  const getNoteTypeName = (noteType: number): string => {
    switch (noteType) {
      case 0:
        return "None";
      case 10:
        return "Normal";
      case 20:
        return "Critical";
      case 30:
        return "Sound";
      case 31:
        return "SoundPurple";
      case 40:
        return "Scratch";
      case 50:
        return "Flick";
      case 80:
        return "HoldStart";
      case 81:
        return "CriticalHoldStart";
      case 82:
        return "ScratchHoldStart";
      case 83:
        return "ScratchCriticalHoldStart";
      case 100:
        return "Hold";
      case 101:
        return "CriticalHold";
      case 110:
        return "ScratchHold";
      case 111:
        return "ScratchCriticalHold";
      case 200:
        return "BlueTap";
      case 900:
        return "HoldEighth";
      default:
        return `Note(${noteType})`;
    }
  };

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      rendererRef.current = new Renderer(canvas);

      const dpr = window.devicePixelRatio || 1;
      // I. resize() bug fix: update renderer internal dimensions too
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        rendererRef.current?.resize(canvas.width, canvas.height);
      };
      resize();

      observer = new ResizeObserver(resize);
      observer.observe(canvas.parentElement || canvas);
    }

    const renderLoop = () => {
      const nowPerf = performance.now();
      const delta = nowPerf - lastFrameTimeRef.current;
      lastFrameTimeRef.current = nowPerf;

      // L. Ring buffer FPS tracking
      const WINDOW_MS = 500;
      const ts = frameTimestampsRef.current;
      // Push to ring buffer
      const tsIdx = (ts.head + ts.count) % ts.buf.length;
      ts.buf[tsIdx] = nowPerf;
      if (ts.count < ts.buf.length) ts.count++;
      else ts.head = (ts.head + 1) % ts.buf.length;
      // Evict old timestamps outside window
      while (ts.count > 0 && ts.buf[ts.head] < nowPerf - WINDOW_MS) {
        ts.head = (ts.head + 1) % ts.buf.length;
        ts.count--;
      }

      const currentFps = (ts.count / WINDOW_MS) * 1000;
      const fps = fpsSamplesRef.current;
      const fpsIdx = (fps.head + fps.count) % fps.buf.length;
      fps.buf[fpsIdx] = currentFps;
      if (fps.count < fps.buf.length) fps.count++;
      else fps.head = (fps.head + 1) % fps.buf.length;

      let now = pauseTimeRef.current;
      if (isPlaying && audioContextRef.current) {
        now = audioContextRef.current.currentTime - startTimeRef.current;

        const duration = audioBufferRef.current
          ? audioBufferRef.current.duration
          : notes.length > 0
            ? notes[notes.length - 1].startTick
            : 100;
        if (now >= duration) {
          now = duration;
          pauseTimeRef.current = duration;
          setIsPlaying(false);
          if (audioSourceRef.current) {
            try {
              audioSourceRef.current.stop();
            } catch {}
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
          }
          if (holdSourceRef.current) {
            try {
              holdSourceRef.current.stop();
            } catch {}
            holdSourceRef.current.disconnect();
            holdSourceRef.current = null;
          }
        }

        setCurrentTime(now);
        currentTimeRef.current = now;

        const currentHitTime = now - delaySecondsRef.current;
        const previousHitTime = lastHitTimeRef.current;

        // 初期値(-9999)でない場合のみヒット判定を行う。再生開始時のマイナス時間（-0.001など）でも判定ブロックに入るようにする。
        if (previousHitTime > -9000) {
          let playCritical = false;
          let playScratch = false;
          let playPerfect = false;
          let playHoldEnd = false;

          // J. Binary search + Set-based lookups for sound triggers
          // Find first note that could trigger (startTick > previousHitTime)
          // Since notes are sorted by startTick, we can start from the relevant range
          let lo = 0,
            hi = notes.length;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (notes[mid].startTick < previousHitTime - 120) lo = mid + 1;
            else hi = mid;
          }

          for (let ni = lo; ni < notes.length; ni++) {
            const n = notes[ni];
            // Early exit: startTick is past currentHitTime, and for non-hold notes that means
            // no more hits possible. For hold notes endTick could still be in range, but
            // endTick >= startTick, so if startTick > currentHitTime + maxHoldDuration we can stop.
            if (n.startTick > currentHitTime + 120) break;
            if (n.noteType === 0 || n.noteType === 900) continue;

            let isHit = false;
            let isEndHit = false;
            if (HOLD_BODY_TYPES.has(n.noteType)) {
              if (n.endTick > 0 && n.endTick !== n.startTick) {
                if (n.endTick > previousHitTime && n.endTick <= currentHitTime) {
                  isHit = true;
                  isEndHit = true;
                }
              }
            } else {
              if (n.startTick > previousHitTime && n.startTick <= currentHitTime) {
                isHit = true;
              }
            }

            if (isHit) {
              if (isEndHit && HOLD_END_TYPES.has(n.noteType)) {
                playHoldEnd = true;
              } else {
                if (CRITICAL_TYPES.has(n.noteType)) playCritical = true;
                else if (SCRATCH_TYPES.has(n.noteType)) playScratch = true;
                else playPerfect = true;
              }
            }
          }

          const playSound = (
            buffer: AudioBuffer | null,
            type: "perfect" | "critical" | "scratch" | "holdEnd",
          ) => {
            if (buffer && audioContextRef.current) {
              const src = audioContextRef.current.createBufferSource();
              src.buffer = buffer;
              src.connect(audioContextRef.current.destination);
              seActiveCountRef.current[type]++;
              src.onended = () => {
                seActiveCountRef.current[type]--;
              };
              src.start();
            }
          };

          if (playCritical) playSound(criticalSoundRef.current, "critical");
          if (playScratch) playSound(scratchSoundRef.current, "scratch");
          if (playPerfect) playSound(perfectSoundRef.current, "perfect");
          if (playHoldEnd) playSound(holdEndSoundRef.current, "holdEnd");
        }
        lastHitTimeRef.current = currentHitTime;

        // J. Hold detection with binary search
        let isHolding = false;
        {
          let hLo = 0,
            hHi = notes.length;
          while (hLo < hHi) {
            const mid = (hLo + hHi) >>> 1;
            if (notes[mid].startTick < currentHitTime - 120) hLo = mid + 1;
            else hHi = mid;
          }
          for (let ni = hLo; ni < notes.length; ni++) {
            const n = notes[ni];
            if (n.startTick > currentHitTime) break;
            if (HOLD_BODY_TYPES.has(n.noteType)) {
              if (n.startTick <= currentHitTime && n.endTick >= currentHitTime) {
                isHolding = true;
                break;
              }
            }
          }
        }

        if (isHolding) {
          if (!holdSourceRef.current && holdSoundRef.current && audioContextRef.current) {
            const src = audioContextRef.current.createBufferSource();
            src.buffer = holdSoundRef.current;
            src.loop = true;
            src.connect(audioContextRef.current.destination);
            src.start();
            holdSourceRef.current = src;
          }
        } else {
          if (holdSourceRef.current) {
            try {
              holdSourceRef.current.stop();
            } catch {}
            holdSourceRef.current.disconnect();
            holdSourceRef.current = null;
          }
        }
      } else {
        // 再生開始時やシーク直後に、ちょうど現在時刻にあるノート（0.0秒のノートなど）をヒット判定に含めるためのオフセット
        lastHitTimeRef.current = now - delaySecondsRef.current - 0.001;
        if (holdSourceRef.current) {
          try {
            holdSourceRef.current.stop();
          } catch {}
          holdSourceRef.current.disconnect();
          holdSourceRef.current = null;
        }
      }

      if (rendererRef.current) {
        // K. render() no longer returns visibleNotes; use getter when needed
        rendererRef.current.render(
          notes,
          now - delaySecondsRef.current,
          speed,
          showSimLinesRef.current,
        );

        if (debugOverlayRef.current && showDebugRef.current) {
          if (nowPerf - lastOverlayUpdateRef.current >= 80) {
            lastOverlayUpdateRef.current = nowPerf;

            // L. Ring buffer stats computation
            const fpsRing = fpsSamplesRef.current;
            let fpsText = "FPS:    --- (Avg:    --- | Min:    --- | Max:    ---)\nFrame:    --- ms";
            if (fpsRing.count > 0) {
              let sum = 0,
                minFps = Infinity,
                maxFps = -Infinity;
              for (let fi = 0; fi < fpsRing.count; fi++) {
                const v = fpsRing.buf[(fpsRing.head + fi) % fpsRing.buf.length];
                sum += v;
                if (v < minFps) minFps = v;
                if (v > maxFps) maxFps = v;
              }
              const avgFps = sum / fpsRing.count;
              const frameTimeMs = ts.count > 0 ? WINDOW_MS / ts.count : delta;

              fpsText = `FPS:   ${padNum(currentFps, 3, 1)} (Avg: ${padNum(avgFps, 3, 1)} | Min: ${padNum(minFps, 3, 1)} | Max: ${padNum(maxFps, 3, 1)})\nFrame: ${padNum(frameTimeMs, 3, 2)} ms`;
            }

            const se = seActiveCountRef.current;
            const sPerfect = se.perfect > 0 ? "Playing" : "Stopped";
            const sCritical = se.critical > 0 ? "Playing" : "Stopped";
            const sScratch = se.scratch > 0 ? "Playing" : "Stopped";
            const sHoldEnd = se.holdEnd > 0 ? "Playing" : "Stopped";
            const sHold = holdSourceRef.current ? "Playing" : "Stopped";
            const seDebugText = `\n[SE State] Perfect:${sPerfect} | Critical:${sCritical} | Scratch:${sScratch} | HoldEnd:${sHoldEnd} | Hold:${sHold}`;

            let mainDebugText = "";
            if (showDebugNotesRef.current) {
              // K. Access via getter
              const visibleNotes = rendererRef.current.getVisibleNotes();
              const noteLines: string[] = visibleNotes.map((n) => {
                const typeName = getNoteTypeName(n.noteType);
                const typeNumStr = n.noteType.toString().padStart(3, " ");
                const typeStr = `${typeNumStr}: ${typeName}`.padEnd(29, " ");
                const laneStr = n.lane.toString().padStart(2, " ");
                const widthStr = n.width.toString().padStart(2, " ");
                const tickStr = padNum(n.startTick, 3, 3);
                const endTickStr =
                  n.endTick > 0 && n.endTick !== n.startTick ? " ~" + padNum(n.endTick, 3, 3) : "";
                const gimmickStr =
                  n.gimmickValue !== 0 ? ` [G:${n.gimmickType} V:${n.gimmickValue}]` : "";
                const line = `[${typeStr}] L:${laneStr} W:${widthStr} T:${tickStr}${endTickStr}${gimmickStr}`;
                return line.padEnd(90, " ");
              });

              const MIN_ROWS = 20;
              while (noteLines.length < MIN_ROWS) {
                noteLines.push("".padEnd(90, " "));
              }
              mainDebugText = `\n----------------------------------------\nVisible Notes: ${padNum(visibleNotes.length, 3, 0)}\n${noteLines.join("\n")}`;
            }

            let type0DebugText = "";
            if (showDebugSplitsRef.current) {
              const currentTick = now - delaySecondsRef.current;
              // J. Binary search for NoteType0 debug overlay
              let t0Lo = 0,
                t0Hi = notes.length;
              const t0Target = currentTick - 1.0;
              while (t0Lo < t0Hi) {
                const mid = (t0Lo + t0Hi) >>> 1;
                if (notes[mid].startTick < t0Target) t0Lo = mid + 1;
                else t0Hi = mid;
              }
              const type0Lines: string[] = [];
              for (let ni = t0Lo; ni < notes.length && type0Lines.length < 20; ni++) {
                const n = notes[ni];
                if (n.noteType !== 0) continue;
                const tickStr = padNum(n.startTick, 3, 3);
                const endTickStr =
                  n.endTick > 0 && n.endTick !== n.startTick ? ` ~ ${padNum(n.endTick, 3, 3)}` : "";
                const gimmickStr =
                  n.gimmickValue !== 0 || n.gimmickType !== 0
                    ? ` [G:${n.gimmickType} V:${padNum(n.gimmickValue, 5, 0)}]`
                    : "";
                const line = `${gimmickStr} T:${tickStr}${endTickStr}`;
                type0Lines.push(line.padEnd(90, " "));
              }

              const MIN_ROWS = 10;
              while (type0Lines.length < MIN_ROWS) {
                type0Lines.push("".padEnd(90, " "));
              }
              type0DebugText = `\n----------------------------------------\nUpcoming Splits:\n${type0Lines.join("\n")}`;
            }

            debugOverlayRef.current.innerText = `${fpsText}${seDebugText}${mainDebugText}${type0DebugText}`;
          }
        }
      }
      requestRef.current = requestAnimationFrame(renderLoop);
    };

    requestRef.current = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(requestRef.current!);
      if (observer) observer.disconnect();
    };
  }, [isPlaying, notes, speed]);

  const ensureAudioContext = () => {
    if (!audioContextRef.current) {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const sounds = initSynthesizedSounds(ctx);
      perfectSoundRef.current = sounds.perfect;
      criticalSoundRef.current = sounds.critical;
      scratchSoundRef.current = sounds.scratch;
      holdSoundRef.current = sounds.hold;
      holdEndSoundRef.current = sounds.holdEnd;
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // reset state
    setError(null);
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current.disconnect();
    }
    if (holdSourceRef.current) {
      try {
        holdSourceRef.current.stop();
      } catch {}
      holdSourceRef.current.disconnect();
      holdSourceRef.current = null;
    }
    setIsPlaying(false);

    const loadedCsvs: { name: string; text: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith(".csv") || file.name.endsWith(".enc")) {
        const text = await file.text();
        if (file.name.includes("music_config")) {
          const lines = text.split("\n");
          if (lines.length > 1) {
            const headers = lines[0].split(",");
            const delayIdx = headers.findIndex((h) => h.trim() === "DelaySeconds");
            if (delayIdx !== -1) {
              const values = lines[1].split(",");
              if (values.length > delayIdx) {
                delaySecondsRef.current = parseFloat(values[delayIdx]) || 0;
              }
            }
          }
        } else {
          loadedCsvs.push({ name: file.name, text });
        }
      } else if (
        file.type.startsWith("audio/") ||
        file.name.endsWith(".wav") ||
        file.name.endsWith(".mp3")
      ) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const ctx = ensureAudioContext();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          audioBufferRef.current = audioBuffer;
          setAudioLoaded(true);
        } catch (err: any) {
          setError("Failed to load audio: " + err.message);
        }
      }
    }

    if (loadedCsvs.length > 0) {
      setCsvFiles(loadedCsvs);
      const parsedNotes = parseChart(loadedCsvs[0].text);
      setNotes(parsedNotes);
      setSelectedCsvFileName(loadedCsvs[0].name);
      setChartLoaded(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      }
      if (holdSourceRef.current) {
        try {
          holdSourceRef.current.stop();
        } catch {}
        holdSourceRef.current.disconnect();
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioBufferRef.current) return;
    const ctx = ensureAudioContext();

    if (isPlaying) {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      }
      if (holdSourceRef.current) {
        try {
          holdSourceRef.current.stop();
        } catch {}
        holdSourceRef.current.disconnect();
        holdSourceRef.current = null;
      }
      pauseTimeRef.current = ctx.currentTime - startTimeRef.current;
      setIsPlaying(false);
    } else {
      const source = ctx.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(ctx.destination);

      startTimeRef.current = ctx.currentTime - pauseTimeRef.current;
      source.start(0, pauseTimeRef.current);
      audioSourceRef.current = source;
      setIsPlaying(true);
    }
  };

  const seek = (time: number) => {
    const duration = audioBufferRef.current
      ? audioBufferRef.current.duration
      : notes.length > 0
        ? notes[notes.length - 1].startTick
        : 100;
    const newTime = Math.max(0, Math.min(time, duration));

    if (isPlaying && audioContextRef.current) {
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.stop();
        } catch {}
        audioSourceRef.current.disconnect();
      }
      if (holdSourceRef.current) {
        try {
          holdSourceRef.current.stop();
        } catch {}
        holdSourceRef.current.disconnect();
        holdSourceRef.current = null;
      }
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current!;
      source.connect(audioContextRef.current.destination);
      startTimeRef.current = audioContextRef.current.currentTime - newTime;
      source.start(0, newTime);
      audioSourceRef.current = source;
    }

    pauseTimeRef.current = newTime;
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
  };
  seekRef.current = seek;

  return (
    <div className="flex flex-col flex-1 h-screen overflow-hidden bg-black">
      <div className="relative flex-1 flex flex-col bg-white/5 border border-white/10 backdrop-blur-md rounded-[20px] p-4 lg:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] overflow-y-auto lg:overflow-visible m-4">
        {error && <div className="p-4 lg:p-8 text-red-500 font-semibold">Error: {error}</div>}

        {!chartLoaded && !audioLoaded ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <h2 className="text-xl text-white font-bold">Select files to load</h2>
            <p className="text-gray-300">
              Please select both Chart (.csv) and Audio (.wav/.mp3) files together.
            </p>
            <input
              type="file"
              multiple
              accept=".csv,.enc,.wav,.mp3,.m4a,.ogg,audio/*"
              onChange={handleFileDrop}
              className="mt-4 p-2 bg-white/10 border border-white/20 text-white rounded cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#ff528a] file:text-white hover:file:bg-[#ff528a]/80"
            />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 flex-1 min-h-0">
            <ChartCanvas
              canvasRef={canvasRef}
              hasNotes={notes.length > 0}
              currentCombo={currentCombo}
              maxCombo={maxCombo}
            />

            <ChartControls
              csvFiles={csvFiles}
              selectedCsvFileName={selectedCsvFileName}
              onCsvSelect={(name, text) => {
                const parsedNotes = parseChart(text);
                setNotes(parsedNotes);
                setSelectedCsvFileName(name);
                setChartLoaded(true);
              }}
              currentTime={currentTime}
              duration={
                audioBufferRef.current
                  ? audioBufferRef.current.duration
                  : notes.length > 0
                    ? notes[notes.length - 1].startTick
                    : 100
              }
              isPlaying={isPlaying}
              audioLoaded={audioLoaded}
              chartLoaded={chartLoaded}
              speed={speed}
              showSimLines={showSimLines}
              onSeek={seek}
              onTogglePlay={togglePlay}
              onSpeedChange={setSpeed}
              onToggleSimLines={setShowSimLines}
              freqCanvasRef={freqCanvasRef}
            />
          </div>
        )}
      </div>

      <DebugOverlay
        showDebug={showDebug}
        isPlaying={isPlaying}
        audioLoaded={audioLoaded}
        chartLoaded={chartLoaded}
        notesCount={notes.length}
        debugOverlayRef={debugOverlayRef as React.RefObject<HTMLPreElement>}
      />
    </div>
  );
}
