// Drive a built portal in Chrome: the page hydrates, takes a verdict and a note,
// keeps both across a reload, the address reopens the same card, and Export
// counts what it has not yet written out.
//   node test/browser.mjs
// Needs puppeteer's Chrome, or PUPPETEER_EXECUTABLE_PATH.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { launch } from 'puppeteer'

// as many loci as HG008-T's widest event, which is what a table has to wrap
const EVENT_LOCI = Array.from(
  { length: 10 },
  (_, i) => `chr${i + 1}:100000001-100001200`,
)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'variant-review-test-'))
const images = path.join(dir, 'reads')
fs.mkdirSync(images)
// a 1x1 PNG: the page needs an image to lay out, not a picture
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)
fs.writeFileSync(path.join(images, '1.png'), png)
fs.writeFileSync(path.join(images, '2.png'), png)
fs.writeFileSync(path.join(images, 'event_1_der3.png'), png)
fs.writeFileSync(
  path.join(images, 'manifest.tsv'),
  [
    'file\tlocs\tname\tline\tevent\tlinks\tstatus',
    '1.png\tchr1:1-200 chr16:400-600\tfus\t6\tder3\t4,1\tok',
    '2.png\tchr2:1-400\tins\t7\t\t\tok',
    // a caller's event over three loci has a card of its own, with no VCF line
    `event_1_der3.png\t${EVENT_LOCI.join(' ')}\tder3\t\tder3\t6,0\tok`,
  ].join('\n'),
)
const vcf = path.join(dir, 'calls.vcf')
fs.writeFileSync(
  vcf,
  [
    '##fileformat=VCFv4.3',
    '##INFO=<ID=SVTYPE,Number=1,Type=String,Description="Type">',
    '##INFO=<ID=SVLEN,Number=1,Type=Integer,Description="Length">',
    '##INFO=<ID=EVENT,Number=A,Type=String,Description="Event">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
    'chr1\t100\tfus\tN\t]chr16:500]N\t.\tPASS\tSVTYPE=BND;EVENT=der3',
    'chr2\t200\tins\tN\t<INS>\t.\tPASS\tSVTYPE=INS;SVLEN=300',
  ].join('\n'),
)
const out = path.join(dir, 'portal')
const build = support =>
  spawnSync(
    process.execPath,
    [
      path.join(import.meta.dirname, '../bin/make-portal.mjs'),
      '--vcf',
      vcf,
      '--images',
      `tumor,normal=${images}`,
      ...support,
      '--out',
      out,
    ],
    { encoding: 'utf8' },
  )
// which column is the sample and which its control is the builder's to say
const unsaid = build([])
assert.equal(unsaid.status, 1)
assert.match(unsaid.stderr, /needs --support/)
assert.match(unsaid.stderr, /--support jb2export/)
const questionFile = path.join(dir, 'question.json')
fs.writeFileSync(
  questionFile,
  JSON.stringify({
    question: 'Does the tumor support the call?',
    answers: [
      { label: 'Supports', key: 's', tone: 'real' },
      { label: 'Does not support', key: 'n' },
    ],
  }),
)
const clash = build(['--support', 'jb2export', '--question', questionFile])
assert.equal(clash.status, 1)
assert.match(clash.stderr, /keyed n, which the page binds to note/)
fs.writeFileSync(
  questionFile,
  JSON.stringify({
    question: 'Does the tumor support the call?',
    answers: [
      { label: 'Supports', key: 's', tone: 'real' },
      { label: 'Does not support', key: 'd' },
    ],
  }),
)
const asked = build(['--support', 'jb2export', '--question', questionFile])
assert.equal(asked.status, 0, asked.stderr)
const askedHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8')
assert.match(askedHtml, /Does the tumor support the call\?/)
assert.match(askedHtml, /data-v="Does not support"/)
assert.equal(build(['--support', 'jb2export']).status, 0)

