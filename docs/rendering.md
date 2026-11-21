# Rendering and building

A portal is built in two steps: `jb2export batch` draws one image per record,
and `variant-review-portal` turns those images and the VCF into a page.

```bash
# every alignments track in one run, so each record is one image; genes, the
# callset and repeats beside them show which genes a call hits and which
# repeats it lies in
# draw a read with its mate and its split segments in one row, and only the pairs
# that do not fit the reference as arcs
READS=(unit=chain readConnections.ordinaryPairs.show=false height:150)
jb2export batch --sites calls.vcf.gz --config config.json --assembly hg38 \
  --track genes height:50 --track calls height:50 \
  --track tumor_reads "${READS[@]}" --track normal_reads "${READS[@]}" \
  --track repeats height:50 --outDir reads --manifest

# name the tracks in the images, in track order: the sample, then its controls,
# and the FORMAT keys the caller counts their supporting reads under
variant-review-portal --vcf calls.vcf.gz \
  --images tumor,normal=reads --support TUMOR:AD,NORMAL:AD --out portal
```

## Versions

`jb2export` comes from
[`@jbrowse/img`](https://www.npmjs.com/package/@jbrowse/img). Its manifest needs
the `line` column, newer than 5.0.0-beta.8. Small variants and the reads with a
record's ALT need a `jb2export` newer than 5.0.0-beta.13, and a live link one
whose manifest has the `spec` column.

## Every read

A reads track given `height:150` is cut at 150 px. Given no height,
`jb2export batch` grows it to hold its pileup up to 250 px, the reads with the
ALT sorted to the top. `heightMode:grow growMaxHeight=1000` in place of
`height:` raises that ceiling so a 30x pileup is drawn whole, at the cost of
taller cards.

## Pairs and split reads

`unit=chain` is JBrowse's "View as pairs/link supplementary alignments": a read,
its mate and its split segments share one row, joined by a line in the color of
their insert size and orientation. A deletion's discordant pairs then stack as
rows spanning it, sorted to the top, rather than as halves on separate rows.
`readConnections.ordinaryPairs.show=false` leaves out the arcs of pairs that fit
the reference, which in a short-read pileup cover the band in grey.

## Zoomed out

A second run with a wide `--flank`, given as `--context <dir>`, is a **Zoomed
out** panel under each card's images, joined on the record's line. It is closed
until clicked, opened on one card with `z` or on every card with `Z` and the
toolbar's Zoomed out, which the page remembers. A small variant inside a
copy-number change or a larger SV is read in that context. The batch run streams
the reads once where a browser would on every look. Its tracks are not counted,
so it takes no names.

```bash
# 200 kb around each record: coverage on one axis, and the pairs and split reads
# that do not fit the reference as arcs
WIDE=(pileup.show=false coverage.alleles.show=false
  coverage.interbase.show=false maxScore=80
  readConnections.show=true readConnections.ordinaryPairs.show=false height:130)
jb2export batch --sites calls.vcf.gz --config config.json --assembly hg38 \
  --track genes height:60 --track tumor_reads "${WIDE[@]}" \
  --track normal_reads "${WIDE[@]}" --flank 100000 --outDir wide --manifest

variant-review-portal --vcf calls.vcf.gz --images tumor,normal=reads \
  --context wide --support TUMOR:AD,NORMAL:AD --out portal
```

Set `maxScore` above the deepest sample's coverage.
[Reviewing a trio](trio-review.md) has an example.

### Copy number and B-allele frequency

A context run need not draw reads. A tumor's copy-number segments, its log2
tumor/normal depth ratio and its B-allele frequency over a few megabases show
whether an SV sits in a gain, a loss or a run of loss of heterozygosity (LOH),
where the BAF of the germline het sites splits away from 0.5 or collapses to 0
and 1. They are bigWigs and BEDs, so 4 Mb a card renders in seconds.
[`examples/hg008/config.json`](../examples/hg008/config.json) carries HG008-T's
from the [Cancer GIAB](https://jbrowse.org/jb2/docs/tutorials/cnv_cgiab/)
tutorial: the draft benchmark's copy number per haplotype, the log2 ratio and
the BAF.

```bash
jb2export batch --sites hg008.vcf.gz --config examples/hg008/config.json \
  --assembly GRCh38_GIABv3 --track hg38_ncbiRefSeq_ucsc height:60 \
  --track hg008t_benchmark_sv height:40 --track hg008t_somatic_cnv height:40 \
  --track HG008_log2ratio height:90 --track HG008-T_baf height:90 \
  --flank 2000000 --outDir cn --manifest
```

![A 164 kb tandem duplication on chr5 drawn 4 Mb wide: the benchmark's copy number 1 (0|1) on either side and 2 (0|2) across the duplication, the log2 ratio stepping up across it, and the BAF at 1 throughout, a run of LOH](gallery/hg008-copy-number.png)

### The whole genome

`--overview <png>` puts one image above the queue, in a **Genome overview**
panel: the same tracks over every chromosome, which say before the first card
what kind of genome the calls are in, HG008-T's losses of whole arms and its
long runs of LOH. A bigWig draws its zoomed-out summary there, so the image
takes about 10 s.

```bash
jb2export --config examples/hg008/config.json --assembly GRCh38_GIABv3 \
  --loc "$(printf 'chr%s ' {1..22} X)" --track hg008t_somatic_cnv height:40 \
  --track HG008_log2ratio height:90 --track HG008-T_baf height:90 \
  --width 1600 --out genome.png

variant-review-portal --vcf hg008.vcf.gz --images tumor,normal=reads \
  --context cn --overview genome.png --support jb2export --out portal
```

## Images rendered apart

Repeat `--images`, one directory per run, and a card stacks them. The first
directory's rows are the cards, and every other joins on the record's line in
the VCF, so a run with a different `--limit` shows which cards it lacks.

## Links back into JBrowse

Given `--jbrowse` and `--config`, each card links to the view its image was
drawn in, which the manifest's `spec` column holds, with the tracks `--track`
named. A track made from a file flag such as `--bam` is in no hosted config, so
the link leaves it out. [Carrying the reads](carrying-the-reads.md) puts the
reads in the portal itself.

## What comes out

```
portal/
  index.html      the review page: filters, verdicts, export
  img/<tracks>/   a copy of each run's images
  config.json     with variant-review-slice: the config its links open
  reads/          with variant-review-slice: the sliced reads
```

Every path in the portal is relative to its directory, so
`aws s3 sync portal/ s3://…` deploys the whole portal.
