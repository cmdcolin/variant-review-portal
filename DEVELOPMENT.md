# Development

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

`docs/shoot.mjs` rebuilds the README's three screenshots in light mode, from
built portals given as directories or hosted URLs. The README's are the hosted
COLO829 portals:

```bash
node docs/shoot.mjs https://jbrowse.org/demos/colo829_review/ \
  https://jbrowse.org/demos/colo829_snv_review/
```

The SV portal is 135 records over the ONT open-data reads, rendered from the
public bucket in under five minutes.
