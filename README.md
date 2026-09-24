# Base Diagram

Turn any folder of notes into a relationship diagram — powered entirely by
[Bases](https://help.obsidian.md/bases) and your own frontmatter. No
proprietary file format, no separate database. Your notes are the data;
Base Diagram just draws them.

> Your notes stay the single source of truth. Base Diagram never stores your
> content anywhere else — it only reads what's already in your frontmatter.

## What it does

Point Base Diagram at a folder, and it will:

- Read every note's frontmatter and treat any **link-type property**
  (e.g. `related: "[[Other Note]]"`) as a relationship
- Draw each note as a table-style box: title, then its other properties
- Draw an arrow from the note that holds the link (the source) to the note
  it points to (the target)
- Let you drag boxes into whatever layout makes sense to you — positions are
  saved per folder, so they're still there next time you open the diagram
- Let a note open in a new tab with one click, right from its box

This is not a full ER-diagram tool with formal cardinality notation — it's a
lightweight way to see how the notes in one folder relate to each other,
using data you were probably already writing.

## Use cases

Base Diagram doesn't care what your notes are about — anything you can
express as "this note relates to that note" works:

- Character relationship maps for fiction writing
- Project structure: planning notes, research, tasks, and ideas
- Worldbuilding: locations, factions, and events
- Lightweight data or system design sketches

## Why not just use the graph view?

Obsidian's built-in graph view shows your *entire* vault, all the time,
with no control over layout. Base Diagram is scoped and intentional instead:

| | Graph view | Base Diagram |
|---|---|---|
| Scope | Whole vault | One folder |
| Layout | Automatic | Manual, saved |
| Shows | Links exist | What's inside each note |
| Best for | Discovery, browsing | Designing, structuring |

## Getting started

1. In a folder, add a link-type frontmatter property to a note, e.g.:

   ```yaml
   ---
   related:
     - "[[Some Other Note]]"
   type: table
   status: draft
   ---
   ```

2. With a note in that folder open, run **Open relation diagram** from the
   command palette.
3. Drag boxes around to arrange them. Your layout is remembered.
4. Click **Open note** on any box to jump straight to it.
5. After restarting Obsidian, click the refresh button in the view's
   header to redraw the diagram — no need to rerun the command.

## Tips for readable diagrams

- Keep property names and values short — long values are truncated to fit
  the box (hover a truncated value to see the full text)
- One note, one concept — split ideas across notes and link them, rather
  than cramming everything into one note
- Pick a consistent direction for your links (e.g. always link *from* a
  derivative note *to* its source) so arrows stay easy to read over time
- `related` (or whatever property you use for links) is not itself shown
  as a property row — it becomes the arrow instead

## Optional: color-coding

Add a `color` property to tint a note's box background:

```yaml
color: blue
```

Supported values: `red`, `blue`, `green`, `yellow`, `purple`. Any other
value, or no value at all, falls back to the default background.

## Requirements

- Obsidian 1.8.7 or later (for the Bases feature and language detection)

## Installation

### From Community Plugins (recommended)

1. Open **Settings → Community plugins** in Obsidian
2. If Restricted mode is on, click **Turn on community plugins**
3. Click **Browse** and search for **Base Diagram**
4. Click **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](../../releases/latest)
2. Create a folder `YourVault/.obsidian/plugins/bases-relation-diagram/`
3. Copy the three files into it
4. Reload Obsidian and enable **Base Diagram** in Community plugins

## Known limitations

- Layout is manual only — there's no automatic graph-layout algorithm, so
  relationship lines can cross or pass behind boxes on dense diagrams
- One diagram shows one folder at a time
- No formal cardinality notation (1-to-many, etc.) — just directional
  arrows

## License

See [LICENSE](./LICENSE).
