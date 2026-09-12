import type { RefObject } from "react";
import { Play, Pause, SkipBack, Rewind, FastForward } from "lucide-react";

export interface ChartControlsProps {
  csvFiles: { name: string; text: string }[];
  selectedCsvFileName: string;
  onCsvSelect: (name: string, text: string) => void;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  audioLoaded: boolean;
  chartLoaded: boolean;
  speed: number;
  showSimLines: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onToggleSimLines: (show: boolean) => void;
  freqCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export function ChartControls({
  csvFiles,
  selectedCsvFileName,
  onCsvSelect,
  currentTime,
  duration,
  isPlaying,
  audioLoaded,
  chartLoaded,
  speed,
  showSimLines,
  onSeek,
  onTogglePlay,
  onSpeedChange,
  onToggleSimLines,
  freqCanvasRef,
}: ChartControlsProps) {
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full lg:w-72 shrink-0 flex flex-col gap-4 lg:gap-6">
      {csvFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Chart Difficulty
          </label>
          <div className="flex gap-2 flex-wrap">
            {csvFiles.map((f) => {
              let btnName = f.name;
              let btnColor = "#757575";
              switch (f.name) {
                case "1.csv":
                  btnName = "Normal";
                  btnColor = "#2196f3";
                  break;
                case "2.csv":
                  btnName = "Hard";
                  btnColor = "#ff9800";
                  break;
                case "3.csv":
                  btnName = "Extra";
                  btnColor = "#e91e63";
                  break;
                case "4.csv":
                  btnName = "Stella";
                  btnColor = "#9c27b0";
                  break;
                case "5.csv":
                  btnName = "Olivier";
                  btnColor = "#000000";
                  break;
              }
              const isSelected = selectedCsvFileName === f.name;
              return (
                <button
                  key={f.name}
                  onClick={() => onCsvSelect(f.name, f.text)}
                  className={`px-3 py-1.5 rounded text-sm font-bold cursor-pointer transition-all ${
                    isSelected
                      ? "border-2 border-white text-white shadow-md"
                      : "border border-white/20 bg-black/50 hover:bg-white/10"
                  }`}
                  style={{
                    backgroundColor: isSelected ? btnColor : undefined,
                    color: isSelected ? "#fff" : btnColor === "#000000" ? "#ccc" : btnColor,
                    boxShadow: isSelected
                      ? btnColor === "#000000"
                        ? "0 0 10px rgba(255, 255, 255, 0.4)"
                        : `0 0 10px ${btnColor}80`
                      : undefined,
                  }}
                >
                  {btnName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 p-4 rounded-lg border border-white/5">
        <div className="flex flex-col items-center justify-between gap-2">
          <div className="text-lg font-bold font-mono text-white my-0 px-2 py-1 bg-white/10 rounded tracking-tight">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onSeek(0)}
              disabled={!audioLoaded || !chartLoaded}
              className="p-2 flex items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white cursor-pointer hover:bg-primary hover:border-primary hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Restart"
            >
              <SkipBack size={20} />
            </button>
            <button
              onClick={() => onSeek(currentTime - 5)}
              disabled={!audioLoaded || !chartLoaded}
              className="p-2 flex items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white cursor-pointer hover:bg-primary hover:border-primary hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="-5s"
            >
              <Rewind size={20} />
            </button>
            <button
              onClick={onTogglePlay}
              disabled={!audioLoaded || !chartLoaded}
              className={`p-2 w-12.5 flex items-center justify-center rounded-lg border-none text-black cursor-pointer font-semibold active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isPlaying ? "bg-red-400 hover:bg-red-500" : "bg-green-400 hover:bg-green-300"
              }`}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={() => onSeek(currentTime + 5)}
              disabled={!audioLoaded || !chartLoaded}
              className="p-2 flex items-center justify-center rounded-lg border border-white/20 bg-white/10 text-white cursor-pointer hover:bg-primary hover:border-primary hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="+5s"
            >
              <FastForward size={20} />
            </button>
          </div>
        </div>

        <div className="relative">
          <canvas
            ref={freqCanvasRef}
            width={600}
            height={48}
            className="w-full h-12 block -mb-2 rounded"
          />
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full relative z-10 cursor-pointer seek-slider scale-x-108 translate-y-1.5"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          Scroll Speed: {speed.toFixed(1)}x ({Math.round(1700 / speed)} ms)
        </label>
        <input
          type="range"
          min="0.5"
          max="5.0"
          step="0.1"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-primary"
        />
      </div>

      <div className="flex items-center mt-2">
        <input
          type="checkbox"
          id="simLinesToggle"
          checked={showSimLines}
          onChange={(e) => onToggleSimLines(e.target.checked)}
          className="mr-2 cursor-pointer accent-primary"
        />
        <label
          htmlFor="simLinesToggle"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer select-none"
        >
          Show Simultaneous Lines
        </label>
      </div>
    </div>
  );
}
