export type NoteCategory = "tap" | "hold" | "flick" | "ignore";

export interface NoteCategoryConfig {
  id: NoteCategory;
  name: string;
  color: string;
}

export const NOTE_CATEGORIES: Record<NoteCategory, NoteCategoryConfig> = {
  tap: { id: "tap", name: "Tap系", color: "#ff4d4d" }, // 赤
  hold: { id: "hold", name: "Hold系", color: "#338aff" }, // 青
  flick: { id: "flick", name: "Flick/ScratchHold系", color: "#9d52ff" }, // 紫
  ignore: { id: "ignore", name: "除外", color: "transparent" },
};

/**
 * ノーツ種別 (noteType) からカテゴリへのマッピング。
 * ノーツ種別を追加・移動・変更したい場合はこのテーブルを編集してください。
 */
export const NOTE_TYPE_CATEGORY_MAP: Record<number, NoteCategory> = {
  // Tap系 (赤)
  10: "tap", // Normal
  20: "tap", // Critical
  200: "tap", // BlueTap

  // Hold系 (青)
  30: "hold", // Sound (30: Hold)
  80: "hold", // HoldStart
  81: "hold", // CriticalHoldStart
  100: "hold", // Hold
  101: "hold", // CriticalHold

  // Flick, ScratchHold系 (紫)
  31: "flick", // SoundPurple (31: Flick)
  40: "flick", // Scratch
  50: "flick", // Flick
  82: "flick", // ScratchHoldStart
  83: "flick", // ScratchCriticalHoldStart
  110: "flick", // ScratchHold
  111: "flick", // ScratchCriticalHold

  // 除外
  0: "ignore",
  900: "ignore", // HoldEighth (とりあえず除外)
};

export function getNoteCategory(noteType: number): NoteCategory {
  return NOTE_TYPE_CATEGORY_MAP[noteType] ?? "ignore";
}
