// Drive a built portal in Chrome: the page hydrates, takes a verdict and a note,
// keeps both across a reload, and the address reopens the same card.
//   node test/browser.mjs
// Needs puppeteer's Chrome, or PUPPETEER_EXECUTABLE_PATH.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import puppeteer from 'puppeteer'

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
fs.writeFileSync(
  path.join(images, 'manifest.tsv'),
  [
    'file\tlocs\tname\tline\tevent\tlinks\tstatus',
    '1.png\tchr1:1-200 chr16:400-600\tfus\t5\t\t4,1\tok',
    '2.png\tchr2:1-400\tins\t6\t\t\tok',
  ].join('\n'),
)
const vcf = path.join(dir, 'calls.vcf')
fs.writeFileSync(
  vcf,
  [
    '##fileformat=VCFv4.3',
    '##INFO=<ID=SVTYPE,Number=1,Type=String,Description="Type">',
    '##INFO=<ID=SVLEN,Number=1,Type=Integer,Description="Length">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
    'chr1\t100\tfus\tN\t]chr16:500]N\t.\tPASS\tSVTYPE=BND',
    'chr2\t200\tins\tN\t<INS>\t.\tPASS\tSVTYPE=INS;SVLEN=300',
  ].join('\n'),
)
const out = path.join(dir, 'portal')
execFileSync(process.execPath, [
  path.join(import.meta.dirname, '../bin/make-portal.mjs'),
  '--vcf',
  vcf,
  '--images',
  `tumor,normal=${images}`,
  '--out',
  out,
])

const browser = await puppeteer.launch({
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

  assert.equal(await count('.card'), 2)
  assert.equal(await count('.card img.shot'), 2)
  assert.match(await text('.card .evidence'), /tumor4 split reads.*normal1 split read /)

  await page.keyboard.press('j')
  await page.keyboard.press('1')
  await page.keyboard.press('n')
  await page.keyboard.type('clean fan')
  await page.keyboard.press('Enter')
  assert.match(await text('#done'), /1 of 2 judged/)
  assert.equal(new URL(page.url()).hash, '#card=5')

  await page.select('#sf', 'control')
  assert.equal(await count('.card'), 1)
  assert.equal(new URL(page.url()).hash, '#support=control&card=5')

  await page.reload({ waitUntil: 'networkidle0' })
  assert.equal(await count('.card'), 1)
  assert.equal(await page.$eval('.card input.note', el => el.value), 'clean fan')
  assert.equal(
    await page.$eval('.card', el => el.dataset.verdict + el.dataset.current),
    'realtrue',
  )

  await page.keyboard.press('t')
  assert.equal(await count('.index tbody tr'), 1)
  assert.match(await text('.index tbody tr'), /fus.*41.*Real.*clean fan/)
  await page.keyboard.press('Enter')
  assert.equal(await count('.card'), 1)

  assert.deepEqual(problems, [])
  console.log('browser test passed')
} finally {
  await browser.close()
  fs.rmSync(dir, { recursive: true, force: true })
}
