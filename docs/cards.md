# What a card holds

- **One image, every track.** `jb2export` draws a chromosome a row. Loci on one
  chromosome are a linear view: one window, or the two ends of a deletion,
  duplication or inversion side by side under the arc of the reads joining them.
  A junction between two chromosomes is a breakpoint split view, one panel a
  chromosome, and an event's loci on one chromosome share its row. Each has the
  sample's reads above its control's, split reads and reads carrying a large
  deletion on top. Any other track of the run is in the image too: genes, the
  callset itself, repeats. The image scales to the window so a whole card is on
  screen at once; click it, or press <kbd>f</kbd>, for full size.
- **The caller's read counts.** The queue is grouped on the supporting reads the
  VCF itself records, so `--support` is required: the FORMAT keys the caller
  counts them under, the sample's first and its controls' after.
  `--support AD,NAD` reads nanomonsv's tumor and normal counts from one column,
  and `--support TUMOR:AD,NORMAL:AD` reads `AD` from two. Which column is the
  sample is the builder's to say: left out, the build stops and lists the VCF's
  samples and numeric FORMAT keys. The support filter sorts a callset three
  ways: no supporting read, supporting reads in a control too, supporting reads
  in the sample only.
- **jb2export's counts, as a second opinion.** `jb2export` reports the split
  reads joining an image's windows, and, where a record's ALT says what a read
  carries (an SNV, an indel, a deletion or an insertion), the reads with the ALT
  over the reads covering it. A deletion of two windows has both, printed as
  `3 split + 4 gapped of 56 reads`. These stay on the card beside the caller's,
  where they catch a split read in the normal the caller did not count. They
  miss what the caller sees: on COLO829, `d_163` and `d_38` read zero here,
  because their reads delete a few bases right of the caller's position, where
  nanomonsv's `AD` has 3 and 4. For a VCF that records no counts,
  `--support jb2export` groups the queue on these instead.
- **What the caller wrote.** The record's `SVTYPE`, size, `FILTER` and `QUAL`,
  its sample columns (`AF`, `AD`, `DP`, whatever the caller's `FORMAT` holds)
  and, under **VCF record**, every `INFO` key. Hover a key or a filter for the
  header's description of it.
- **Genes.** A VCF annotated by SnpEff (`ANN`) or VEP (`CSQ`) puts the genes,
  the effect and the protein change (`p.Val600Glu`) of its highest-impact
  annotation on the card, an impact filter in the header, and all three in
  search.
- **Facets.** `--facet CLNSIG,CLNDN` prints those `INFO` keys on every card and
  adds a filter for each to the header. `FILTER` is one already when a callset
  has more than one.
- **A caller's `EVENT` is a filter**, and the chip on a card selects it. An
  event visiting more than two loci has a card of its own, every locus in one
  image. JBrowse reads the standard key;
  [Severus's `CLUSTERID` takes a rename](https://jbrowse.org/jb2/docs/user_guides/sv_inspector_view/#rearrangement-events).
- **A link**, given `--jbrowse` and `--config`: see
  [Links back into JBrowse](rendering.md#links-back-into-jbrowse).
