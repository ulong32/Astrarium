import type { RefObject } from "react";

export interface DebugOverlayProps {
  showDebug: boolean;
  isPlaying: boolean;
  audioLoaded: boolean;
  chartLoaded: boolean;
  notesCount: number;
  debugOverlayRef: RefObject<HTMLPreElement>;
}

export function DebugOverlay({
  showDebug,
  isPlaying,
  audioLoaded,
  chartLoaded,
  notesCount,
  debugOverlayRef,
}: DebugOverlayProps) {
  if (!chartLoaded && !audioLoaded) return null;

  return (
    <div
      className={`${showDebug ? "fixed" : "hidden"} bottom-6 right-6 p-2.5 bg-[#050812]/85 backdrop-blur-md border border-[#00ff88]/35 rounded-lg text-[#00ff88] font-mono text-xs leading-relaxed z-1000 shadow-[0_4px_20px_rgba(0,0,0,0.6)] flex flex-col maxHeight-[40vh] pointer-events-none`}
    >
      <div className={`${showDebug ? "border-b border-[#00ff88]/35 pb-2 mb-2" : ""}`}>
        DEBUG OVERLAY : [D] Toggle All, [N] Notes, [S] Splits, [←/→] Seek 5s
        <br />
        Playback: {isPlaying ? "Playing" : "Stopped"}
        <br />
        Audio: {audioLoaded ? "Loaded" : "Missing"}
        <br />
        Chart: {chartLoaded ? `Loaded (${notesCount} notes)` : "Missing"}
        <br />
      </div>
      <pre
        ref={debugOverlayRef}
        className={`m-0 p-0 font-mono text-xs bg-transparent border-none text-inherit overflow-y-auto whitespace-pre-wrap text-left pointer-events-auto`}
      />
    </div>
  );
}
