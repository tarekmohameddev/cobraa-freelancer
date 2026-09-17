# Extra mouse buttons — reference

Use this before changing Translate / AI / Voice / OCR extra-key behavior.

## Hardware

- Device: **iTing.AI**, USB `VID_248A` `PID_CA08` (Telink composite).
- Official app: **Ai mouse 6.2.0.20** (`AI-Assistant.exe` + `hidapi.dll`). Config protocol string: `P8/P8-HIDRAWDATA`.
- Identity: `vid=0x248a`, `pid=0xca08`, **usage page `0xFF03`**, `rawdata: true` (see device JSON under `zhongxinhongye/config/device`).

Do **not** exclusive-open the pointer collection (`up=0001 us=0002`) — the cursor dies. Keyboard collection (`us=0006`) is owned by Windows (`CreateFile` ACCESS_DENIED).

| Interface | Role |
|---|---|
| MI_00 Col02 | Standard mouse — leave to Windows |
| MI_00 Col03 | Consumer control (3-byte) — extra keys do **not** appear here |
| MI_01 `FF03` | 33-byte in/out vendor HID — **this is the extra-button + mic channel** |
| MI_02 | 65-byte control (version/status). Not the extra-key path |

## What extra buttons actually send

They are **not** Windows keys, X1/X2, media keys, or official `0A 03` P8 frames. Pressing them does nothing in the OS until our app reads vendor HID.

Live traffic on FF03:

- `0A 9C …` — SBC mic/audio flood (~5–10 ms). Ignore.
- `0A 26 FF 64 45 XX 5E 09 01 08 D8 00 77 20 03 0E 44 …` — **extra-button status**. Only **byte 5** (`XX`) changes. Idle is rare (~tens of seconds); presses produce a burst.

### Byte 5 decode

```
low = b5 & 0x07
if low not in 1..4: ignore (telemetry, not a key)
key = 4 if (b5 & 0x10) and low == 1 else low
down = (b5 >> 4) >= 4
```

Only emit `st26:{1-4}`. Values like `0x25` / `0x26` decode as keys 5/6 if you use `b5 & 0x07` without the 1–4 clamp — those are idle frames, not buttons.

| b5 | key | edge |
|---|---|---|
| `41` | 1 | down |
| `42` | 2 | down (also seen as a lone idle heartbeat) |
| `43` | 3 | down (no `33` up seen) |
| `51` | 4 | down |
| `32` | 2 | up (often late or missing) |
| `31` | 4 | up (Voice usually has a real up) |

Signature emitted: `hid:248A:CA08:st26:{1-4}` with a separate `down` flag.

### Confirmed mapping (this unit)

| Action | Signature | Physical |
|---|---|---|
| Translate | `hid:248A:CA08:st26:2` | Translate extra key |
| AI chat | `hid:248A:CA08:st26:1` | AI extra key |
| Voice | `hid:248A:CA08:st26:4` | Voice extra key |
| OCR | `hid:248A:CA08:st26:3` | OCR extra key |

Firmware often sends **down with no matching up** (especially keys 1–3). Key 4 (Voice) usually does send up on release. Do not assume a held-down duration for Translate / AI / OCR.

### Official P8 frames (not seen on this mouse)

Ai mouse 6.2 logs/comparisons: `0a032301/00`, `0a032101/00`, `0a032401/00` (down/up). We never received `0A 03` even after their writes. Daemon still parses them as `hid:…:p8:{21|23|24}` if they appear.

FF03 **output** has **no report-id prefix** (33 bytes). Leading `0x00` → `ERROR_INVALID_PARAMETER`. Writes that succeed: `0A 03 24` + pad, `0A 01 39` + pad. `B5 2D 00…` keepalive from their logs is **incoming hex**, not a valid write. Do not write `0A` on MI_02 — it knocked USB off.

## Gestures

`src/main/mouseButtons/gestures.ts` — **per-action**, not one global down/up/long machine.

