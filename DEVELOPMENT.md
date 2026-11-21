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

## The classifier

`lib/classifyTrio.mjs` and its truth-table tests, `test/classifyTrio.test.mjs`,
began as the classifier JBrowse ran in its variant track (ADR-279 in
jbrowse-components). JBrowse has since moved that check out to
`bcftools +mendelian2`, so the copy is the portal's own and changes here.
`test/jest.mjs` runs the jest-style tests under `node:test`.
