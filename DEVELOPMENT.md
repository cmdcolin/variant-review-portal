# Development

React, react-dom and esbuild build the page, and
[`@gmod/vcf`](https://www.npmjs.com/package/@gmod/vcf) reads the callset. The
page started as
[gene-review-portal](https://github.com/cmdcolin/gene-review-portal)'s, adapted
to variants.

## Test

```bash
pnpm test           # the card and review logic, no browser
pnpm test:browser   # a built portal driven in Chrome
```

`test/browser.mjs` needs puppeteer's Chrome, or `PUPPETEER_EXECUTABLE_PATH`.

## Lint and format

```bash
pnpm lint
pnpm format
```

## Screenshots

`docs/shoot.mjs` rebuilds the pictures in `docs/gallery/` that the README and
the guides show, in light mode, from built portals given as directories or
hosted URLs and named for the callset each holds. They are shot from the four
hosted portals:

```bash
node docs/shoot.mjs sv=https://jbrowse.org/demos/colo829_review/ \
  snv=https://jbrowse.org/demos/colo829_snv_review/ \
  hg008=https://jbrowse.org/demos/hg008_review/ \
  trio=https://jbrowse.org/demos/khv_trio_review/
```

A card shot is cropped to the card under the cursor; the table shot is the whole
window. The SV portal is 135 records over the ONT open-data reads, rendered from
the public bucket in under five minutes.

## The COLO829 small-variant portal

Its 238 records are lines of ONT's ClairS callset, which wf-somatic-variation
annotated with SnpEff and ClinVar. `examples/colo829_snv/sites.tsv` lists each
record's `CHROM` and `POS`, and `examples/colo829_snv/config.json` is the one
hosted at `https://jbrowse.org/demos/cancer_sv/config.json`: the reads, the
RefSeq genes and UCSC's `clinvarMain.bb` as `clinvar_hg38`. `--no-version` keeps
the header the length it was, so each card keeps its id, the record's line: BRAF
V600E is `#card=219`.

```bash
B=s3://ont-open-data/colo829_2024.03/wf_somatic_variation/sup
aws s3 cp --no-sign-request $B/COLO829.wf-somatic-snv.vcf.gz .
aws s3 cp --no-sign-request $B/COLO829.wf-somatic-snv.vcf.gz.tbi .
bcftools view --no-version -T examples/colo829_snv/sites.tsv -Oz \
  -o cards.vcf.gz COLO829.wf-somatic-snv.vcf.gz
jb2export batch --sites cards.vcf.gz \
  --config examples/colo829_snv/config.json --assembly hg38 --width 1100 \
  --flank 75 --track ncbi_refseq_hg38 height:50 --track clinvar_hg38 height:80 \
  --track COLO829_tumor_ont --track COLO829BL_normal_ont --outDir reads \
  --manifest
variant-review-portal --vcf cards.vcf.gz --images tumor,normal=reads \
  --support jb2export --facet CLNSIG,CLNDN \
  --title "COLO829 somatic coding variants" \
  --jbrowse https://jbrowse.org/code/jb2/main/ \
  --config https://jbrowse.org/demos/cancer_sv/config.json --out portal
```

## The classifier

`lib/classifyTrio.mjs` and its truth-table tests, `test/classifyTrio.test.mjs`,
began as the classifier JBrowse ran in its variant track (ADR-279 in
jbrowse-components). JBrowse has since moved that check out to
`bcftools +mendelian2`, so the copy is the portal's own and changes here.
`test/jest.mjs` runs the jest-style tests under `node:test`.
