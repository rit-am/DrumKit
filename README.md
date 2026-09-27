# Drum Keys

An offline drum soundboard you play with your computer keyboard. No drum-kit graphics:
just a clear list of sounds and keys, a live hit log, and a library of saved patterns.

## Features
- Play 11 drum sounds from the keyboard, with fast audio and simultaneous hits
- Rename any sound and assign one or more keys to it
- Always-visible sound/key list with a scrolling "Recent hits" log
- Record, save, replay and loop patterns
- Works fully offline; settings and patterns stay on your device
- Public-domain / CC0 drum samples (see SAMPLE_CREDITS.md)

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

## Tech
TypeScript, HTML/CSS, Web Audio API, Vite. Installable as a PWA, with desktop/mobile
packaging via Tauri planned.

## Status
Early development. First milestone: a playable kit with editable names and keys.

## Credits
Drum samples from the Salamander Drumkit (public domain). Full list in SAMPLE_CREDITS.md.