// a trio queue: a de novo candidate and a Mendelian violation, each one image
// of the child's reads over the father's and the mother's
const trioDir = path.join(dir, 'trio')
fs.mkdirSync(path.join(trioDir, 'reads'), { recursive: true })
fs.writeFileSync(path.join(trioDir, 'reads', '1.png'), png)
fs.writeFileSync(path.join(trioDir, 'reads', '2.png'), png)
fs.writeFileSync(
  path.join(trioDir, 'reads', 'manifest.tsv'),
  [
    'file\tlocs\tname\tline\tevent\talt\tstatus',
    '1.png\t1:200-300\t\t5\t\t0/30,30/30,14/28\tok',
    '2.png\t1:50-150\t\t4\t\t9/20,0/18,6/20\tok',
  ].join('\n'),
)
fs.writeFileSync(
  path.join(trioDir, 'trio.vcf'),
  [
    '##fileformat=VCFv4.2',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tkid\tmom\tdad',
    '1\t100\t.\tA\tG\t.\tPASS\t.\tGT\t0|1\t0|0\t0|0',
    '1\t250\t.\tC\tT\t.\tPASS\t.\tGT\t0|0\t1|0\t1|1',
  ].join('\n'),
)
fs.writeFileSync(
  path.join(trioDir, 'family.fam'),
  ['f kid dad mom 2 0', 'f dad 0 0 1 0', 'f mom 0 0 2 0'].join('\n'),
)
const trioBuild = spawnSync(
  process.execPath,
  [
    path.join(import.meta.dirname, '../bin/make-portal.mjs'),
    '--vcf',
    path.join(trioDir, 'trio.vcf'),
    '--pedigree',
    path.join(trioDir, 'family.fam'),
    '--images',
    `kid,dad,mom=${path.join(trioDir, 'reads')}`,
    '--out',
    path.join(trioDir, 'portal'),
  ],
  { encoding: 'utf8' },
)
assert.equal(trioBuild.status, 0, trioBuild.stderr)

