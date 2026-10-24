namespace VideoTranscriptVoiceover {
  export namespace captions {
    const { parse, groupSentenceCues } = transcript;
    const CAPTION_KINDS = ["captions", "subtitles"];

    export function findVideo(): HTMLVideoElement | null {
      const videos = [...document.querySelectorAll("video")];
      return videos.find((video) => video.offsetParent !== null) || videos[0] || null;
    }

    export function hasTracks(video: HTMLVideoElement | null): boolean {
      return Boolean(video && [...video.textTracks].some((track) => CAPTION_KINDS.includes(track.kind)));
    }

    export function fromVideo(video: HTMLVideoElement | null): Cue[] {
      if (!video) return [];
      const tracks = [...video.textTracks];
      const track = tracks.find((item) => item.mode === "showing")
        || tracks.find((item) => CAPTION_KINDS.includes(item.kind));
      if (!track) return [];

      // Disabled tracks may not expose their cues until they are made active.
      if (track.mode === "disabled") track.mode = "hidden";
      return groupSentenceCues([...(track.cues || [])]
        .filter((cue): cue is VTTCue => "text" in cue && typeof cue.text === "string")
        .map((cue) => ({
          start: cue.startTime,
          end: cue.endTime,
          text: cue.text.replace(/<[^>]+>/g, " ").trim(),
        }))
        .filter((cue) => cue.text && cue.end > cue.start));
    }

    export async function fromFile(video: HTMLVideoElement | null): Promise<Cue[]> {
      const trackElement = video?.querySelector<HTMLTrackElement>('track[kind="subtitles"], track[kind="captions"]');
      if (!trackElement?.src) return [];

      try {
        const response = await fetch(trackElement.src);
        if (!response.ok) throw new Error(`Subtitle request failed (${response.status})`);
        const source = await response.text();
        if (!/^#EXTM3U/m.test(source)) return parse(source);

        // HLS subtitle manifests reference one or more WebVTT files.
        const urls = source.split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
          .map((line) => new URL(line, trackElement.src).href);
        const parts = await Promise.all(urls.map(async (url) => {
          const part = await fetch(url);
          return part.ok ? part.text() : "";
        }));
        return parse(parts.join("\n\n"));
      } catch (error) {
        console.warn("[Video Transcript Voiceover] Could not load caption file.", error);
        return [];
      }
    }
  }
}
