# Reviewing

The queue takes the keyboard: <kbd>j</kbd> and <kbd>k</kbd> move, <kbd>1</kbd>
<kbd>2</kbd> <kbd>3</kbd> are real / needs a look / artifact on the card under
the cursor, <kbd>n</kbd> writes a note on it, <kbd>o</kbd> opens it in JBrowse
and <kbd>/</kbd> jumps to the search box. The same digit twice takes a verdict
back off.

<kbd>t</kbd> swaps the cards for the table, where the same keys judge a row and
<kbd>Enter</kbd> opens its card. The table splits the queue into one section per
class, each in the chosen order, and <kbd>j</kbd> and <kbd>k</kbd> walk the
sections top to bottom. The order select sorts either by size, by split reads,
by the reads a control has, or by any number in the caller's sample column.

Set **Unreviewed** as the verdict filter and the queue drains as it is judged.

The address bar follows the filters, the order and the card under the cursor, so
copying it is a link to that card in that queue.

## Saving verdicts

Verdicts and notes live in the reviewer's browser. **Export** writes them as TSV
beside each record's line, id, coordinates, genes and supporting-read counts,
and **Import** reads that TSV back, so a second reviewer or a cleared browser
does not start the review again.

Until then the work is in one browser only, so **Export** counts the cards
judged or noted since the last export or import, as `Export · 3 new`.
