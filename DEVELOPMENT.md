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

`docs/shoot.mjs` rebuilds the README's gallery in `docs/gallery/`, in light
mode, from built portals given as directories or hosted URLs and named for the
callset each holds. The README's are the four hosted portals:

```bash
node docs/shoot.mjs sv=https://jbrowse.org/demos/colo829_review/ \
  snv=https://jbrowse.org/demos/colo829_snv_review/ \
  hg008=https://jbrowse.org/demos/hg008_review/ \
  trio=https://jbrowse.org/demos/khv_trio_review/
```

A card shot is cropped to the card under the cursor; the table shot is the whole
window. The SV portal is 135 records over the ONT open-data reads, rendered from
the public bucket in under five minutes.

## The vendored classifier

`lib/vendor/classifyTrio.ts` and `test/vendor/classifyTrio.test.ts` are
jbrowse-components' `plugins/variants/src/shared/classifyTrio.ts` and its test,
the test's import lines aside, so the trio queue and JBrowse's variant track
classify alike. Node strips the file's types, which it does for a checkout and
not under `node_modules`. `test/vendor/jest.ts` runs the test under `node:test`,
and lint and format skip both. After a change upstream, copy both again and
check:

```bash
diff lib/vendor/classifyTrio.ts \
  ../jbrowse-components/plugins/variants/src/shared/classifyTrio.ts
```

The copy goes once a published package exports the file. A subpath of
`@jbrowse/plugin-variants` (`"./classifyTrio"` in `exports`, built to
`esm/shared/classifyTrio.js`) is one way, though installing it also installs the
plugin's dependencies; the file imports nothing, so a package of its own is the
lighter one.
