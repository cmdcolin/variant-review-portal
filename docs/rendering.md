# Rendering and building

A portal is built in two steps: `jb2export batch` draws one image per record,
and `variant-review-portal` turns those images and the VCF into a page.

```bash
# every alignments track in one run, so each record is one image; genes, the
# callset and repeats beside them show which genes a call hits and which
# repeats it lies in
jb2export batch --sites calls.vcf.gz --config config.json --assembly hg38 \
  --track genes height:50 --track calls height:50 \
  --track tumor_reads height:150 --track normal_reads height:150 \
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
