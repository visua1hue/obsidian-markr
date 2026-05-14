# Markr — Prototype Spec

A clean-room reimplementation of the concept behind [`mgmeyers/obsidian-list-callouts`](https://github.com/mgmeyers/obsidian-list-callouts), built against current Obsidian APIs and guidelines (May 2026).

**Name:** *Markr* (plugin ID `markr`). The original was called "List Callouts" but that name collides with Obsidian's first-class `> [!note]` callouts. *Markr* is short, brandable, and uses the plugin name as a verb — what you do with the plugin is mark bullets.

This document is the working spec. It captures (1) what the original plugin does so we don't regress, (2) the architectural decisions for v2, (3) the performance plan, (4) the submission-readiness checklist, and (5) the v1 feature scope as agreed in design review.

---

## 1. Why a rewrite

The original is GPL-3.0, last released September 2024, and has ~60 open issues. The most-cited problems:

- **#62 / #75** — performance and rendering on large documents
- **#67** — false-positive: line highlights when the trigger character appears anywhere on the line
- **#66** — interaction bugs with the Tasks plugin
- **#69** — no separate colors for light vs dark themes
- **#71, #76, #77** — feature gaps: remove-callout command, autosuggest, aliases
- **#70, #74** — stale Lucide icon set (still on a pre-v0.446 version)

Beyond the issue list, the plugin's ID (`obsidian-list-callouts`) and the way it injects styles wouldn't pass current submission-bot checks for a *new* plugin. A clean rewrite is faster than a fork-and-modernize, and we avoid the GPL constraint by not reusing code.

---

## 2. Functionality inventory (what the original does)

This is the surface area v2 must cover **at minimum**. Anything beyond is in §7 (committed v1 scope) or §8 (backlog).

Terminology note: we use **marker** throughout for "a configured trigger that turns a list item into a styled line." The original called these "callouts" but that word now collides with Obsidian's native `> [!note]` callouts.

### Core behavior

- **Trigger matching.** Typing a configured trigger at the start of a list item (after the `-`/`*`/`+` and leading whitespace) marks that item for styling. Original plugin: single characters only (`!`, `?`, `&`, `~`, `@`, `$`, `%`). **v2: triggers can be 1–3 characters**, with the matcher doing longest-match-wins (see §7.1).
- **Live Preview rendering.** In the editor (CM6), the matched line gets:
  - A background color via a line decoration.
  - The trigger optionally replaced with a Lucide icon, depending on per-marker config.
- **Reading View rendering.** Same effect via a Markdown post-processor on `<li>` elements.
- **Per-marker configuration.** Each marker maps to:
  - A color (single value, or split light/dark per §3.2).
  - An optional icon (Lucide name) replacing the trigger.
  - A display label (used for tooltips and a11y per §7.2).
- **Settings tab.** Users can add, remove, edit, and reorder marker definitions (see §6 for the UX spec).
- **Style Settings plugin compatibility.** Exposes CSS variables (radius, padding, color stops) so the [Style Settings plugin](https://github.com/mgmeyers/obsidian-style-settings) can tweak them.
- **Icon picker.** A modal that searches Obsidian's bundled Lucide icon set (no embedded icon list — see §3.4).

### Things the original gets *almost* right but we'll fix

- Trigger characters are matched per-line, but the matcher doesn't distinguish "first non-whitespace after the list marker" from "anywhere on the line" reliably in all edge cases — hence #67.
- Cursor-near-decoration behavior: replace decorations don't gracefully step aside when the caret is on the marker, causing jumpy edits.
- The Lucide icon list is generated at build time and shipped, so it goes stale (#70, #74). v2 will rely on Obsidian's bundled icon set instead of embedding our own.

---

## 3. Architecture (v2)

### 3.1 File layout

Current state (`iconPicker.ts` and the `migrate.ts` chain are not built yet;
`util/` is currently empty):

```
markr/
├── manifest.json, package.json, tsconfig.json, eslint.config.mts,
│   esbuild.config.mjs, version-bump.mjs, versions.json, styles.css
├── src/
│   ├── main.ts            // Plugin entry, lifecycle, settings persistence
│   ├── commands.ts        // Apply / remove / cycle commands (see §7.5)
│   ├── settings/
│   │   ├── types.ts       // MarkerDef, PluginSettings, DEFAULT_SETTINGS
│   │   └── tab.ts         // PluginSettingTab — Debug / Markers / Performance
│   ├── editor/
│   │   ├── viewPlugin.ts  // CM6 ViewPlugin.fromClass (Live Preview)
│   │   ├── matcher.ts     // Trie + matchListLine, longest-match-wins
│   │   └── widgets.ts     // IconWidget extends WidgetType
│   ├── reading/
│   │   └── postProcessor.ts // <li> rewriter for Reading View
│   └── theme/
│       └── cssVars.ts     // Managed per-marker CSS var injection (see §3.5)
└── README.md
```

Not yet built: `settings/migrate.ts` (a real migration chain — currently
`main.ts` just discards saved data whose schema `version` doesn't match),
`settings/iconPicker.ts` (Lucide search modal), `util/` helpers.

### 3.2 Type system — best-in-class TS

We're using strict TS with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride`. Everything that crosses a boundary (settings JSON, regex match results, editor state) is parsed through a discriminated union, not cast.

The defining type decision: priority markers (`!`, `!!`, `!!!`) and custom markers (`?`, `~`, `@`, etc.) are *the same kind of thing structurally* but differ in lifecycle — priorities are managed by a single toggle and locked from inline edit, customs are user-owned. We model that with a `kind` discriminant rather than a separate type.

```ts
// src/settings/types.ts — current shape (schema version bumps on any change
// so stale saved data is discarded on load; see src/main.ts).

/** A 1–3 character trigger string. Branded to prevent accidental string mixing. */
export type Trigger = string & { readonly __brand: "Trigger" };
// makeTrigger() validates length 1..=3 and no whitespace.

/** A background/foreground colour pair. */
export interface ColorPair { readonly bg: string; readonly fg: string; }

/** Theme-aware colour. Either one pair, or a light/dark split. */
export type MarkerColor =
  | { kind: "single"; value: ColorPair }
  | { kind: "split"; light: ColorPair; dark: ColorPair };

/** Discriminated by `kind`. Priority markers are locked in the UI. */
export type MarkerDef =
  | {
      readonly kind: "priority";
      readonly id: "p1" | "p2" | "p3";   // fixed IDs for the three priority levels
      readonly trigger: Trigger;          // "!" | "!!" | "!!!"
      readonly label: string;
      readonly color: MarkerColor;        // all three share one colour (see §7.1)
      readonly icon: string | null;       // null for priority — rendered as text
    }
  | {
      readonly kind: "custom";
      readonly id: string;
      readonly trigger: Trigger;
      readonly aliases: readonly Trigger[];  // additional triggers (issue #77)
      readonly label: string;
      readonly color: MarkerColor;
      readonly icon: string | null;          // Lucide name, or null
      readonly enabled: boolean;
    };

export interface PluginSettings {
  readonly version: number;                 // current schema version
  readonly markers: readonly MarkerDef[];    // priority entries first, then custom
  readonly priority: { readonly enabled: boolean };
  readonly performance: {
    readonly maxFileSizeKB: number;          // 0 = no limit
    readonly applyInReadingView: boolean;    // kill switch for the post-processor
  };
  readonly behavior: {
    readonly hideMarkerWhenCursorAway: boolean;
    readonly showTooltips: boolean;
    readonly nestedInheritance: boolean;     // experimental, default off
    readonly enableAutosuggest: boolean;     // deferred; default off
  };
}
```

There is no `appearance` block — corner radii and padding live entirely in
`styles.css` as CSS custom properties (`--mr-line-radius`, `--mr-badge-radius`),
overridable by the Style Settings plugin.

Key rules:

- **No `any`. No `as` casts** except for the brand constructor (one place, one line, justified).
- **Settings are deep-readonly at the type level**, mutated only through a single reducer in `main.ts`. Settings-driven cache invalidation is then trivial — replace the object, everything downstream rebuilds.
- **Settings migration** is a `switch (raw.version)` chain returning `Result<PluginSettings, MigrationError>`. Each step pure.
- **The `kind` discriminant** drives every downstream behavior: settings UI shows priority rows as locked, the matcher uses different trigger-resolution for `kind: "priority"` (longest match wins so `!!!` doesn't parse as `!!` + `!`), commands enumerate both kinds, etc.

### 3.3 The CM6 view plugin

The heart of the plugin: `src/editor/viewPlugin.ts` is a `ViewPlugin.fromClass`
that rebuilds a `DecorationSet` on doc / viewport / selection changes (it skips
updates that change none of those — see §4.4).

For each visible line, `matchListLine` (see §3.3a) checks whether the line is a
marked list item. If so, the plugin emits **two** decorations:

1. **Line background** — `Decoration.line` at `line.from`, adding
   `class="mr-line mr-line-<id>"` to the block-level line element. It is *always*
   emitted: the tint is the marker's effect, not raw markdown syntax, so it
   stays even when the cursor is on the line. A line decoration touches only the
   block element, so it cannot conflict with Obsidian's own inline decorations
   (`[[links]]`, `` `code` ``, `[text]`) and it handles line-wrapping natively.

2. **Trigger badge** on `[markerFrom, markerTo]` — emitted only when
   `showBadge = !hideMarkerWhenCursorAway || cursorNotOnThisLine`:
   - **icon markers** → `Decoration.replace` with an `IconWidget` (see §3.3b);
   - **priority markers** (no icon) → `Decoration.mark` with
     `class="mr-badge mr-badge-<id>"`. The mark uses only layout-neutral CSS
     (background, colour, radius — no font-weight / size / spacing) so the
     `!`/`!!`/`!!!` glyphs occupy the exact same width whether the badge is
     shown or the cursor reveals the raw text → zero body-text shift.
   - when `showBadge` is false the trigger gets no decoration at all — raw,
     fully editable markdown.

`RangeSetBuilder` requires sorted insertion: the line decoration (`line.from`)
is always added before the trigger decoration (`markerFrom > line.from`).

> **Earlier dead-ends, kept as a warning.** A previous iteration wrapped the
> whole line body in an inline `Decoration.mark` (a "tint span") and rendered
> the trigger as a fixed-size replace-widget that swapped to a padded raw-text
> mark on cursor-enter. That broke link/code/bracket rendering (two extensions
> fighting over one range), mangled wrapped-line backgrounds, caused body-text
> jump and a background flash on the swap, and broke click→cursor mapping. The
> rule learned: **never wrap broad, richly-decorated editable content in your
> own inline mark; never fake a fixed-width element over variable-width text.**

### 3.3a Trigger matching — `src/editor/matcher.ts`

`Matcher` builds a trie of triggers (+ custom aliases) once per settings change;
`matchAt` does longest-match-wins so `!!!` parses whole. `matchListLine` is the
entry point: a single regex anchors the search to the first non-whitespace
position after the list bullet (and an optional task checkbox,
`- [ ] `/`* [x] `), and the trie lookup runs only there. Because matching is
*positionally scoped* to `contentStart`, a trigger character appearing later in
the body can never false-match — this closes issue #67 without needing the
`syntaxTree` (the original spec called for `syntaxTree`; a scoped regex turned
out to be sufficient and simpler). A trigger must be followed by whitespace or
end-of-line, so `!!!!` and `!hello` do not match.

### 3.3b `IconWidget` — `src/editor/widgets.ts`

Icon-only: priority markers never use a widget (they are styled in place), so
`IconWidget` always renders an icon. `toDOM()` returns a single
`<span class="mr-badge mr-badge-<id> mr-badge-icon">` with `setIcon()`. It
implements `eq()` (constructed from primitives → CM6 dedupes and reuses the DOM
node across rebuilds) and `ignoreEvent()` returns `true` (the widget is opaque;
clicks place the caret cleanly before/after it). No entrance animation.

### 3.4 The reading-view post-processor

`src/reading/postProcessor.ts` mirrors Live Preview structurally. For each
`<li>` it finds the first meaningful text node, runs the same matcher, and on a
hit: strips the trigger (+ one space) from the text, adds
`class="mr-line mr-line-<id>"` to the `<li>` itself (the line-background
equivalent), and `prepend`s a single `<span class="mr-badge mr-badge-<id>">` —
`setIcon()` for icon markers, the raw trigger text otherwise. Tooltip wiring
uses Obsidian's native `aria-label` + `data-tooltip-position`. No `innerHTML`,
no string concatenation into the DOM.

### 3.5 Theme variables and CSS

`styles.css` ships the static rules; per-marker colours flow through **one**
managed `<style id="mr-vars">` element created on load and removed on unload.

- **Line background** — `.cm-line.mr-line` / `li.mr-line` get a tinted
  `background` (`color-mix(... var(--mr-marker-bg) ~28% ...)`), `border-radius`
  (`--mr-line-radius`), and a `background-color` transition for smooth recolours.
- **Trigger badge** — `.mr-badge` gets `background: var(--mr-marker-bg)`,
  `color: var(--mr-marker-fg)`, `border-radius: var(--mr-badge-radius)` — and
  nothing that changes glyph metrics. `.mr-badge-icon` adds icon sizing /
  alignment (safe — it is a widget, not editable text).
- **Squircle** — `@supports (corner-shape: squircle)` upgrades the corners on
  Chromium (every Obsidian client); Safari/Firefox (Obsidian Publish) fall back
  to normal rounded corners.

`src/theme/cssVars.ts` rebuilds the managed `<style>` on every settings change.
It emits, per enabled marker, a `body.theme-light[data-markr]` and
`body.theme-dark[data-markr]` rule scoped to `:is(.mr-line-<id>, .mr-badge-<id>)`
setting `--mr-marker-bg` / `--mr-marker-fg` from the marker's `ColorPair`. The
`[data-markr]` attribute is attached to `document.body` on load and removed on
unload — the "scope CSS to plugin containers" guideline.

**Style Settings plugin integration:** `--mr-line-radius`, `--mr-badge-radius`,
and the per-marker colour vars are the documented override points.

### 3.6 Plugin lifecycle

```ts
// src/main.ts (sketch)
export default class MarkrPlugin extends Plugin {
  settings!: PluginSettings;
  private themeEl: HTMLStyleElement | null = null;

  async onload() {
    this.settings = migrate(await this.loadData()) ?? DEFAULT_SETTINGS;
    document.body.dataset.markr = "";
    this.themeEl = document.head.createEl("style", { attr: { id: "mr-vars" } });
    this.refreshTheme();

    this.registerEditorExtension(buildMarkrExtension(() => this.settings));
    this.registerMarkdownPostProcessor(buildPostProcessor(() => this.settings));
    this.addSettingTab(new MarkrSettingTab(this.app, this));

    registerCommands(this, () => this.settings);  // see §7.5
  }

  async onunload() {
    this.themeEl?.remove();
    delete document.body.dataset.markr;
    // No detachLeavesOfType, no manual event removal — register* handles it.
  }

  async updateSettings(next: PluginSettings) {
    this.settings = next;
    await this.saveData(next);
    this.refreshTheme();
    this.app.workspace.updateOptions(); // triggers CM6 to re-evaluate extensions
  }

  private refreshTheme() {
    if (this.themeEl) this.themeEl.textContent = renderVars(this.settings);
  }
}
```

---

## 4. Performance plan

The original's #62 and #75 are real, but the fix isn't a single trick — it's understanding where time actually goes and not wasting effort on the wrong layer. This section is organized by tier: what we ship in v1, what we add if benchmarks demand it, and what we deliberately don't do.

### 4.1 The four cost centers

Every frame, the plugin spends time in one of four places. Knowing which dominates is what tells us where optimization actually helps.

1. **Trigger matching** — scanning each visible list line for a trigger via the trie. Per-line: ~5 nanoseconds. With ≤20 markers and triggers ≤3 chars, this is never the bottleneck.
2. **Syntax-tree walking** — asking CodeMirror "which nodes in the visible range are list items?" via `syntaxTree.iterate`. Where most actual time goes on large files. Linear in *visible* nodes, not total nodes.
3. **Decoration set construction** — building the `RangeSetBuilder<Decoration>` and emitting line + replace decorations. Allocation-sensitive: with proper `eq()` on widgets, CM6 dedupes and the cost is low. Without it, every doc change rebuilds every widget DOM node — a hidden 10× slowdown.
4. **DOM application** — CM6 diffing our `DecorationSet` against the previous one and patching DOM. Linear in *changes*, not total decorations. Stable decoration sets are nearly free to re-apply.

### 4.2 Why file size doesn't dominate

CodeMirror 6's architecture does the file-size optimization for us, transparently:

- **`view.visibleRanges`** is a literal list of byte ranges currently rendered, plus a small over-scan margin (a few hundred lines above and below the viewport). It is not the whole document, not even the whole scrollable area.
- **Lezer (CM6's parser)** does partial, incremental parsing — the visible region first, the rest in the background. The plugin sees a usable syntax tree for the visible range within the first frame, regardless of total file size.
- **The Reading View post-processor** is chunked by markdown block, processed lazily as blocks scroll into view. Same lazy-loading pattern, different layer.

Opening a 5MB file with a marker on every line costs the same first-paint as opening a 50KB file, because only ~50 visible lines are ever inspected at once. The optimization the user might *expect* us to write — "if file is big, only load nearby content" — is already happening at the CM6 layer, and we ride on top of it.

**The implication for design:** we don't add file-size-conditional logic to the hot path. Doing so would either duplicate work CM6 already does, or actively interfere with its scheduling. The one exception is the kill-switch sentinel below (§4.4), which addresses pathological cases that bypass the viewport entirely.

### 4.3 Tier 0 — Baseline (always on, in v1)

What we get from following the spec exactly:

- **Viewport-only iteration.** `syntaxTree.iterate` over `view.visibleRanges`, never the whole doc.
- **Single builder per update.** One `RangeSetBuilder` allocation, returned as one `DecorationSet`. CM6's diff handles re-renders efficiently when the set is structurally similar.
- **Trie-based trigger matching.** Built once per settings change, never per call. Lookups O(k≤3).
- **Stable widgets via `eq()`.** `IconWidget` instances are constructed with primitives and implement `eq()`:

```ts
class IconWidget extends WidgetType {
  constructor(private readonly defId: string, private readonly icon: string) { super(); }
  eq(other: IconWidget) { return other.defId === this.defId && other.icon === this.icon; }
  toDOM() {
    const el = document.createElement("span");
    el.className = `mr-marker mr-marker-${this.defId}`;
    setIcon(el, this.icon);
    return el;
  }
  ignoreEvent() { return false; }
}
```

  This is the under-discussed perf knob — without it, every doc change rebuilds every widget DOM node.

- **No `<style>` per render.** One managed `<style id="mr-vars">` element, updated only on settings change.
- **Inheritance stack is O(depth).** When `nestedInheritance` is on, the iterator maintains a stack of `(indentLevel, defId)`. Capped at 3 levels.
- **Post-processor early bail.** First-text-node mismatch returns before any DOM work.

### 4.4 Tier 1 — Free wins (also in v1)

Cheap to implement, measurable improvement. These get added to the implementation alongside Tier 0.

**Skip update when nothing meaningful changed.**

```ts
update(u: ViewUpdate) {
  const cursorMoved = u.selectionSet && !u.docChanged;
  const cursorMatters = this.settings.behavior.hideMarkerWhenCursorAway;

  if (!u.docChanged && !u.viewportChanged && !(cursorMoved && cursorMatters)) {
    return;  // focus, composition, IME — nothing to do
  }
  // ...
}
```

CM6 fires `update` for focus, composition, and IME events that don't affect our output. Skipping these is ~30% fewer update calls in steady-state typing.

**Pre-filter list lines by first character.** Before the trie lookup, check if the line's first non-whitespace post-bullet character is even *possible* as a trigger start:

```ts
const firstChars = matcher.firstCharSet();  // e.g. Set { "!", "?", "~", "@" }
if (!firstChars.has(line.text[contentStart])) return;
```

For a long file where most list items aren't marked, this skips the trie entirely on ~95% of lines. Pure win, ~3 lines of code.

**Cache the previous cursor line.** Re-derive `view.state.doc.lineAt(...)` only when selection actually moved. Saves one tree lookup per `update()` on non-selection paths.

**Sentinel for pathological cases — `maxFileSizeKB`.** If `state.doc.length > settings.performance.maxFileSizeKB * 1024`, return an empty `DecorationSet`. **This is not a primary optimization** — Tier 0 + Tier 1 already make file size irrelevant for normal use. The sentinel exists as a safety valve for workflows that bypass the viewport: programmatic full-document scans, search-and-replace operations, export-to-PDF rendering the whole document at once. Default off (0 = unlimited); user opt-in only.

### 4.5 Tier 2 — Conditional (only if benchmarks demand)

Real engineering work, real wins, but worth waiting for evidence before paying the complexity cost.

**State field for incremental decoration updates.** Currently we rebuild the entire `DecorationSet` on every `update()`, even when only one line changed. CM6 supports a pattern using `StateField<DecorationSet>` where decorations are mapped through document changes — old decorations stay put when their lines didn't change, only modified lines rebuild.

For a doc with 1000 marker lines and the user typing one character, this drops work from "scan 1000 visible lines" to "scan 1 line." But visible lines are already capped by viewport (~50), so the absolute savings might be 0.5ms per keystroke at most.

Worth it if the syntax-tree walk shows up in profiles as a real bottleneck. Adds ~100 lines of code over the simple builder approach — mapping through `tr.changes`, handling line insertions/deletions, reconciling against the syntax tree. We measure before committing to this.

**Cached "last viewport" short-circuit.** If `view.visibleRanges` is byte-identical to the previous update and the document didn't change, return the cached `DecorationSet` directly. CM6 already does some of this internally; explicit caching may or may not help — needs measurement.

### 4.6 Things we deliberately don't do

Common "optimizations" that are traps:

- **Debouncing `update()`.** Sounds smart, breaks the typing UX. CM6 already batches within a frame; debouncing adds visible lag between keystroke and visual response. (The `debounceMs` setting that appeared in early drafts of this spec is deliberately removed.)
- **`requestIdleCallback` for the post-processor.** Reading view's post-processor pipeline is already chunked by markdown block and scheduled by Obsidian. Adding our own scheduling fights the host.
- **Manual memoization of `matchTrigger` results.** The match is cheaper than a Map lookup at this scale. Profiling shows this immediately.
- **File-size-conditional logic on the hot path.** Duplicates CM6's viewport optimization or interferes with its scheduling. See §4.2.
- **Diffing decoration positions ourselves.** CM6's `RangeSet.eq()` and diff machinery are already optimal. We'd only slow it down.

### 4.7 Non-goals

Made explicit so future contributors don't accidentally violate them:

- **We don't optimize for file size, we optimize for visible content.** Anyone proposing a "smart loading" patch keyed on `state.doc.length` should be pointed at §4.2 first.
- **We don't add new scheduling primitives.** CM6 and Obsidian both schedule; we participate, we don't compete.
- **We don't preemptively cache.** Allocations are cheap, dedupe-via-`eq()` is what matters. Caching adds invalidation bugs; we only add it when a profile says we must.

### 4.8 Benchmarks before 1.0

Concrete targets, measured on a mid-tier laptop (M-series MacBook Air or equivalent):

- **10k-line file, 200 marker lines, scrolling.** No dropped frames at 60fps.
- **Pathological case: 50k-line file, nested lists, 5000 marker lines, scrolling.** No dropped frames. *This is the test that decides Tier 2.*
- **Steady-state typing in a marked-up note.** <1ms plugin work per keystroke.
- **Settings update (changing one color).** Re-render under 16ms.
- **Plugin enable/disable toggle.** Under 50ms.
- **Memory: open then close 50 large notes.** No measurable growth.

If the 50k-line case passes, ship v1 with Tier 0 + Tier 1. If it fails, that's the Tier 2 trigger.

---

## 5. Best-in-class TypeScript checklist

These are the non-negotiables, taken from the eslint-plugin-obsidianmd ruleset + general TS hygiene.

**tsconfig**
- `"strict": true`
- `"noUncheckedIndexedAccess": true`
- `"exactOptionalPropertyTypes": true`
- `"noImplicitOverride": true`
- `"noFallthroughCasesInSwitch": true`
- `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`

**Patterns**
- Discriminated unions for anything with a "kind" — settings color, match results, command payloads.
- Branded types for trigger strings and marker IDs to prevent string mix-ups.
- `instanceof TFile` / `instanceof TFolder`, never `as TFile`.
- All async paths have explicit error handling — no silent rejections.
- Pure functions in `util/` and `editor/matcher.ts` — testable in isolation without Obsidian.
- Result types (`type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`) for settings parsing and migration.

**Linting**
- `eslint-plugin-obsidianmd` (current v0.2.8) with `recommended` config.
- `@typescript-eslint/strict-type-checked` on top.
- Pre-commit: `eslint --fix && tsc --noEmit`.

**Testing**
- `vitest` for `util/` and `editor/matcher.ts`. Obsidian APIs are mocked, so we only test our pure code.
- No e2e — Obsidian isn't headless-friendly. Manual test plan in `TESTING.md`.

---

## 6. Submission readiness

Tied to the official guidelines + eslint rules so the submission bot doesn't bounce us.

- **Plugin ID:** `markr` (lowercase, no "obsidian", doesn't end in "plugin").
- **Plugin name:** "Markr" (no "Obsidian", doesn't end in "Plugin", doesn't start with "Obsi").
- **Description:** "Style bullet list items with colored markers, priority levels, and icons." (no "Obsidian", no "This plugin", ends with `.`)
- **No default hotkeys.** All commands ship unbound — see §7.5.
- **Sentence case** for every UI string, including command names.
- **`requestUrl()`** if we ever fetch (we don't, currently).
- **No `innerHTML` / `outerHTML`** — use `createEl`, `setText`, `setIcon`.
- **No `<style>` injection per-render** — one managed `<style>` element, removed in `onunload`.
- **No `detachLeavesOfType` in `onunload`** — Obsidian handles it.
- **No regex lookbehind** anywhere (iOS Safari).
- **A11y:** icon spans get `aria-hidden="true"` (decorative); marker tooltips use `aria-label` + `data-tooltip-position`; settings buttons get `aria-label`; focus ring via `:focus-visible`.
- **MIT license**, fresh `LICENSE` file with current year and your name.

---

## 7. Selected features for v1

These are committed scope on top of the inventory in §2. Items in §8 are backlog (not v1).

### 7.1 Priority levels — `!` / `!!` / `!!!`

The flagship feature. Three priority markers, distinguished by the count of
"bangs". Replaces what was initially scoped as an "Eisenhower preset" — the
underlying need was visual priority signal in flat project logs, not the
four-quadrant framework specifically.

**Colour.** All three priority levels share **one** soft-pink colour pair
(light/dark split) — they are told apart by the trigger glyphs (`!` / `!!` /
`!!!`), not by a colour ramp. Priority markers have **no icon** (`icon: null`):
they render as the trigger text inside an `.mr-badge` highlight, not as a
replace-widget. Exact values live in `DEFAULT_SETTINGS` (`src/settings/types.ts`).

**Matcher behavior.** Longest-match-wins. Source `- !!! Patch the CVE` parses as `!!!`, not `!!` + `!`. The matcher trie is built once per settings change and keeps the priority entries at fixed positions for fast lookup.

**Why three levels, not five.** Past three "bangs" the marker becomes noise, and users lose discrimination between levels. Three maps cleanly to "must do today / this week / sometime."

**Toggle.** A single setting (`priority.enabled`) switches the priority system on or off. When off, `!`/`!!`/`!!!` triggers free up for use as ordinary custom markers — useful for users who don't want the priority semantics.

**Markdown example:**

```
- !!! Ship the security patch before Friday
- !!  Draft the incident report
- !   Update the runbook
- ~   Background reading on rate limiting
- ?   Is Postgres 17 stable enough?
```

### 7.2 Hover preview / tooltip

Hovering a marker shows the marker's `label` as a tooltip. Implementation:

- **Live Preview:** the `IconWidget`'s root element gets `aria-label={label}` plus Obsidian's `data-tooltip-position="top"` attribute. Obsidian renders the tooltip; we don't ship our own.
- **Reading View:** same attributes on the icon span in the post-processor.
- **A11y bonus:** screen readers announce the label, which closes the accessibility gap that icon-only markers create.

Settings: one toggle `behavior.showTooltips` (default on). Zero perf cost — attribute-only, no event listeners.

### 7.3 Nested marker inheritance (experimental)

When a list item without its own trigger is indented under one *with* a trigger, the child inherits a faint version of the parent's color. Pure visual grouping.

**Approach:**

- During tree iteration, track a stack of `(indentLevel, defId)` parents.
- When entering a list item, if its trigger doesn't match, but its indent level is greater than the top of the stack, apply a `mr-line mr-${parentId} mr-child` class.
- CSS uses `mr-child` to dial the color down (e.g. background opacity 0.35, no foreground change).

**Caveats:**

- Costs a small stack in the iterator (trivial).
- Cap inheritance at 3 levels to avoid runaway styling.
- Marked **experimental** in the UI for v1. Behind `behavior.nestedInheritance` (default off).

### 7.4 Settings UX

The settings panel currently has three sections:

**Debug.** `priority.enabled` toggle, the `hideMarkerWhenCursorAway` and
`showTooltips` behavior toggles, and a "Reset settings to defaults" button.

**Markers.** Read-only list of the configured markers (trigger, label, icon).
Full inline editing — add / remove / reorder, icon picker, colour picker — is
still to build (see §7.7); this section is currently view-only.

**Performance.** `maxFileSizeKB` (default 0 = unlimited) and `applyInReadingView`
(default on). Both ship off the hot path.

> The fuller five-section design (Appearance / Priority / Markers / Performance
> / Advanced with a fixed-grid editable row layout, locked priority rows, live
> preview chips, an "Import from List Callouts" migration tool) is the target
> for the settings polish pass — not yet built.

### 7.5 Commands and hotkeys

The plugin contributes a generated set of commands. **No default hotkeys** — users bind in Obsidian's standard hotkey panel.

**Currently implemented** (`src/commands.ts`), all gated on `priority.enabled`
for the priority ones:

- `markr:apply-p1` / `apply-p2` / `apply-p3` — "Apply important / high priority
  / highest priority" — sets that priority on the current line.
- `markr:cycle-priority` — cycles `(none) → ! → !! → !!! → (none)` on the line.
- `markr:remove` — "Remove marker from line" (closes issue #71).

Per-marker apply commands for *custom* markers are planned but not yet wired.

**Apply / cycle semantics: replace, not toggle, not insert.** If the line
already has a marker, it is replaced; otherwise the trigger is prepended after
the list bullet. Both commands rewrite only the trigger region with
`editor.replaceRange` and then re-place the caret by the prefix-length delta, so
the cursor stays where it was rather than jumping to column 0.

**Command palette UX (target).** Each apply-command should get a colored chip
preview; the label is the human-readable marker name ("Apply question"), not the
trigger character.

### 7.6 Export-aware rendering (investigate during v1)

The reading-view post-processor's output is already PDF/HTML-export friendly because it produces real DOM with classes that match our static `styles.css`. The questions to answer empirically:

- Does Obsidian's "Export to PDF" run our post-processor? (Almost certainly yes — export goes through reading view.)
- Does it pick up our `<style id="mr-vars">` element with the per-user color vars?
- Do icons render? `setIcon()` produces inline SVG, which embeds cleanly in PDF.

**Plan:** spike during v1 implementation, document findings in `TESTING.md`. If colors don't survive export, fallback is to emit a `<style>` block inside the post-processor output for the affected markers.

### 7.7 Items still to decide

1. **Color picker UX in the Markers section.** Native `<input type="color">` is free but ugly. Curated palette (8–10 pre-tuned light/dark ramps) is more opinionated but produces consistently good-looking output. Lean curated.
2. **Migration from the original plugin.** Read its `data.json` on first run, offer to import. Nice-to-have, not blocking.
3. **Bundled custom defaults** (alongside priority): `?`, `~`, `@`. Anything else?
4. **Mobile.** `isDesktopOnly: false`. Recommended yes — we follow the iOS rules anyway.

---

## 8. Backlog (post-v1)

Ideas explicitly out of v1 scope, captured so we don't lose them:

- **Autosuggest dropdown** (issue #76) — typing `-` + space triggers a popup of available markers. Doable with Obsidian's `EditorSuggest` API.
- **Aliases per marker** (issue #77) — type fields already in `MarkerDef` for custom markers. Wire up matcher + settings UI in v1.1.
- **Multi-character non-priority triggers** — markers like `>` for "decision" or `??` for "needs research." The trie supports it; we just need the settings UI to allow it.
- **Per-folder or per-tag overrides** — "in folders matching X, swap marker `!` for marker `urgent`."
- **"Convert to native callout" command** — rewrites `- ! Important thing` as `> [!important] Important thing`.
- **Frontmatter scope** — `markr: priority-only` to selectively enable categories per-note.
- **Custom regex triggers** (advanced) — match `[TODO]` or `>>` patterns. Locked behind an advanced toggle.

---

## 9. Development

The repo is bootstrapped — scaffold, build pipeline, and the file layout in
§3.1 are in place. Day-to-day:

- `npm run dev` — esbuild in watch mode (inline sourcemaps). Produces `main.js`
  at the repo root.
- `npm run build` — `tsc -noEmit` typecheck, then a production esbuild.
- `npm run lint` — `eslint` (`eslint-plugin-obsidianmd` + typescript-eslint).
- `npm run version` — bumps `manifest.json` / `versions.json` / `package.json`.

Dev loop: symlink the repo into a **test vault** (`<vault>/.obsidian/plugins/markr`),
enable the plugin, and install the **Hot Reload** plugin (pjeby) so saves in
`src/` reload Markr automatically. Desktop Obsidian only — the mobile app can't
load dev plugins.

**Reference links**

- Plugin developer docs — https://docs.obsidian.md/Home
- Submission guidelines — https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- `eslint-plugin-obsidianmd` — https://www.npmjs.com/package/eslint-plugin-obsidianmd
- CM6 `ViewPlugin` — https://codemirror.net/docs/ref/#view.ViewPlugin
- CM6 decorations — https://codemirror.net/docs/ref/#view.Decoration
- Hot Reload — https://github.com/pjeby/hot-reload

**Not yet built:** `settings/migrate.ts` (real migration chain), inline marker
editing + `settings/iconPicker.ts`, per-custom-marker apply commands, nested
inheritance (§7.3), export spike (§7.6), the §4.8 benchmark pass.

---

## 10. Iteration history of this document

- **v0.1** — initial draft: inventory, architecture, perf plan, TS checklist, submission gates.
- **v0.2** — added committed feature scope: multi-char triggers with Eisenhower preset, hover tooltips, nested inheritance (experimental), export investigation. Type system updated for variable-length triggers; matcher switches from `Map` lookup to trie.
- **v0.3** — major revision based on design review:
  - **Renamed** plugin to *Markr* (ID `markr`). "Callouts" collides with Obsidian's native callouts; "marker" is more accurate.
  - **Eisenhower preset removed**, replaced with first-class **Priority Levels** (`!` / `!!` / `!!!`, red ramp, longest-match-wins). The framework was a stand-in for the underlying need: visual priority in flat project logs.
  - **Type system reshaped** around a `kind: "priority" | "custom"` discriminant on `MarkerDef` instead of a separate presets field. Cleaner, removes runtime merging logic.
  - **CSS class prefix** changed from `lh-` to `mr-`.
  - **Squircle corners** added via `@supports (corner-shape: squircle)` — Chromium ships it (every Obsidian client), Safari/Firefox fall back gracefully.
  - **Settings UX spec** added (§7.4): five-section layout with consistent borderless-until-focus row chrome, live preview chips, locked priority rows.
  - **Commands & hotkeys spec** added (§7.5): dynamic per-marker apply commands, universal remove + cycle commands, replace semantics, no default hotkeys.
  - **Backlog (§8)** separated from committed v1 scope — autosuggest, aliases, multi-char custom triggers, frontmatter scope all moved here.
  - **Date pills** considered and dropped from v1.
- **v0.4** — performance plan restructured into tiered approach:
  - **§4 fully rewritten** with the four cost centers (matching, syntax walk, decoration set, DOM apply), the viewport-already-handles-file-size explanation, and explicit tiers: Tier 0 (baseline), Tier 1 (free wins shipped in v1), Tier 2 (state field, conditional on benchmarks), and Don't-Do traps.
  - **Tier 1 wins** added: skip-on-no-meaningful-change, first-char pre-filter, cursor-line cache.
  - **`maxFileSizeKB`** reframed as a pathological-case safety valve, not a primary optimization.
  - **Non-goals** made explicit (§4.7) so future contributors don't accidentally violate them.
  - **Benchmarks** expanded with a 50k-line pathological case as the Tier-2 trigger.
  - **Icon picker empty state** simplified (§7.4): no `ti-photo` placeholder. The slot renders truly empty when no icon is set; hover/focus underline keeps it discoverable.
- **v0.5** — renamed plugin from *List Markers* to **Markr** throughout. Plugin ID is now `markr`, CSS class prefix is `mr-`, data attribute is `data-markr`, main class is `MarkrPlugin`. Submission readiness section (§6) updated with new metadata.
- **v0.6** — added **§9 "Getting started"**, a self-contained bootstrap playbook for local development. Covers prerequisites, scaffolding from the official sample plugin, test vault setup, symlink workflow, the hello-world smoke test, Hot Reload integration, and an ordered implementation sequence (steps 1–14) that maps each source file to the spec section that defines it. Iteration history renumbered to §10.
- **v0.7** — trimmed and reconciled the spec with the shipped code:
  - **§3.2** updated to the real type shape — schema `version` is a bumpable
    number (no migration chain yet; stale data is discarded on load),
    `MarkerColor` carries `{bg, fg}` `ColorPair`s, no `appearance` block.
  - **§3.3–§3.5 rewritten** to the actual rendering architecture after a
    patch-by-patch detour was unwound: `Decoration.line` for the full-width
    line background + a layout-neutral `.mr-badge` `Decoration.mark` (priority)
    or `IconWidget` replace (icon markers) for the trigger. Added §3.3a
    (`matchListLine` — a positionally-scoped regex, sufficient without
    `syntaxTree`) and §3.3b (`IconWidget`). Recorded the dead-ends (inline tint
    span over the body, fixed-width swap widget) as a warning — they broke
    link/code/bracket rendering, wrapped-line backgrounds, and cursor mapping.
  - **§7.1** — priority levels share a single colour, distinguished by glyph
    count; priority markers have `icon: null` and render as text badges.
  - **§7.4 / §7.5** — settings is three sections (Debug / Markers /
    Performance); commands are the three priority applies, one
    `cycle-priority`, and `remove` — all cursor-preserving via `replaceRange`.
  - **§9** — the bootstrap playbook is done; collapsed to a short Development
    section (build commands, dev loop, what's still unbuilt).
