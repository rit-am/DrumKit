# Drum Keys

An offline drum soundboard you play with your computer keyboard. It includes a grouped instrument matrix, live hit log, editable bindings, saved patterns, local audio uploads, and PWA support.

## Requirements

- Node.js 18 or newer
- npm

## Install

```powershell
npm install
```

## Start and stop

Start the development server:

```powershell
npm run dev
```

Open the URL shown in the terminal, usually `http://localhost:5173/`.

Stop it with `Ctrl+C` in the Vite terminal. In VS Code, you can instead run `Tasks: Run Task` and choose `Drum Keys: dev server`, then use `Tasks: Terminate Task` to stop it.

## Use the drum kit

- Press the displayed keys to play sounds. Default bindings are listed below.
- Click `Edit kit` to rename sounds, add/remove keys, or load an audio file.
- Use the volume slider to change output volume.
- Use `Record`, `Stop`, and `Save` to capture a pattern.
- Search, play, loop, rename, or delete saved patterns.
- Settings and patterns are saved in browser `localStorage`.

## Default keys

| Sound | Keys |
|---|---|
| Crash cymbal | Y |
| Ride cymbal | U |
| Hi-hat (closed) | R, T |
| Hi-hat (open) | E, W |
| Hi-hat (foot) | C |
| High tom-tom | G |
| Low tom-tom | H |
| Floor tom | J |
| Snare drum | S, A |
| Snare drum (cross stick) | D, F |
| Bass drum | X, Z |

## Add audio files

In edit mode, choose `Audio` beside a sound and select a browser-supported file, preferably WAV. Audio is decoded locally and is not uploaded to a server. Custom uploads last for the active browser session.

Default samples are stored in `public/samples/default/`. The included Salamander Drumkit samples and their CC BY-SA 3.0 attribution are documented in [SAMPLE_CREDITS.md](SAMPLE_CREDITS.md).

## Test and build

```powershell
npm test
npm run build
npm run preview
```

The production output is written to `dist/`.

## Offline and PWA notes

The service worker is registered in production builds only. To test installation and offline behavior, serve the production build over localhost or HTTPS, install it from the browser, then disconnect the network and relaunch it.

## Tech

TypeScript, HTML/CSS, Web Audio API, Vite, localStorage, and a service worker. The project is suitable for a future Tauri 2 wrapper.
