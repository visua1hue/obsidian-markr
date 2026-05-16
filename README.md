# Markr

Trigger-based list and task markers for [Obsidian](https://obsidian.md) — colored badges, line tints, and icons in Live Preview and Reading View. Inspired by [List Callouts](https://github.com/mgmeyers/obsidian-list-callouts) by mgmeyers.

## Features

- **Trigger markers** — any 1–3 character prefix on a list item becomes a visual marker
- **Built-in priority** — `!` Important, `!!` Urgent, `!!!` Critical, always available
- **Custom markers** — configurable trigger, label, Lucide icon, line color, and badge color
- **Badge background** — independent color override for the badge, separate from the line tint
- **Live Preview + Reading View** — both surfaces render identically
- **Commands** — apply, remove, and cycle priority markers from the command palette
- **Theme-compatible** — tints composite over any theme background without baking in colors
- **Style Settings** — exposes CSS variables for radius, padding, and color stops

## Install

**Manual:**

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/visualhue/obsidian-markr/releases/latest)
2. Copy the files to `<vault>/.obsidian/plugins/markr/`
3. Enable Markr in **Settings → Community plugins**

**BRAT:**

```
visualhue/obsidian-markr
```

Install [BRAT](https://github.com/TfTHacker/obsidian42-brat), add the repo above, then enable Markr in **Settings → Community plugins**.

## License

[MIT](LICENSE)
