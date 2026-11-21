# Reviewing

Each card asks one question, **Is the call real?**, and offers its answers as
buttons under the images, each with its key: <kbd>1</kbd> Real, <kbd>2</kbd>
Needs a look, <kbd>3</kbd> Artifact. A trio card asks **What do the trio's reads
show?** instead. **Clear**, or <kbd>0</kbd>, takes the answer back and leaves
the card unreviewed.

In the queue, <kbd>j</kbd> and <kbd>k</kbd> move between cards, an answer's key
answers the card under the cursor, <kbd>n</kbd> writes a note on it,
<kbd>o</kbd> opens it in JBrowse and <kbd>/</kbd> jumps to the search box.

<kbd>t</kbd> swaps the cards for the table, where the same keys set a row's
verdict and <kbd>Enter</kbd> opens its card. The table splits the queue into one
section per class, each in the chosen order, and <kbd>j</kbd> and <kbd>k</kbd>
walk the sections top to bottom. The order menu sorts by size, by split reads,
by the reads a control has, or by any number in the caller's sample column.

With the verdict filter on **Unreviewed**, each card leaves the queue once it
has a verdict.

The URL updates with the filters, the order and the card under the cursor, so
copying it gives a link to that card in that queue.

## Asking your own question

`--question question.json` replaces the question and its answers, as
[SV-plaudit](https://github.com/jbelyeu/SV-plaudit)'s `-q` and `-A` do:

```json
{
  "question": "Does the sample's evidence support the call?",
  "answers": [
    { "label": "Supports", "key": "s", "tone": "real" },
    { "label": "Does not support", "key": "d", "tone": "artifact" },
    { "label": "De novo", "key": "v", "tone": "accent" }
  ]
}
```

- `label` is the button's text, and the only field an answer needs.
- `value` is what the browser stores and **Export** writes in the `verdict`
  column. It is the label unless given. The page drops a stored answer no button
  offers, so to rename a label, keep the answers already given by giving the old
  label as its `value`.
- `key` is one character. It is the answer's place, 1 up, unless given, and the
  build refuses a key the page uses already, such as <kbd>n</kbd> for a note.
- `tone` colors the button when pressed: `real`, `unsure`, `artifact` or
  `accent`.
- `title` is the button's tooltip.

## Saving verdicts

The portal stores verdicts and notes in the reviewer's browser. **Export**
writes them as TSV beside each record's line, id, coordinates, genes and
supporting-read counts, and **Import** reads that TSV back, so a second
reviewer, or the same one after clearing the browser, continues the review from
there.

Until an export, the verdicts are in one browser only, so the **Export** button
counts the cards judged or noted since the last export or import, as
`Export · 3 new`.
