namespace VideoTranscriptVoiceover {
  export namespace panel {
    export function create(): PanelElements {
      const panel = document.createElement("section");
      panel.id = "vtv-panel";
      panel.hidden = true;
      panel.innerHTML = `
        <button id="vtv-toggle" aria-expanded="false">🔊 Voiceover</button>
        <div id="vtv-card" hidden>
          <div class="vtv-heading">
            <strong>Transcript voiceover</strong>
            <button id="vtv-close" aria-label="Close">×</button>
          </div>
          <p>Load the video’s captions, or paste WebVTT / a copied timestamped transcript.</p>
          <button id="vtv-native" type="button">Use video captions</button>
          <textarea id="vtv-vtt" spellcheck="false" placeholder="Paste WebVTT, or: \n0:00 Hello there\n0:04 The next caption"></textarea>
          <label>Voice <select id="vtv-voice"></select></label>
          <div class="vtv-options">
            <label>
              Rate <input id="vtv-rate" type="range" min="0.5" max="2" value="1" step="0.1"><output id="vtv-rate-output">1.0×</output>
            </label>
            <label>
              Offset <input id="vtv-offset" type="number" min="-10" max="10" step="0.1" value="0"> sec
            </label>
          </div>
          <div class="vtv-actions">
            <button id="vtv-start" disabled>Start voiceover</button>
            <button id="vtv-stop" disabled>Stop</button>
          </div>
          <small id="vtv-status">Choose a video, then add timestamped captions.</small>
        </div>`;
      document.documentElement.append(panel);

      function requiredElement<T extends HTMLElement>(selector: string): T {
        const element = panel.querySelector<T>(selector);
        if (!element) throw new Error(`Missing voiceover control: ${selector}`);
        return element;
      }
      const card = requiredElement<HTMLDivElement>("#vtv-card");
      const toggle = requiredElement<HTMLButtonElement>("#vtv-toggle");
      const start = requiredElement<HTMLButtonElement>("#vtv-start");
      const stop = requiredElement<HTMLButtonElement>("#vtv-stop");
      const status = requiredElement<HTMLElement>("#vtv-status");
      const vtt = requiredElement<HTMLTextAreaElement>("#vtv-vtt");
      const nativeCaptions = requiredElement<HTMLButtonElement>("#vtv-native");
      const voice = requiredElement<HTMLSelectElement>("#vtv-voice");
      const rate = requiredElement<HTMLInputElement>("#vtv-rate");
      const offset = requiredElement<HTMLInputElement>("#vtv-offset");

      const rateOutput = requiredElement<HTMLOutputElement>("#vtv-rate-output");

      return {
        panel, card, toggle, close: requiredElement<HTMLButtonElement>("#vtv-close"), start, stop,
        status, vtt, nativeCaptions, voice, rate, rateOutput, offset,
      };
    }

    export function populateVoices(voice: HTMLSelectElement, preferredVoiceURI = ""): string {
      const selected = preferredVoiceURI || voice.value || "system:en-US";
      const supported = speechSynthesis.getVoices()
        .filter((item) => /^(en|hi)(-|$)/i.test(item.lang))
        .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
      voice.replaceChildren();
      const voiceGroups = [
        ["English", "en", "system:en-US"],
        ["Hindi", "hi", "system:hi-IN"],
      ] as const;
      for (const [label, prefix, fallback] of voiceGroups) {
        const choices = supported.filter((item) => item.lang.toLowerCase().startsWith(prefix));
        const group = document.createElement("optgroup");
        group.label = label;
        group.append(new Option(`System default (${label})`, fallback));
        choices.forEach((item) => group.append(new Option(`${item.name} (${item.lang})`, item.voiceURI)));
        voice.add(group);
      }
      voice.disabled = false;
      voice.value = [...voice.options].some((item) => item.value === selected) ? selected : "system:en-US";
      return voice.value;
    }
  }
}
