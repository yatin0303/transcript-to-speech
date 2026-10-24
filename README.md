# Video Transcript Voiceover

A Manifest V3 Chrome extension that speaks WebVTT captions as an HTML5 video plays. It combines adjacent caption fragments into a single voice cue until sentence-ending punctuation is reached, lets the active phrase finish rather than cutting it off at a later caption boundary, restarts narration after seeking, and pauses speech with the video. The voice picker intentionally shows English and Hindi system voices only.

## Install locally

Install Node.js 22 or newer, then prepare the extension from this folder:

```sh
npm ci
npm run build
```

TypeScript source lives in `src/`. The build creates JavaScript and source maps in `dist/`, which the extension manifest loads. Keep `dist/` in place when loading the extension; edit the TypeScript source rather than the generated JavaScript.

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked**.
3. Select this folder.
   Chrome will show that the extension may access `video.deeplearning.ai`; that permission is used only to retrieve the lesson's caption file.
4. Open a page with a normal HTML5 `<video>`, then click **Voiceover** in the lower-right corner.
5. Select **Use video captions** when the site exposes a standard caption track; it may take a few seconds to load. Alternatively, paste either a WebVTT transcript or a copied transcript with timestamp headings such as `0:00` followed by its text.
6. Press **Start voiceover**. It starts the current video and narration together.

To hide the floating bubble, click the extension’s icon in Chrome’s toolbar (or find **Video Transcript Voiceover** in the Extensions menu) and turn off **Enable voiceover bubble**. This also stops any active voiceover. Turn it on from the same menu when needed. Your choice applies to all open tabs and is remembered for new pages and browser restarts.

The cue time is the source of truth, so a plain transcript without timestamps cannot be synced. If a voice runs beyond the next cue, it finishes the current phrase and then resumes at the cue matching the video's current time. Use the Rate and Offset controls to compensate for the chosen system voice. When a video exposes a subtitle file, the extension tries to retrieve it directly, including WebVTT segments listed in an HLS subtitle playlist. Some sites, including YouTube, do not expose their captions as a standard browser track; copy the timestamped transcript from the site and paste it into the extension.

## Code structure

| File | Responsibility |
| --- | --- |
| `src/content.ts` | Entry point: connects panel actions, caption loading, and playback; retries native caption loading. |
| `src/popup.ts`, `popup.html`, `popup.css` | Toolbar menu with a saved switch to enable or disable the floating bubble across tabs. |
| `src/scripts/transcript.ts` | Parses WebVTT and copied transcripts; groups fragments into sentence cues. |
| `src/scripts/captions.ts` | Finds videos and reads captions from native tracks, subtitle files, and HLS playlists. |
| `src/scripts/playback.ts` | Owns speech settings, cue progress, video event listeners, and the synchronization timer. |
| `src/scripts/panel.ts` | Builds the floating panel and populates English and Hindi voice choices. |
| `src/types.d.ts` | Shared cue, playback option, and panel element types. |
| `styles.css` | Panel layout and appearance. |
| `manifest.json` | Extension permissions and ordered content-script loading. |
| `tsconfig.json` | Strict TypeScript settings and source/output directories. |
| `package.json` | Compiler dependency and build, watch, type-check, and test commands. |
| `tests/extension.test.cjs` | Automated checks for parsing, caption loading, playback, and control wiring. |

The scripts use typed `VideoTranscriptVoiceover` namespaces inside the extension's isolated execution environment, so they compile to classic content scripts without a bundler. The manifest loads the parser first, then the caption, playback, and panel modules, and finally the entry point. TypeScript is a development dependency; the extension has no runtime package dependencies.

## Development

```sh
npm run build       # Compile TypeScript into dist/
npm run watch       # Recompile when source files change
npm run typecheck   # Check types without generating files
```

After rebuilding, reload the extension in Chrome and refresh the video page. Generated files and installed dependencies are ignored by Git; `package-lock.json` pins the compiler for repeatable installs.

## Verification

Run:

```sh
npm test
```

The test command compiles the TypeScript first, then checks the generated scripts in the manifest's load order. The tests simulate video, speech, and network APIs. To check actual browser voices and site caption access, reload the unpacked extension in Chrome and refresh the video page. Check both pasted transcripts and **Use video captions**, then try pause/resume, seeking, rate and offset changes, and Stop.

## Next useful upgrade

Add a site adapter for YouTube that reads its already-selected caption track (when available) and automatically fills the VTT box. That needs careful handling of YouTube's changing player APIs and user-selected caption language.
