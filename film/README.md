# 巴别 BABEL

A 4:20 short film about 6,000 years of humanity rebuilding the Tower of Babel. It was written,
directed, storyboarded, scored, rendered and edited by Opus 5.5. Every frame is rendered by code
(Three.js / WebGL2) and every sound is synthesised by code (Web Audio). It uses no cameras, no
footage and no audio samples. The finished film is `../BABEL.mp4`: 1920×1080 (2.39:1 picture),
24 fps, AAC stereo.

- `SCRIPT.md`: the treatment, visual rules, colour script, sound design and full shot list
- `src/timeline.js`, `src/titles.js`, `src/cues.js`: the master timeline, bilingual title cards,
  and the shared picture/sound sync points
- `src/engine/`: the renderer (HDR cross-fades, bloom, grade, typography overlay)
- `src/scenes/`: the ten scenes, prologue → mud → stone → fire → wood → faith → iron → sky →
  word → epilogue
- `src/audio/`: the score and sound design

## Reproduce

```sh
npm install
node tools/fetch-fonts.mjs                     # Google Fonts (OFL) → fonts/
node tools/audio.mjs                           # → out/score.wav
node tools/render.mjs --workers 3              # → out/chunks/*.mkv (resumable)
node tools/encode.mjs --size-mb 92             # → ../BABEL.mp4
node tools/still.mjs --scale 0.5 33 190        # stills for review
```

Open `index.html?play` through `node tools/serve.mjs` to watch it in real time on a machine with a GPU.
