declare namespace VideoTranscriptVoiceover {
  interface Cue {
    start: number;
    end: number;
    text: string;
  }

  interface TranscriptEntry {
    start: number;
    text: string;
  }

  interface PlaybackOptions {
    onMetadata?: (video: HTMLVideoElement | null) => void;
  }

  interface PanelElements {
    panel: HTMLElement;
    card: HTMLDivElement;
    toggle: HTMLButtonElement;
    close: HTMLButtonElement;
    start: HTMLButtonElement;
    stop: HTMLButtonElement;
    status: HTMLElement;
    vtt: HTMLTextAreaElement;
    nativeCaptions: HTMLButtonElement;
    voice: HTMLSelectElement;
    rate: HTMLInputElement;
    rateOutput: HTMLOutputElement;
    offset: HTMLInputElement;
  }
}
