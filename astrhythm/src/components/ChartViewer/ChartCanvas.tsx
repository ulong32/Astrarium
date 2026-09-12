import type { RefObject } from "react";

export interface ChartCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hasNotes: boolean;
  currentCombo: number;
  maxCombo: number;
}

export function ChartCanvas({ canvasRef, hasNotes, currentCombo, maxCombo }: ChartCanvasProps) {
  return (
    <div className="flex-1 flex justify-center min-w-0 min-h-[70vh] lg:min-h-0 overflow-hidden">
      <div className="relative w-full max-w-125 bg-black/20 rounded-xl border border-white/5 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
        {hasNotes && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center z-10">
            <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-[#00ff88]/30 shadow-[0_0_15px_rgba(0,255,136,0.2)] flex items-baseline gap-2">
              <span
                key={currentCombo}
                className="inline-block text-2xl font-black text-[#00ff88] tracking-wider drop-shadow-[0_0_8px_rgba(0,255,136,0.6)] animate-combo-pop"
              >
                {currentCombo.toString().padStart(Math.max(3, maxCombo.toString().length), " ")}
              </span>
              <span className="text-white/40 text-sm font-semibold">/</span>
              <span className="text-white/80 text-lg font-bold">{maxCombo}</span>
              <span className="text-xs font-black tracking-widest text-[#00ff88] ml-1 uppercase">
                COMBO
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
