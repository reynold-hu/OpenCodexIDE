# Brand — OpenEveryAgent IDE

## Honest assessment of the current logo

The current asset (`assets/logo.png`) is a charming hand-drawn **wordmark
illustration**: a monitor character giving a thumbs-up with the full name
lettered below.

It works as a README hero, but it is **not a good app mark**:

- it is a wide 640×461 illustration (not square), so favicons/app icons crop
  awkwardly;
- the baked-in lettering is illegible below ~24px;
- the doodle style clashes with the product's minimal UI;
- it is strictly monochrome and very busy at small sizes (thumbs, sparkles,
  screen, face, letters).

**Recommendation:** keep it as a wordmark illustration, and adopt a **separate,
simplified square primary mark** that reads at 16–32px. The brand system then
has three pieces: primary mark (square), app icon (mark on rounded-square tile),
wordmark (name set in bold type, or the existing illustration for README).

## Candidate marks (original)

Preview PNGs are committed next to the SVGs in `docs/brand/`.

- **A — Terminal Face** (`candidate-a-terminal-face.svg`): dark rounded square,
  minimal face + `>` prompt, one green "live agent" dot. Closest to the product
  (an agent living in a terminal), reads well at 16px, works on light/dark.
- **B — Agent Orbit** (`candidate-b-agent-orbit.svg`): an "O" orbit with a green
  agent core and satellite agents — conveys *every agent*; light-first.
- **C — Hex Prompt** (`candidate-c-hex-prompt.svg`): hexagon + prompt + agent
  dot; techy, distinct silhouette.

Recommendation: **A** as primary (best small-size legibility and ties to the
IDE), **B** as a light-background alternative, keep the illustration for README.

## Naming

- Product: **OpenEveryAgent IDE** (repository: `OpenEveryAgentIDE`).
- Short form in UI: `OpenEveryAgent`.
- Four surfaces: Codex · Claude · Muse · Grok Bot (descriptive names; the
  products themselves are not affiliated with those companies).

## Palette

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#1c1c1b` | primary mark, text |
| Paper | `#f7f5ef` | background / mark on dark |
| Agent green | `#10a37f` | live/active accents, Codex surface |
| Terracotta | `#d97757` | Claude surface accent |
| Studio blue | `#4b93ff` | Muse surface accent |
| Signal gold | `#d9a520` | approvals/attention |

## Typography

- UI: **Inter Variable** (self-hosted; see `frontend` dependency).
- Wordmark: bold geometric sans, tight tracking; letter-spacing −1%.
- No third-party fonts or logos are bundled.

## Usage rules

- Primary mark: square, min 16px; clear space ≥ 25% of the mark's width.
- App icon: mark on a rounded-square tile (radius ~22%); light and dark tiles.
- Favicon: 16/32/128px from the square master; never use the wide illustration.
- Do not stretch, recolor the face, add outlines, or place the mark on busy art.
- Forks should rename (e.g. “MyAgentIDE”) per the AGPL attribution terms.

## AI generation prompt (optional variants)

> A minimal, original app icon for an AI-agent IDE named OpenEveryAgent:
> rounded-square dark tile (#1c1c1b), a simple terminal prompt glyph “>” and two
> dot eyes forming a friendly face, one small emerald-green agent dot accent
> (#10a37f), flat vector, high contrast, crisp at 16px, centered, transparent
> background, no text, no letters, no gradients, no third-party logos or
> mascots, original design. Provide light-tile and dark-tile variants.

## Swapping the mark

1. Put a square 1024×1024 master in `assets/logo-square.png`.
2. Replace `frontend/public/logo.png` (startup screens) and
   `frontend/public/favicon.png` (browser icon); optionally regenerate README
   hero with the wordmark illustration.
3. Keep SVG sources in `docs/brand/`.
