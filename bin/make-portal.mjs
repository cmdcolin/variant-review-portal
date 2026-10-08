#!/usr/bin/env node
// Turn the image directories `jb2export batch --manifest` wrote, and the VCF it
// read, into a static review portal.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import zlib from 'node:zlib'

import {
  buildCards,
  describeKeys,
  CLASSES,
  liveLink,
  parseManifest,
  SUPPORT,
} from '../lib/cards.mjs'
import { renderPage } from '../lib/page.mjs'

const HELP = `Usage: variant-review-portal --vcf <file> --images <tracks>=<dir> --out <dir>

Builds a static review page over a VCF of structural or small variants: one card
per record, the sample and its control in one image, what the VCF says about the
call, a verdict and a link that opens the same loci live.

Render the images first, every alignments track in one run:

  jb2export batch --vcf calls.vcf.gz --config config.json --assembly hg38 \\
    --track tumor_reads --track normal_reads --outDir reads --manifest

  variant-review-portal --vcf calls.vcf.gz --images tumor,normal=reads --out portal

Options:
  --vcf       the VCF (plain or bgzipped) the run read
  --images    <tracks>=<dir>: a jb2export batch --outDir holding manifest.tsv,
              and a name for each alignments track drawn in its images, comma
              separated, in track order. The first track is the sample under
              review and the rest are its controls. A bare <dir> is one track
              named after the directory. Repeat for images rendered apart: the
              first directory's rows are the cards
  --out       directory to write the portal to
  --title     page heading (default: the VCF's file name)
  --facet     an INFO key to print on every card and filter the queue on, such
              as CLNSIG or SUBCLONAL; repeat or separate with commas. FILTER is
              one already when the callset has more than one

  A link on every card, given both. It opens the view the image was drawn in,
  which the manifest's spec column holds:
  --jbrowse   URL of a JBrowse Web to open cards in
  --config    URL of the config the images were rendered from, as that JBrowse
              Web reaches it
`

function fail(message) {
  console.error(`variant-review-portal: ${message}`)
  process.exit(1)
}

// bgzip is gzip: the magic bytes decide, not the extension
function readMaybeGzip(file) {
  const buf = fs.readFileSync(file)
  return (
    buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf
  ).toString('utf8')
}

const { values } = parseArgs({
  options: {
    vcf: { type: 'string' },
    images: { type: 'string', multiple: true },
    out: { type: 'string' },
    title: { type: 'string' },
    facet: { type: 'string', multiple: true },
    jbrowse: { type: 'string' },
    config: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}
const { vcf, images, out } = values
if (!vcf || !images?.length || !out) {
  fail('needs --vcf, at least one --images and --out. See --help.')
}

const sets = images.map(arg => {
  const eq = arg.indexOf('=')
  const dir = eq === -1 ? arg : arg.slice(eq + 1)
  const labels = (
    eq === -1 ? path.basename(path.resolve(dir)) : arg.slice(0, eq)
  )
    .split(',')
    .map(l => l.trim())
    .filter(Boolean)
  const manifest = path.join(dir, 'manifest.tsv')
  if (!fs.existsSync(manifest)) {
    fail(`${manifest} not found: render ${dir} with jb2export batch --manifest`)
  }
  return {
    name: labels.join('_'),
    labels,
    dir,
    rows: parseManifest(fs.readFileSync(manifest, 'utf8')),
  }
})
const labels = sets.flatMap(s => s.labels)
if (new Set(labels).size !== labels.length) {
  fail(`two tracks share the name "${labels.find((l, i) => labels.indexOf(l) !== i)}": name each with --images a,b=dir`)
}

if (!values.jbrowse !== !values.config) {
  fail('a live link needs both --jbrowse and --config')
}
const link = values.jbrowse
  ? liveLink({ jbrowse: values.jbrowse, config: values.config })
  : undefined
if (link && !sets[0].rows.some(r => r.spec)) {
  fail(
    `${path.join(sets[0].dir, 'manifest.tsv')} has no spec column to link from: it was written by a jb2export that predates it. Re-render with a current @jbrowse/img.`,
  )
}

const vcfText = readMaybeGzip(vcf)
let cards
try {
  cards = buildCards({
    vcfText,
    sets,
    link,
    facets: [
      'FILTER',
      ...(values.facet ?? []).flatMap(f => f.split(',')).filter(Boolean),
    ],
  })
} catch (error) {
  fail(error.message)
}

// A PNG states its size in its first chunk. The page reserves that box before
// the image loads, so a lazily loaded queue does not move under the cursor.
function pngSize(file) {
  const head = Buffer.alloc(24)
  const fd = fs.openSync(file, 'r')
  fs.readSync(fd, head, 0, 24, 0)
  fs.closeSync(fd)
  return head.toString('latin1', 1, 4) === 'PNG'
    ? { width: head.readUInt32BE(16), height: head.readUInt32BE(20) }
    : {}
}

const dirOf = new Map(sets.map(s => [s.name, s.dir]))
for (const card of cards) {
  for (const image of card.images) {
    const from = image.file && path.join(dirOf.get(image.name), image.file)
    if (image.src && fs.existsSync(from)) {
      const dest = path.join(out, 'img', image.name)
      fs.mkdirSync(dest, { recursive: true })
      fs.copyFileSync(from, path.join(dest, image.file))
      Object.assign(image, pngSize(from))
    } else if (image.src) {
      image.src = undefined
      image.status = 'absent'
    }
  }
}

// A facet every card agrees on filters nothing, and one with a value a card
// (an inserted sequence, a free-text field) is a search box, not a select.
const FACET_VALUES_MAX = 40

function facetOptions(cards) {
  const values = new Map()
  for (const card of cards) {
    for (const [key, value] of Object.entries(card.facets)) {
      const counts = values.get(key) ?? new Map()
      counts.set(value, (counts.get(value) ?? 0) + 1)
      values.set(key, counts)
    }
  }
  return [...values]
    .filter(([, counts]) => counts.size > 1 && counts.size <= FACET_VALUES_MAX)
    .map(([key, counts]) => ({
      key,
      values: [...counts].sort(([, a], [, b]) => b - a),
    }))
}

const title = values.title ?? path.basename(vcf)
const records = cards.filter(c => c.kind === 'record').length
const events = cards.length - records
const data = {
  // verdicts are stored under this, so a portal rebuilt from the same callset
  // keeps its review and one built from another never inherits it
  portalId: crypto.createHash('sha256').update(vcfText).digest('hex').slice(0, 12),
  title,
  eyebrow: `${records} record${records === 1 ? '' : 's'}${
    events ? `, ${events} event${events === 1 ? '' : 's'}` : ''
  } · ${labels.join(' and ')}`,
  classes: CLASSES,
  support: SUPPORT,
  facets: facetOptions(cards),
  describe: describeKeys(vcfText, cards),
  cards,
  footer: `Images by jb2export batch. Verdicts stay in this browser until exported.`,
}
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'index.html'), await renderPage({ data, title }))
console.log(`wrote ${cards.length} cards to ${path.join(out, 'index.html')}`)
