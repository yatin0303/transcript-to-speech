namespace VideoTranscriptVoiceover {
  export namespace transcript {
    function timestamp(value: string): number {
      const parts = value.trim().replace(",", ".").split(":").map(Number);
      if (parts.some(Number.isNaN)) return NaN;
      return parts.reduce((seconds, part) => seconds * 60 + part, 0);
    }

    function endsSentence(text: string): boolean {
      const trimmed = text.trim();
      if (/[!?…]["')\]]*$/.test(trimmed)) return true;
      if (!/\.["')\]]*$/.test(trimmed)) return false;
      // Avoid splitting after common abbreviations such as "Dr." and "e.g.".
      return !/\b(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|e\.g|i\.e)\.["')\]]*$/i.test(trimmed);
    }

    export function groupSentenceCues(cues: readonly Cue[]): Cue[] {
      const grouped: Cue[] = [];
      for (const cue of [...cues].sort((a, b) => a.start - b.start)) {
        const previous = grouped.at(-1);
        const canContinue = previous && !endsSentence(previous.text);
        if (canContinue) {
          previous.end = Math.max(previous.end, cue.end);
          previous.text = `${previous.text} ${cue.text}`.replace(/\s+/g, " ").trim();
        } else {
          grouped.push({ ...cue });
        }
      }
      return grouped;
    }

    function parseVtt(source: string): Cue[] {
      const blocks = source.replace(/^\uFEFF?WEBVTT[^\n]*\n?/i, "").trim().split(/\n\s*\n/);
      const cues: Cue[] = [];
      for (const block of blocks) {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const timingIndex = lines.findIndex((line) => line.includes("-->"));
        if (timingIndex < 0) continue;
        const timingLine = lines[timingIndex];
        if (!timingLine) continue;
        const [startRaw = "", endRaw = ""] = timingLine.split("-->");
        const start = timestamp(startRaw);
        const end = timestamp(endRaw.trim().split(/\s+/)[0] ?? "");
        const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
        if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) {
          cues.push({ start, end, text });
        }
      }
      return groupSentenceCues(cues);
    }

    // This is the format produced by copying most video transcript panels, including YouTube:
    // 0:00\nWelcome...\n0:04\nNext line...
    function parseCopiedTranscript(source: string): Cue[] {
      const entries: TranscriptEntry[] = [];
      let current: TranscriptEntry | null = null;
      for (const rawLine of source.replace(/\r/g, "").split("\n")) {
        const line = rawLine.trim();
        const match = line.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*(.*)$/);
        if (match) {
          if (current) entries.push(current);
          const hours = Number(match[1] || 0);
          const minutes = Number(match[2]);
          const seconds = Number(match[3]);
          const fraction = Number(`0.${match[4] || 0}`);
          current = {
            start: hours * 3600 + minutes * 60 + seconds + fraction,
            text: (match[5] || "").trim(),
          };
        } else if (current && line) {
          current.text = `${current.text} ${line}`.trim();
        }
      }
      if (current) entries.push(current);
      return groupSentenceCues(entries
        .map((entry, index) => ({ ...entry, end: entries[index + 1]?.start ?? entry.start + 5 }))
        .filter((cue) => cue.text && cue.end > cue.start));
    }

    export function parse(source: string): Cue[] {
      const vttCues = parseVtt(source);
      return vttCues.length ? vttCues : parseCopiedTranscript(source);
    }
  }
}
