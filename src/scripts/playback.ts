namespace VideoTranscriptVoiceover {
  const SYNC_INTERVAL_MS = 125;

  export class PlaybackController {
    video: HTMLVideoElement | null = null;
    cues: Cue[] = [];
    enabled = false;
    activeCue = -1;
    completedCue = -1;
    speechInProgress = false;
    offset = 0;
    rate = 1;
    voiceURI = "";
    private timer: number | null = null;
    private readonly listeners: Record<string, EventListener>;

    constructor({ onMetadata = () => {} }: PlaybackOptions = {}) {
      this.listeners = {
        seeked: () => this.resetSpeech(),
        pause: () => speechSynthesis.pause(),
        play: () => {
          speechSynthesis.resume();
          this.sync();
        },
        ended: () => this.resetSpeech(),
        loadedmetadata: () => onMetadata(this.video),
      };
    }

    attach(video: HTMLVideoElement | null): void {
      if (this.video === video) return;
      for (const [event, listener] of Object.entries(this.listeners)) {
        this.video?.removeEventListener(event, listener);
      }
      this.video = video;
      for (const [event, listener] of Object.entries(this.listeners)) {
        this.video?.addEventListener(event, listener);
      }
    }

    private speakCue(index: number): void {
      if (index < 0 || index === this.activeCue || index === this.completedCue || !this.enabled) return;
      const cue = this.cues[index];
      if (!cue) return;
      this.activeCue = index;
      this.speechInProgress = true;

      const utterance = new SpeechSynthesisUtterance(cue.text);
      utterance.rate = this.rate;
      if (this.voiceURI.startsWith("system:")) {
        utterance.lang = this.voiceURI.slice("system:".length);
      } else if (this.voiceURI) {
        utterance.voice = speechSynthesis.getVoices().find((voice) => voice.voiceURI === this.voiceURI) || null;
      }

      const finishCue = () => {
        if (this.activeCue !== index) return;
        this.activeCue = -1;
        this.completedCue = index;
        this.speechInProgress = false;
        this.sync();
      };
      utterance.onend = finishCue;
      utterance.onerror = finishCue;
      speechSynthesis.speak(utterance);
    }

    sync(): void {
      if (!this.enabled || !this.video || this.video.paused) return;
      const time = this.video.currentTime + this.offset;
      const index = this.cues.findIndex((cue) => time >= cue.start && time < cue.end);

      // Let the current phrase finish, then resume at the video's current cue.
      if (index === this.activeCue || this.speechInProgress || index === this.completedCue) return;
      this.speakCue(index);
    }

    resetSpeech(): void {
      this.activeCue = -1;
      this.completedCue = -1;
      this.speechInProgress = false;
      speechSynthesis.cancel();
      if (this.enabled) this.sync();
    }

    async start(): Promise<boolean> {
      const video = this.video;
      if (!video) return false;
      this.enabled = false;
      this.resetSpeech();
      this.enabled = true;
      if (!this.timer) this.timer = window.setInterval(() => this.sync(), SYNC_INTERVAL_MS);

      // Keep speech and media inside the same user gesture.
      speechSynthesis.resume();
      if (video.paused) {
        try {
          await video.play();
        } catch {
          return false;
        }
      }
      this.sync();
      return true;
    }

    stop(): void {
      this.enabled = false;
      this.resetSpeech();
      if (this.timer !== null) window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}
