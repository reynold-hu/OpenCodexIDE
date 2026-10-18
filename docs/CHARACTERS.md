# Character Packs — original assets & generation prompts

Our products ship with **original characters**. Three packs are included
(generated from our own sticker sheet and sliced with
`tools/slice-character-sheet.py`): `dots` (silver orb), `grok` (robot),
`muse` (hatch creature) — 7 states each, transparent 512px PNGs with
state-driven CSS motion. `claude` still uses the procedural ray character
until a sheet row is generated. To replace or extend, drop a *character pack*
into the frontend; the app picks it up automatically. No third-party mascots,
logos or frames are used.

## Folder layout

```
frontend/public/characters/<product>/
├── manifest.json
├── idle.gif        (or .png/.webp/.apng)
├── working.gif
├── attention.gif
├── celebrate.gif
├── dizzy.gif
├── heart.gif
└── sleep.gif
```

`<product>` is one of `codex`, `claude`, `muse`, `grok`, or `dots`
(`dots` drives the colored dot orbs; a neutral base is tinted per variant).

## manifest.json

```json
{
  "name": "muse-blob-v1",
  "states": {
    "idle": "idle.gif",
    "working": "working.gif",
    "attention": "attention.gif",
    "celebrate": "celebrate.gif",
    "dizzy": "dizzy.gif",
    "heart": "heart.gif",
    "sleep": "sleep.gif"
  }
}
```

States map 1:1 to the mascot machine: `sleep · idle · working · attention ·
celebrate · dizzy · heart`. Missing states fall back to `idle`; if the pack is
absent the procedural character is used.

## Technical spec

- Canvas 512×512, transparent background, character centered, consistent scale
  across states (leave ~8% margin).
- Animation: seamless loop, 12–24 fps, GIF / APNG / animated WebP.
- Keep each file under ~2 MB (they are loaded lazily and cached).
- No text, no watermarks, no UI chrome — character only.
- Dots pack: neutral silver/white orb so the seven tint variants
  (`default/red/yellow/green/blue/purple/pink`) map via CSS hue rotation.

## Style bible (keep all states consistent)

- Soft 3D clay/vinyl look, rounded forms, gentle rim light, subtle ambient
  occlusion, no hard outlines.
- Two simple dot eyes with tiny highlight; expressions through eyes and mouth.
- Slight squash-and-stretch; springy, friendly motion.
- Flat pastel backdrop is NOT part of the asset (transparent only).

## Generation prompts

Use any image/video generator (Midjourney, GPT Image, Flux, Sora/Runway/Veo for
motion). Generate one state at a time with the same seed/style reference, then
assemble the manifest.

### 1) Dots — neutral orb character (`dots`)

> A glossy soft-3D vinyl orb character, perfect sphere with a subtle flattened
> bottom, smooth pearlescent silver-white body, two small black dot eyes with
> tiny white highlights and a minimal curved smile, gentle rim light and soft
> ambient occlusion, centered on a fully transparent background, 512x512,
> consistent character scale, cute minimalist mascot, original character design,
> not resembling any existing brand mascot or logo. State: **{state}**.
> {state definitions below}

State definitions:
- idle: relaxed, eyes open, tiny breathing scale, small sparkle
- working: focused eyes, two tiny sweat drops, slight forward lean, subtle
  motion streaks (minimal, not text)
- attention: eyes wide, small golden alert badge shape floating above (no
  letters), body slightly raised
- celebrate: eyes closed happy arcs, big smile, tiny colorful confetti flecks
  (no letters), body mid-bounce
- dizzy: spiral pupils, slight wobble tilt, two small orbit stars
- heart: heart-shaped pupils or two floating hearts, blush, gentle float
- sleep: closed curved eyes, small “z” shapes made of geometric strokes (no
  text), slow breath squash

Negative: text, watermark, logo, background, photorealism, human hands, extra
limbs, busy details, neon, third-party mascots.

### 2) Grok Bot — original robot (`grok`)

> An original friendly desk robot mascot: rounded-square head with a soft matte
> charcoal body, single short antenna with a glowing blue tip, two rectangular
> eyes, small wheels instead of legs, gentle industrial design, soft studio rim
> light, transparent background, 512x512, centered, consistent scale. Original
> character, not resembling any existing robot mascot or logo. State: **{state}**,
> with the same idle/working/attention/celebrate/dizzy/heart/sleep definitions
> as above (blue accent light for working, golden badge for attention, confetti
> flecks for celebrate, spiral eyes for dizzy, blush for heart, dim glow for
> sleep).

### 3) Muse — hatch creature (`muse`)

> An original tiny round blob creature with soft mint-lavender gradient body,
> two big glossy eyes, a single antenna with a pearl tip, and tiny stub arms;
> it begins inside a smooth speckled egg (white-cream) that cracks open.
> Soft 3D clay look, transparent background, 512x512, centered. State:
> **{state}** — idle (creature peeking from cracked egg), working (fully hatched,
> focused, tiny sweat drop), attention (eyes wide, golden badge), celebrate
> (bouncing with confetti flecks), dizzy (spiral eyes, wobble), heart (blush +
> floating hearts), sleep (curled inside intact egg with geometric “z” strokes).

### 4) Claude-style ray mark (`claude`)

> An original warm terracotta sunburst character: 12 rounded rays around a soft
> circular core, two small eyes and a gentle smile, matte clay finish, subtle
> breathing animation, transparent background, 512x512. Original character, not
> the Anthropic logo or any existing mark. Same seven state expressions
> (working = slowly rotating rays, attention = golden badge, celebrate = rays
> bounce with confetti flecks, dizzy = wobbling rays + spiral eyes, heart =
> blush + hearts, sleep = dimmed rays, closed eyes).

### Sprite-sheet variant (single image)

> Character sheet of the same original character in 8 poses arranged in a 4x2
> grid on transparent background, 2048x1024, each cell 512x512, consistent
> style and scale, states: sleep, idle, working, attention, celebrate, dizzy,
> heart, plus one neutral front view. No text, no labels, no borders.

Then slice into individual files and write the manifest. Test by reloading the
product — startup screens, buddy, dots and swarm cards pick up the pack
immediately.
