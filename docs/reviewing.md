# Reviewing

In the queue, <kbd>j</kbd> and <kbd>k</kbd> move between cards, <kbd>1</kbd>
<kbd>2</kbd> <kbd>3</kbd> mark the card under the cursor real / needs a look /
artifact, <kbd>n</kbd> writes a note on it, <kbd>o</kbd> opens it in JBrowse and
<kbd>/</kbd> jumps to the search box. Pressing the same digit again clears the
verdict.

<kbd>t</kbd> swaps the cards for the table, where the same keys set a row's
verdict and <kbd>Enter</kbd> opens its card. The table splits the queue into one
section per class, each in the chosen order, and <kbd>j</kbd> and <kbd>k</kbd>
walk the sections top to bottom. The order menu sorts by size, by split reads,
by the reads a control has, or by any number in the caller's sample column.

With the verdict filter on **Unreviewed**, each card leaves the queue once it
has a verdict.

The URL updates with the filters, the order and the card under the cursor, so
copying it gives a link to that card in that queue.

## Saving verdicts

The portal stores verdicts and notes in the reviewer's browser. **Export**
writes them as TSV beside each record's line, id, coordinates, genes and
supporting-read counts, and **Import** reads that TSV back, so a second
reviewer, or the same one after clearing the browser, continues the review from
there.

Until an export, the verdicts are in one browser only, so the **Export** button
counts the cards judged or noted since the last export or import, as
`Export · 3 new`.
