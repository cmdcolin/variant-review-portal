# Development

```bash
pnpm install
```

React, react-dom and esbuild build the page, and
[`@gmod/vcf`](https://www.npmjs.com/package/@gmod/vcf) reads the callset. The
page is [gene-review-portal](https://github.com/cmdcolin/gene-review-portal)'s,
carried over to variants.

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

`docs/shoot.mjs` rebuilds `docs/review-cards.png` and `docs/review-table.png`
from a built portal, a directory or a hosted URL, in light mode:

```bash
node docs/shoot.mjs https://jbrowse.org/demos/colo829_review/
```

The README's shots are of the hosted
[COLO829 somatic SV portal](https://jbrowse.org/demos/colo829_review/), 135
records over the ONT open-data reads, rendered from the public bucket in under
five minutes. `docs/review-snv.png` is the
[coding variant portal](https://jbrowse.org/demos/colo829_snv_review/) filtered
to _BRAF_ V600E.
