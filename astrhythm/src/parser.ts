// gimmickType string → number mapping (applied at parse time)
const GIMMICK_TYPE_MAP: Record<string, number> = {
  JumpScratch: 1,
};

export interface Note {
  startTick: number;
  endTick: number;
  noteType: number;
  lane: number;
  width: number;
  gimmickType: number;
  gimmickValue: number;
}

export function parseChart(csvContent: string): Note[] {
  const lines = csvContent.split("\n");
  const notes: Note[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(",");
    if (parts.length >= 7) {
      const rawGimmick = parts[5].trim();
      const parsedNum = parseInt(rawGimmick, 10);
      const gimmickType = isNaN(parsedNum) ? (GIMMICK_TYPE_MAP[rawGimmick] ?? 0) : parsedNum;

      notes.push({
        startTick: parseFloat(parts[0]),
        endTick: parseFloat(parts[1]),
        noteType: parseInt(parts[2], 10),
        lane: parseInt(parts[3], 10),
        width: parseInt(parts[4], 10),
        gimmickType,
        gimmickValue: parseInt(parts[6], 10) || 0,
      });
    }
  }

  // Sort by startTick to ensure correct rendering order (though usually CSV is already sorted)
  notes.sort((a, b) => a.startTick - b.startTick);

  return notes;
}
