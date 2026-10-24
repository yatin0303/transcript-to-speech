(() => {
  const { transcript, captions, panel, PlaybackController } = VideoTranscriptVoiceover;
  const ui = panel.create();
  const playback = new PlaybackController({ onMetadata: updateNativeButton });
  const NATIVE_LOAD_INTERVAL_MS = 250;
  const NATIVE_LOAD_MAX_ATTEMPTS = 40;
  let nativeLoadTimer: number | null = null;
  let bubbleEnabled = false;
  let settingsRevision = 0;

  function applyBubbleEnabled(enabled: boolean): void {
    bubbleEnabled = enabled;
    ui.panel.hidden = !enabled;
    if (!enabled) {
      clearNativeLoadTimer();
      playback.stop();
      playback.attach(null);
      ui.card.hidden = true;
      ui.toggle.setAttribute("aria-expanded", "false");
      ui.start.disabled = !playback.cues.length;
      ui.stop.disabled = true;
      ui.nativeCaptions.disabled = false;
      ui.status.textContent = "Voiceover stopped.";
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.bubbleEnabled) return;
    settingsRevision++;
    applyBubbleEnabled(changes.bubbleEnabled.newValue !== false);
  });

  const initialRevision = settingsRevision;
  void chrome.storage.local.get({ bubbleEnabled: true }).then((settings) => {
    if (settingsRevision === initialRevision) applyBubbleEnabled(settings.bubbleEnabled !== false);
  }).catch(() => {
    // Keep the bubble out of the way if the saved preference cannot be read.
  });

  function attachCurrentVideo(): HTMLVideoElement | null {
    playback.attach(captions.findVideo());
    return playback.video;
  }

  function updateNativeButton(video: HTMLVideoElement | null = captions.findVideo()): void {
    const hasTracks = captions.hasTracks(video);
    ui.nativeCaptions.disabled = !hasTracks;
    ui.nativeCaptions.title = hasTracks
      ? "Load captions supplied by this video"
      : "This video does not expose a caption track";
  }

  function importNativeCaptions(): number {
    playback.cues = captions.fromVideo(attachCurrentVideo());
    return playback.cues.length;
  }

  function showCaptionsLoaded(count: number): void {
    ui.nativeCaptions.disabled = false;
    ui.start.disabled = false;
    ui.status.textContent = `${count} captions loaded from the video.`;
  }

  function clearNativeLoadTimer(): void {
    if (nativeLoadTimer !== null) window.clearInterval(nativeLoadTimer);
    nativeLoadTimer = null;
  }

  function waitForNativeCaptions(): void {
    clearNativeLoadTimer();
    let attempts = 0;
    nativeLoadTimer = window.setInterval(() => {
      const count = importNativeCaptions();
      if (count) {
        clearNativeLoadTimer();
        showCaptionsLoaded(count);
      } else if (++attempts >= NATIVE_LOAD_MAX_ATTEMPTS) {
        clearNativeLoadTimer();
        ui.nativeCaptions.disabled = false;
        ui.status.textContent = "Captions did not load. Paste the copied transcript instead.";
      }
    }, NATIVE_LOAD_INTERVAL_MS);
  }

  function populateVoices(): void {
    playback.voiceURI = panel.populateVoices(ui.voice, playback.voiceURI);
  }

  ui.toggle.onclick = () => {
    ui.card.hidden = !ui.card.hidden;
    ui.toggle.setAttribute("aria-expanded", String(!ui.card.hidden));
    if (!ui.card.hidden) {
      attachCurrentVideo();
      updateNativeButton();
    }
  };

  ui.close.onclick = () => {
    ui.card.hidden = true;
    ui.toggle.setAttribute("aria-expanded", "false");
  };

  ui.vtt.oninput = () => {
    playback.cues = transcript.parse(ui.vtt.value);
    ui.start.disabled = !playback.cues.length;
    ui.status.textContent = playback.cues.length
      ? `${playback.cues.length} caption cues ready.`
      : "Paste timestamps such as 0:00 followed by the spoken text.";
  };

  ui.nativeCaptions.onclick = async () => {
    if (!bubbleEnabled) return;
    const loadRevision = settingsRevision;
    ui.nativeCaptions.disabled = true;
    ui.status.textContent = "Loading the video’s caption track…";
    const cues = await captions.fromFile(attachCurrentVideo());
    if (!bubbleEnabled || settingsRevision !== loadRevision) return;
    let count = cues.length;
    if (count) playback.cues = cues;
    else count = importNativeCaptions();

    if (count) {
      showCaptionsLoaded(count);
    } else if (playback.video?.textTracks.length) {
      waitForNativeCaptions();
    } else {
      ui.nativeCaptions.disabled = false;
      ui.status.textContent = "No readable captions were found. Paste the copied transcript instead.";
    }
  };

  ui.voice.onchange = () => { playback.voiceURI = ui.voice.value; };
  ui.rate.oninput = () => {
    playback.rate = Number(ui.rate.value);
    ui.rateOutput.value = `${playback.rate.toFixed(1)}×`;
    playback.resetSpeech();
  };
  ui.offset.oninput = () => {
    playback.offset = Number(ui.offset.value);
    playback.resetSpeech();
  };

  ui.start.onclick = async () => {
    if (!bubbleEnabled) return;
    if (!attachCurrentVideo()) {
      ui.status.textContent = "No HTML5 video found on this page.";
      return;
    }
    ui.start.disabled = true;
    ui.stop.disabled = false;
    ui.status.textContent = "Voiceover follows the video. Seeking resets the voice.";
    if (!await playback.start()) {
      ui.status.textContent = "Voiceover is ready. Press play on the video to begin.";
    }
  };

  ui.stop.onclick = () => {
    playback.stop();
    ui.start.disabled = !playback.cues.length;
    ui.stop.disabled = true;
    ui.status.textContent = "Voiceover stopped.";
  };

  populateVoices();
  speechSynthesis.onvoiceschanged = populateVoices;
})();
