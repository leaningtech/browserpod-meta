%title: Feature tour
%author: leaningtech

-> # FEATURES <-

This is a second deck. You arrived here by
following the [[intro]] wikilink.

Press `[` to go back to where you were.

---

## Where each idea came from

* `mdp`         metadata bars, centering, step reveal
* `presenterm`  footer page count, speaker notes, pauses
* `glow`        word wrap, styled quotes and lists
* `mdfried`     big ASCII headers
* `frogmouth`   file browser, table of contents, history
* `ekphos`      wikilinks, search, configurable themes,
                link map, editor

Press `c` anywhere to configure the colour
theme live and save it into theme.json.

---

## Search me

Press `/` and type a word. Matching slides
are listed with context; enter jumps straight
to one. This mirrors ekphos full-text search.

Some words to find: fibonacci, theme, BrowserPod.

---

## Code still highlights

```js
function fibonacci (n) {
  return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2)
}
```

The original tslide JavaScript highlighter is
preserved underneath everything new.

---

-> ## Back to the start <-

Return to [[intro]] with the `]` key, or `[`
to pop the history stack.
