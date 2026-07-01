# gesture-stage

Browser-based realtime gesture and music interaction tool built with Vite, React, TypeScript, MediaPipe, Web Audio, Canvas, and optional local Qwen/Ollama analysis.

## Run

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

Production check:

```powershell
npm run build
npm run lint
```

## Features

- Realtime mode: camera + microphone + hand landmarks + music-reactive visuals.
- Video mode: upload a local video, generate gesture/audio/emotion timelines, preview, and export.
- MediaPipe Hand Landmarker with GPU attempt and CPU fallback.
- 21 hand landmarks, hand skeleton overlay, index fingertip trails, and pinch bursts.
- Music emotion inference from `volume`, `bass`, `mid`, `treble`, and beat density.
- Emotion-driven stage palette, hand skeleton, trails, particles, lighting, and pulse effects.
- Visual styles: `normal`, `binary`, `mosaic`, `blue_tears`, `spotlight`, `aurora`, `ink`, `pulse_grid`.
- Optional local Qwen/Ollama emotion-director summary.
- Export `gesture_timeline.json`, `audio_timeline.json`, `gesture_stage_timeline.json`, and processed `webm`.
- FFmpeg command provided for converting exported `webm` to `mp4`.

## Key Files

- `src/modes/RealtimeMode.tsx`: realtime lifecycle, permissions, render loop.
- `src/modes/VideoProcessMode.tsx`: upload, timeline generation, emotion summary, preview, export.
- `src/audio/audioEmotion.ts`: browser-side music emotion inference.
- `src/audio/ollamaEmotion.ts`: optional local Qwen/Ollama emotion summary.
- `src/vision/handTracker.ts`: MediaPipe hand tracking wrapper.
- `src/render/StageCanvas.tsx`: stage background, skeleton, trails, particles.
- `src/effects/frameEffects.ts`: image styles and stage overlays.
- `src/export/mediaRecorderExport.ts`: local `webm` recording and download helpers.

## Video Workflow

1. Switch to `视频处理`.
2. Upload a local video file.
3. Click `生成情绪 timeline`.
4. Optionally click `Qwen 情绪导演` to refine the global mood and director note.
5. Scrub the timeline or preview the processed canvas.
6. Export `gesture_timeline.json`, `audio_timeline.json`, `gesture_stage_timeline.json`, or `webm`.
7. Convert exported `webm` to `mp4` if needed:

```powershell
ffmpeg -i input.webm -c:v libx264 -pix_fmt yuv420p -c:a aac output.mp4
```

## Privacy And Local Processing

- Camera frames, microphone input, and uploaded videos stay in the browser.
- Uploaded-video processing stores timelines, not all decoded image frames.
- Qwen analysis is optional and local-only. The app checks `http://127.0.0.1:11434` for an Ollama Qwen model and sends compact timeline feature summaries, not camera frames or raw video.
- The first hand-tracker load downloads MediaPipe WASM and model files from official CDN/storage URLs.

## Common Issues

- Permission denied: allow camera and microphone in browser site settings, then start again.
- Device busy: close other apps using the camera or microphone.
- Blank tracker: check that the MediaPipe model URL is reachable, then reload the page.
- Low FPS: switch away from `binary` or `mosaic`, or reduce camera resolution.
- Video export fails: use Chrome or Edge and confirm `MediaRecorder` plus `canvas.captureStream` are available.
- Qwen button is disabled or not useful: start Ollama and make sure `ollama list` includes a Qwen model such as `qwen3:4b`.
- LootAI is not part of this npm project. Install it only from an official installer or account page.