const browser = await launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
})
try {
  const page = await browser.newPage()
  const problems = []
  page.on('pageerror', e => problems.push(e.message))
  page.on('console', m => {
    if (m.type() === 'error') {
      problems.push(m.text())
    }
  })
  const url = pathToFileURL(path.join(out, 'index.html')).href
  await page.goto(url, { waitUntil: 'networkidle0' })
  const text = sel => page.$eval(sel, el => el.textContent)
  const count = sel => page.$$eval(sel, els => els.length)

  assert.equal(await count('.card'), 3)
  assert.equal(await count('.card img.shot'), 3)
  assert.match(
    await text('.card[data-cls="EVENT"] .meta'),
    /1 record · 10 loci/,
  )
  assert.match(
    await text('.card .evidence'),
    /tumor4 split reads.*normal1 split read /,
  )
  assert.equal(await count('header select[data-facet]'), 0)

  assert.match(await text('.card .verdicts'), /^Is the call real\?1Real/)
  await page.keyboard.press('j')
  await page.keyboard.press('1')
  await page.keyboard.press('1')
  assert.equal(await page.$eval('.card', el => el.dataset.verdict), 'real')
  await page.keyboard.press('0')
  assert.equal(await page.$eval('.card', el => el.dataset.verdict), '')
  assert.ok(await page.$eval('.card .unanswer', el => el.disabled))
  await page.click('.card [data-v="artifact"]')
  await page.click('.card .unanswer')
  assert.equal(await page.$eval('.card', el => el.dataset.verdict), '')
  await page.keyboard.press('1')
  await page.keyboard.press('n')
  await page.keyboard.type('clean fan')
  await page.keyboard.press('Enter')
  assert.match(await text('#done'), /1 of 3 judged/)
  assert.equal(new URL(page.url()).hash, '#card=6')
  assert.equal(await text('#export'), 'Export · 1 new')

  await page.select('#sf', 'control')
  assert.equal(await count('.card'), 1)
  assert.equal(new URL(page.url()).hash, '#support=control&card=6')

  await page.reload({ waitUntil: 'networkidle0' })
  assert.equal(await count('.card'), 1)
  assert.equal(
    await page.$eval('.card input.note', el => el.value),
    'clean fan',
  )
  assert.equal(
    await page.$eval('.card', el => el.dataset.verdict + el.dataset.current),
    'realtrue',
  )

  await page.keyboard.press('t')
  assert.ok(
    await page.$eval(
      '.index',
      el => el.getBoundingClientRect().right <= innerWidth,
    ),
    'the table fits the window',
  )
  assert.equal(await count('.index tbody tr:not(.group)'), 1)
  assert.match(await text('.index .group'), /1 call · 1 judged/)
  assert.match(
    await text('.index tbody tr:not(.group)'),
    /fus.*41.*Real.*clean fan/,
  )
  await page.keyboard.press('Enter')
  assert.equal(await count('.card'), 1)

  assert.equal(await text('#export'), 'Export · 1 new')
  await page.click('#export')
  assert.equal(await text('#export'), 'Export')
  await page.reload({ waitUntil: 'networkidle0' })
  assert.equal(await text('#export'), 'Export')

  await page.goto(
    pathToFileURL(path.join(trioDir, 'portal', 'index.html')).href,
    { waitUntil: 'networkidle0' },
  )
  assert.deepEqual(
    await page.$$eval('.card', els => els.map(el => el.dataset.cls)),
    ['deNovoCandidate', 'mendelianViolation'],
  )
  assert.match(
    await text('.card .trio'),
    /Neither parent is called with G; 6 of the mother's 20 reads have it/,
  )
  assert.match(
    await text('.card .trio tbody'),
    /kid \(daughter\)0\|1G 9\/20dad \(father\)0\|0G 0\/18mom \(mother\)0\|0G 6\/20/,
  )
  await page.keyboard.press('j')
  await page.keyboard.press('3')
  assert.equal(
    await page.$eval('.card', el => el.dataset.verdict),
    'missed:mother',
  )
  assert.match(await text('#tally'), /^1 missed in mother$/)
  await page.select('#sf', 'control')
  assert.equal(await count('.card'), 1)

  await page.keyboard.press('t')
  assert.match(
    await text('.index thead'),
    /kid \(daughter\).*dad \(father\).*mom \(mother\)/,
  )
  assert.match(
    await text('.index tbody tr:not(.group)'),
    /0\|1 G 9\/20.*Missed in mother/,
  )

  await page.select('#sf', 'all')
  const rows = await page.$$('.index tbody tr:not(.group)')
  assert.equal(rows.length, 2)
  await rows[0].click()
  await page.keyboard.down('Shift')
  await rows[1].click()
  await page.keyboard.up('Shift')
  assert.match(await text('.selection'), /^2 selected/)
  await page.keyboard.press('5')
  assert.equal(await count('.selection'), 0)
  assert.match(await text('#msg'), /2 cards answered Copy-number change/)
  assert.match(await text('#tally'), /^2 copy-number change$/)

  await page.keyboard.press('t')
  await page.keyboard.press('k')
  await page.keyboard.press('J')
  assert.equal(await count('.card[data-selected="true"]'), 2)
  await page.keyboard.press('Escape')
  assert.equal(await count('.card[data-selected="true"]'), 0)
  await page.keyboard.press('K')
  assert.equal(await count('.card[data-selected="true"]'), 2)
  await page.$eval('.card[data-current="true"] .unanswer', el => el.click())
  assert.match(await text('#msg'), /2 answers cleared/)
  assert.match(await text('#done'), /0 of 2 judged/)

  assert.deepEqual(problems, [])
  console.log('browser test passed')
} finally {
  await browser.close()
  fs.rmSync(dir, { recursive: true, force: true })
}
