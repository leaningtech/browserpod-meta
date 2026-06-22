%title: SLOTH in BrowserPod
%author: leaningtech
%date: 2026-06-18

-> # SLOTH <-

-> a terminal slide deck, running in your browser <-

*press space, then the arrow keys*

<br>

This deck shows the features folded in from
mdp, presenterm, glow, mdfried, frogmouth and ekphos.

<!-- speaker_note: Welcome them, then press space to reveal the subtitle. -->

---

## Big headers

The H1 on the first slide was rendered as
**actual bigger text** using a built-in ASCII
figure font, the way `mdfried` enlarges headers.

No graphics protocol required, so it works
in a plain BrowserPod terminal.

---

## Reveal step by step

This line is visible immediately.

<br>

This one appears on the next space press.

<br>

And this one after that. The footer shows
the current step, like `presenterm` pauses.

<!-- speaker_note: Tap space three times here. -->

---

-> ## Centering and styling <-

> Blockquotes get a coloured bar, like glow.

* bullets are themed
* so are `inline code` spans
* and **bold** / _underline_

Long paragraphs wrap to the width of your
terminal automatically, which is the behaviour
glow exposes through its -w flag, so nothing
runs off the right edge no matter how wide or
narrow the window happens to be right now.

---

## Linked decks

This deck links to [[features]] using a
wikilink, the way ekphos connects notes.

Press `]` to follow the link to that deck,
then `[` to come back. Press `m` to see the
ASCII link map of how the decks connect.

<!-- speaker_note: Press ] to jump to features.md live. -->

---

## Run code from a slide

This block is runnable. Press `r` to write it to
hello.js and run it inside the Pod.

<!-- run: node hello.js as: hello.js -->
```js
console.log('Hello from a SLOTH slide!')
console.log(2 + 2)
```

The output opens in a run pane. Esc returns here.

---

## Show a file, live

The `Files` menu holds supporting files. This slide
shows the live contents of package.json with a
cat directive, so the slide always matches the file:

<!-- cat: package.json -->

Edit it from the Files menu and this updates.

---

## Serve something

A server's portal URL appears in the run pane.
Press `r` to start a tiny HTTP server:

<!-- run: node server.js as: server.js -->
```js
require('http').createServer((req, res) => {
  res.end('Served from inside a SLOTH slide\n')
}).listen(8080)
console.log('listening on 8080')
```

---

-> ## Controls <-

* `r`  run a slide's code block (in a run pane)
* `t`  table of contents (frogmouth)
* `/`  search across the deck (ekphos)
* `o`  open another file (frogmouth browser)
* `m`  link map (ekphos)
* `e`  edit this deck (just type; Esc to save/quit)
* `T`  cycle colour theme
* `c`  configure the theme, saved to theme.json
* `n`  toggle speaker notes

Built with SLOTH + BrowserPod. :sparkles:
