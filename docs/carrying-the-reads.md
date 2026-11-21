# Carrying the reads

A link loads the reads from the locations in the config. Where that is a server
a browser reaches slowly, or one that refuses a few hundred range requests,
`variant-review-slice` cuts the reads down to the cards' windows first and
writes a config that points at the slices:

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

- `portal/reads/` holds one CRAM per track, or a BAM where the assembly is not a
  FASTA `samtools` can read. `portal/config.json` lists them by paths relative
  to itself, so the directory deploys as one unit.
- `--config` on the last command is the URL that file will be served from.
- `variant-review-slice` needs `samtools` on the PATH, and a `jb2export` newer
  than 5.0.0-beta.13 to read a config's relative files.
- A link that opens the sliced files shows reads at the cards' windows alone.

## Size and speed

The slices hold whole reads, so their size depends more on the read length than
on the window. The HG008-T portal's 181 cards come to 115 MB of PacBio HiFi
reads beside 17 MB of images, sliced from
[`examples/hg008/config.json`](../examples/hg008/config.json).

Each CRAM is written in slices of 250,000 bases, a twentieth of `samtools`'
default, because a reader decodes a whole CRAM slice to draw one window of it.
Rendering from the sliced files took about three minutes, several times quicker
than from the full files over the network.
