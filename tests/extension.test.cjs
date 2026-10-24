const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
const scripts = manifest.content_scripts[0].js;
const entryPoint = scripts.at(-1);
const plain = (value) => JSON.parse(JSON.stringify(value));

function createEnvironment(overrides = {}) {
  const spoken = [];
  const timers = new Map();
  const calls = { pause: 0, resume: 0, cancel: 0 };
  let timerId = 0;
  const context = vm.createContext({
    URL,
    console: { warn() {} },
    document: { querySelectorAll: () => [] },
    window: {
      setInterval(callback, delay) {
        timers.set(++timerId, { callback, delay });
        return timerId;
      },
      clearInterval(id) { timers.delete(id); },
    },
    speechSynthesis: {
      getVoices: () => [],
      speak: (utterance) => spoken.push(utterance),
      pause() { calls.pause++; },
      resume() { calls.resume++; },
      cancel() { calls.cancel++; },
    },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    ...overrides,
  });
  function load(file) {
    vm.runInContext(readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  scripts.filter((file) => file !== entryPoint).forEach(load);
  return { api: context.VideoTranscriptVoiceover, spoken, timers, calls, load };
}

function createVideo() {
  const video = new EventTarget();
  Object.assign(video, {
    paused: true,
    currentTime: 0,
    textTracks: [],
    offsetParent: {},
    querySelector: () => null,
    async play() {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
    },
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    },
  });
  return video;
}

const cues = [
  { start: 0, end: 4, text: "First sentence." },
  { start: 4, end: 8, text: "Second sentence." },
];

test("every declared extension asset exists", () => {
  for (const file of [...scripts, ...manifest.content_scripts[0].css]) {
    assert.ok(existsSync(path.join(root, file)), file);
  }
});

test("WebVTT parsing preserves timings and groups sentence fragments", () => {
  const { api } = createEnvironment();
  const result = api.transcript.parse(
    "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n<b>Hello</b>\n\n"
    + "2\n00:00:02.000 --> 00:00:04.000 align:start\nthere.\n\n"
    + "3\n00:00:05.000 --> 00:00:06.000\nWelcome!",
  );
  assert.deepEqual(plain(result), [
    { start: 1, end: 4, text: "Hello there." },
    { start: 5, end: 6, text: "Welcome!" },
  ]);
});

test("copied transcripts support hours, fractions, and multiline text", () => {
  const { api } = createEnvironment();
  assert.deepEqual(plain(api.transcript.parse("1:02:03.250\nHello\nthere.\n1:02:05 Next!")), [
    { start: 3723.25, end: 3725, text: "Hello there." },
    { start: 3725, end: 3730, text: "Next!" },
  ]);
  assert.deepEqual(plain(api.transcript.parse("No timestamps here.")), []);
});

test("abbreviations stay with the following sentence fragment", () => {
  const { api } = createEnvironment();
  assert.deepEqual(plain(api.transcript.parse("0:00 Dr.\n0:01 Smith is here.\n0:03 Welcome!")), [
    { start: 0, end: 3, text: "Dr. Smith is here." },
    { start: 3, end: 8, text: "Welcome!" },
  ]);
});

test("native caption loading activates a disabled track and filters invalid cues", () => {
  const { api } = createEnvironment();
  const track = { kind: "subtitles", mode: "disabled", cues: [
    { startTime: 0, endTime: 2, text: "<b>Hello.</b>" },
    { startTime: 2, endTime: 2, text: "Invalid." },
  ] };
  assert.deepEqual(plain(api.captions.fromVideo({ textTracks: [track] })), [
    { start: 0, end: 2, text: "Hello." },
  ]);
  assert.equal(track.mode, "hidden");
  assert.deepEqual(plain(api.captions.fromVideo(null)), []);
});

test("caption file loading resolves HLS segments in order", async () => {
  const requested = [];
  const files = {
    "https://example.test/captions/index.m3u8": "#EXTM3U\n#EXTINF:2\nfirst.vtt\nsecond.vtt",
    "https://example.test/captions/first.vtt": "WEBVTT\n\n00:00.000 --> 00:02.000\nHello.",
    "https://example.test/captions/second.vtt": "WEBVTT\n\n00:02.000 --> 00:04.000\nAgain!",
  };
  const { api } = createEnvironment({ fetch: async (url) => {
    requested.push(url);
    return { ok: true, text: async () => files[url] };
  } });
  const video = { querySelector: () => ({ src: "https://example.test/captions/index.m3u8" }) };
  assert.deepEqual(plain(await api.captions.fromFile(video)), [
    { start: 0, end: 2, text: "Hello." },
    { start: 2, end: 4, text: "Again!" },
  ]);
  assert.deepEqual(requested, Object.keys(files));
});

test("caption download failures allow the caller to fall back to native tracks", async () => {
  const { api } = createEnvironment({ fetch: async () => { throw new Error("Offline"); } });
  assert.deepEqual(plain(await api.captions.fromFile({ querySelector: () => ({ src: "https://example.test/file.vtt" }) })), []);
});

test("a direct WebVTT caption file uses the shared transcript parser", async () => {
  const { api } = createEnvironment({ fetch: async () => ({
    ok: true,
    text: async () => "WEBVTT\n\n00:01.000 --> 00:03.000\nHello!",
  }) });
  const video = { querySelector: () => ({ src: "https://example.test/file.vtt" }) };
  assert.deepEqual(plain(await api.captions.fromFile(video)), [
    { start: 1, end: 3, text: "Hello!" },
  ]);
});

test("panel construction provides every control used by the entry point", () => {
  let appended = null;
  const { api } = createEnvironment({ document: {
    documentElement: { append(element) { appended = element; } },
    createElement: () => ({
      querySelector(selector) {
        return this.innerHTML.includes(`id="${selector.slice(1)}"`) ? { selector } : null;
      },
    }),
  } });
  const ui = api.panel.create();
  assert.equal(appended, ui.panel);
  for (const [name, control] of Object.entries(ui)) assert.ok(control, name);
});

test("voice choices filter languages and preserve the selected voice", () => {
  const { api } = createEnvironment({
    document: { createElement: () => ({ children: [], append(option) { this.children.push(option); } }) },
    Option: function (label, value) { this.label = label; this.value = value; },
    speechSynthesis: { getVoices: () => [
      { lang: "hi-IN", name: "Hindi voice", voiceURI: "hindi" },
      { lang: "en-US", name: "English voice", voiceURI: "english" },
      { lang: "fr-FR", name: "French voice", voiceURI: "french" },
    ] },
  });
  const select = {
    groups: [],
    value: "",
    replaceChildren() { this.groups = []; },
    add(group) { this.groups.push(group); },
    get options() { return this.groups.flatMap((group) => group.children); },
  };
  assert.equal(api.panel.populateVoices(select, "hindi"), "hindi");
  assert.deepEqual(select.options.map((option) => option.value), [
    "system:en-US", "english", "system:hi-IN", "hindi",
  ]);
  assert.equal(api.panel.populateVoices(select, "missing"), "system:en-US");
});

test("speech finishes a phrase before moving to the current video cue", async () => {
  const { api, spoken } = createEnvironment();
  const playback = new api.PlaybackController();
  const video = createVideo();
  playback.attach(video);
  playback.cues = cues;
  await playback.start();
  assert.equal(video.paused, false);
  assert.equal(spoken[0].text, "First sentence.");
  video.currentTime = 5;
  playback.sync();
  assert.equal(spoken.length, 1);
  spoken[0].onend();
  assert.equal(spoken[1].text, "Second sentence.");
  spoken[1].onend();
  playback.sync();
  assert.equal(spoken.length, 2);
});

test("pause, resume, seeking, rate, offset, and voice settings reach speech playback", async () => {
  const { api, spoken, calls } = createEnvironment();
  const playback = new api.PlaybackController();
  const video = createVideo();
  playback.attach(video);
  playback.cues = cues;
  playback.offset = 4;
  playback.rate = 1.5;
  playback.voiceURI = "system:hi-IN";
  await playback.start();
  assert.equal(spoken[0].text, "Second sentence.");
  assert.equal(spoken[0].rate, 1.5);
  assert.equal(spoken[0].lang, "hi-IN");
  video.pause();
  assert.equal(calls.pause, 1);
  await video.play();
  assert.ok(calls.resume >= 2);
  video.dispatchEvent(new Event("seeked"));
  assert.equal(spoken.length, 2);
});

test("switching or removing a video detaches its playback listeners", () => {
  const { api, calls } = createEnvironment();
  const playback = new api.PlaybackController();
  const oldVideo = createVideo();
  const newVideo = createVideo();
  playback.attach(oldVideo);
  playback.attach(newVideo);
  oldVideo.pause();
  assert.equal(calls.pause, 0);
  newVideo.pause();
  assert.equal(calls.pause, 1);
  playback.attach(null);
  newVideo.pause();
  assert.equal(calls.pause, 1);
});

test("stop releases the sync timer and starting again creates one timer", async () => {
  const { api, timers } = createEnvironment();
  const playback = new api.PlaybackController();
  playback.attach(createVideo());
  playback.cues = cues;
  await playback.start();
  await playback.start();
  assert.equal(timers.size, 1);
  playback.stop();
  assert.equal(timers.size, 0);
  assert.equal(playback.enabled, false);
  await playback.start();
  assert.equal(timers.size, 1);
});

test("blocked video playback remains ready for a later user play event", async () => {
  const { api, spoken } = createEnvironment();
  const playback = new api.PlaybackController();
  const video = createVideo();
  video.play = async () => { throw new Error("Playback blocked"); };
  playback.attach(video);
  playback.cues = cues;
  assert.equal(await playback.start(), false);
  assert.equal(spoken.length, 0);
  video.paused = false;
  video.dispatchEvent(new Event("play"));
  assert.equal(spoken[0].text, "First sentence.");
});

test("entry point connects transcript input and start/stop controls", async () => {
  const video = createVideo();
  const env = createEnvironment({ document: { querySelectorAll: () => [video] } });
  const names = ["toggle", "card", "close", "start", "stop", "status", "vtt", "nativeCaptions", "voice", "rate", "rateOutput", "offset"];
  const ui = Object.fromEntries(names.map((name) => [name, { setAttribute() {} }]));
  env.api.panel.create = () => ui;
  env.api.panel.populateVoices = () => "system:en-US";
  env.load(entryPoint);
  ui.vtt.value = "0:00 Hello.\n0:04 Again!";
  ui.vtt.oninput();
  assert.equal(ui.start.disabled, false);
  await ui.start.onclick();
  assert.equal(env.spoken[0].text, "Hello.");
  assert.equal(ui.stop.disabled, false);
  ui.rate.value = "1.3";
  ui.rate.oninput();
  assert.equal(ui.rateOutput.value, "1.3×");
  assert.equal(env.spoken.at(-1).rate, 1.3);
  ui.offset.value = "4";
  ui.offset.oninput();
  assert.equal(env.spoken.at(-1).text, "Again!");
  ui.stop.onclick();
  assert.equal(ui.stop.disabled, true);
  assert.equal(env.timers.size, 0);
});
