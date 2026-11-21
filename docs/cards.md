# What a card holds

- **One image, every track.** `jb2export` draws a record as one linear view.
  - The two ends of a deletion, duplication, inversion or translocation, and
    every locus of an event, are windows side by side in one row under an arc of
    the reads joining them; a small variant is one window. A `jb2export` of
    5.0.0-beta.22 or older stacks the chromosomes of a translocation or an event
    as the panels of a breakpoint split view.
  - The sample's reads are above its control's, with split reads and reads with
    a large deletion on top. Any other track of the run is in the image too:
    genes, the callset itself, repeats.
  - The image scales to the window so a whole card is on screen at once; click
    it, or press <kbd>f</kbd>, for full size.
- **The caller's read counts.** The portal groups the queue by the
  supporting-read counts in the VCF, so `--support` is required. It names the
  FORMAT keys the caller counts them under, the sample's first and its controls'
  after.
  - `--support AD,NAD` reads nanomonsv's tumor and normal counts from one
    column, and `--support TUMOR:AD,NORMAL:AD` reads `AD` from two.
  - Without `--support`, the build stops and lists the VCF's samples and numeric
    FORMAT keys to choose from.
  - The support filter splits a callset into calls with no supporting read,
    calls with supporting reads in a control too, and calls supported in the
    sample alone.
- **jb2export's counts, as a second opinion.** `jb2export` reports the split
  reads joining an image's windows. Where a record's ALT spells out the change
  (an SNV, an indel, a deletion or an insertion), it also reports the reads with
  the ALT out of the reads covering it. A deletion drawn as two windows gets
  both counts, printed as `3 split + 4 gapped of 56 reads`.
  - The card shows these counts beside the caller's, so a reviewer can spot a
    split read in the normal that the caller did not count.
  - They can also come out lower than the caller's. On COLO829, `d_163` and
    `d_38` have zero here, because their reads have the deletion a few bases
    right of the caller's position, where nanomonsv's `AD` counts 3 and 4.
  - For a VCF without read counts, `--support jb2export` groups the queue by
    these counts instead.
- **What the caller wrote.** The record's `SVTYPE`, size, `FILTER` and `QUAL`,
  its sample columns (`AF`, `AD`, `DP`, whatever the caller's `FORMAT` holds)
  and, under **VCF record**, every `INFO` key. Hover a key or a filter for the
  header's description of it.
- **Genes.** For a VCF annotated by SnpEff (`ANN`) or VEP (`CSQ`), the card
  shows the genes, the effect and the protein change (`p.Val600Glu`) of the
  highest-impact annotation. The header gets an impact filter, and search covers
  all three.
- **Facets.** `--facet CLNSIG,CLNDN` prints those `INFO` keys on every card and
  adds a filter for each to the header. The header has a `FILTER` filter already
  when the callset holds more than one `FILTER` value.
- **A caller's `EVENT` is a filter**, and the chip on a card selects it. An
  event with more than two loci also gets a separate card that draws every locus
  in one image. JBrowse reads the standard `EVENT` key, and
  [Severus's `CLUSTERID` needs renaming to it](https://jbrowse.org/jb2/docs/user_guides/sv_inspector_view/#rearrangement-events).
- **A link**, given `--jbrowse` and `--config`: see
  [Links back into JBrowse](rendering.md#links-back-into-jbrowse).