| Constant | Value | Meaning |
|---|---|---|
| `REPEAT_MS` | 90 | Ignore HID burst repeats of the same down |
| `DOUBLE_MS` | 340 | Wait for a second tap before committing click |
| `LONG_MS` | 500 | Voice only: still down with no up → long-press |

**Pulse** (Translate, AI, OCR): each debounced **down** is a tap. Do not wait for `up`. Do not fire `long`. First tap waits `DOUBLE_MS`; a second tap in that window is `double`, otherwise `click`. Late `up` packets are ignored.

**Hold** (Voice only): `down` starts a 500 ms timer. `up` before that → `click` (or `double` if another down arrives in `DOUBLE_MS`). No `up` by 500 ms → `long` (hold-to-talk); later `up` stops PTT. Extra downs while already held are ignored.

The old model (fire `long` whenever any key stayed “down” 480 ms) mixed click/double/long and made Translate/AI/OCR look dead, because those keys often never send `up`.

### Intended actions

| Action | Click | Double | Long |
|---|---|---|---|
| Translate | Open Translate with clipboard | Paste clipboard **and run translate** | — |
| AI chat | Open chat | Focus the composer | — |
| Voice | Toggle mic | Switch EN/AR | Hold to talk; release (`up`) to stop |
| OCR | Quick capture | Open Image to Text | — |

Clipboard text is attached only to **Translate** gestures (`index.ts`). Do not stamp every gesture with whatever is on the clipboard (that used to dump the Map panel text into logs).

Renderer: `AppShell.tsx` routes page changes; `TranslatePage` applies `{ text, token, autoTranslate }`; `ChatPage` handles Voice + AI-double focus. Chat and Translate stay mounted (CSS `hidden`) so mouse events are not missed on remount.

## App wiring

Electron **spawns** `scripts/mouse_button_daemon.py --hid-only`. Do not run the probe scripts for normal use. After changing the daemon or main-process gesture code, **restart `npm run dev`** so the Python child respawns.

| File | Role |
|---|---|
| `scripts/mouse_button_daemon.py` | hidapi on extras except pointer/keyboard; decode `st26` / `p8`; keys **1–4 only**; JSON on stdout |
| `src/main/mouseButtons/index.ts` | Spawn daemon, learn/bind, attach clipboard for translate, send `mouse:button` |
| `src/main/mouseButtons/gestures.ts` | Pulse vs hold detector (see above) |
| `src/main/mouseButtons/mapping.ts` | `%APPDATA%\cobraa\mouse-button-map.json` |
| `src/main/mouseButtons/windowsInput.ts` | Raw Input + LL hooks (F-keys / X1/X2). **Never bind laptop typing** |
| `src/renderer/src/components/MouseButtonsPanel.tsx` | Map UI |
| `src/renderer/src/components/AppShell.tsx` | Navigate + Translate seed |
| `src/renderer/src/pages/TranslatePage.tsx` | Click = paste clipboard; double = paste + translate |
| `src/renderer/src/pages/ChatPage.tsx` | Voice mic / PTT / EN-AR; AI double focuses composer |

Learn mode must only accept `hid:` (non-tele), `mouse:`, `kbd:` from the AI mouse, `llmouse:`. Laptop `llkbd:` (including Space) previously stole mappings.

## Pitfalls

- Map stays on “Listening…” until a real `st26`/`p8` down. That is correct if HID is silent.
- `0x42` can fire once while idle — may look like Translate (key 2). Prefer mapping on a deliberate press, not after waiting.
- Do not treat missing `up` as long-press except for Voice.
- Debug should show `translate click` / `translate double` on taps, not `translate long`.
- Unpacked official installer lives in `_aimouse_unpacked/` (not for runtime). Device JSON: `2112.AI Mouse` / `2112.V16`.
- Official extra-key UI names: `trKey`, `aiKey`, `voiceKey`, `mKey` (function IDs 7=voice, 8=translate typing, 9=screenshot OCR, 21=open AI).
