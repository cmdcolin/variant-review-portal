# Carrying the reads

A link opens the reads wherever the config says they are. Where that is a server
a browser reaches slowly, or one that refuses a few hundred range requests,
`variant-review-slice` cuts the reads down to the cards' windows first and
writes a config that reads the slices:

```bash
variant-review-slice --vcf calls.vcf.gz --config config.json \
  --tracks tumor_reads,normal_reads --out portal

# render from the slices, which are local, then build into the same directory
jb2export batch --sites calls.vcf.gz --config portal/config.json --assembly hg38 \
  --track tumor_reads --track normal_reads --outDir reads --manifest

variant-review-portal --vcf calls.vcf.gz --images tumor,normal=reads --out portal \
  --support TUMOR:AD,NORMAL:AD \
  --jbrowse https://jbrowse.org/code/jb2/latest/ \
  --config https://example.org/portal/config.json
```

`portal/reads/` holds one CRAM a track, or a BAM where the assembly is not a
FASTA `samtools` can read, and `portal/config.json` names them relative to
itself, so the directory still deploys whole. `--config` on the last command is
where that file will be served. It needs `samtools` on the PATH, and a
`jb2export` that reads a config's relative files from beside it, newer than
5.0.0-beta.13.

## Size and speed

The slices hold whole reads, so their size follows the read length more than the
window: the HG008-T portal's 181 cards are 115 MB of PacBio HiFi, tumor and
normal, beside 17 MB of images. A CRAM is written in slices of 250,000 bases, a
twentieth of `samtools`' default, because a reader decodes a whole slice to draw
one window of it. Rendering from them took about three minutes, several times
quicker than from the full files over the network. A link over slices shows
reads at the cards' windows and nowhere else.
[`examples/hg008/config.json`](../examples/hg008/config.json) is the config that
portal was sliced from.
