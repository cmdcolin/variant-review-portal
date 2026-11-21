// Rebuild the README's gallery, in light mode, from built portals: each a
// directory or a hosted URL, named for the callset it holds.
//   node docs/shoot.mjs sv=<portal> snv=<portal> hg008=<portal> trio=<portal>
//   node docs/shoot.mjs sv=https://jbrowse.org/demos/colo829_review/ \
//     snv=https://jbrowse.org/demos/colo829_snv_review/ \
//     hg008=https://jbrowse.org/demos/hg008_review/ \
//     trio=https://jbrowse.org/demos/khv_trio_review/
// Needs puppeteer resolvable from where it is run, and PUPPETEER_EXECUTABLE_PATH
// where puppeteer's own download is absent. A shot whose portal is not named
// is skipped.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const portals = Object.fromEntries(
  process.argv.slice(2).map(arg => arg.split(/=(.*)/s, 2)),
)
if (!Object.keys(portals).length) {
  console.error(
    'usage: node docs/shoot.mjs sv=<portal> snv=<portal> hg008=<portal> trio=<portal>',
  )
  process.exit(1)
}

// in the README's order, two to a row, each row's pair about the same height
const SHOTS = [
  { name: 'complex-event', portal: 'hg008', hash: '#card=event%3Acluster_12' },
  { name: 'inversion', portal: 'hg008', hash: '#card=115', keys: ['1'] },
  { name: 'deletion-pten', portal: 'sv', hash: '#card=366', keys: ['1'] },
  { name: 'duplication', portal: 'hg008', hash: '#card=125' },
  { name: 'gene-fusion', portal: 'sv', hash: '#card=297' },
  { name: 'braf', portal: 'snv', hash: '#card=219', keys: ['1'] },
  { name: 'translocation', portal: 'sv', hash: '#card=343', keys: ['1'] },
  {
    name: 'table',
    portal: 'sv',
    hash: '#sort=format%3AAF&view=table',
    keys: ['j', '1', 'j', '3', 'j'],
    page: true,
    height: 1330,
  },
  { name: 'trio-de-novo', portal: 'trio', hash: '#card=3415', keys: ['1'] },
  { name: 'trio-missed-het', portal: 'trio', hash: '#card=3533', keys: ['2'] },
  { name: 'trio-copy-number', portal: 'trio', hash: '#card=3431', keys: ['5'] },
  {
    name: 'trio-zoomed-out',
    portal: 'trio',
    hash: '#card=3432',
    keys: ['z'],
    height: 2400,
  },
  {
    name: 'trio-table',
    portal: 'trio',
    hash: '#support=sample&view=table',
    page: true,
    height: 800,
  },
].filter(shot => portals[shot.portal])

const out = path.join(import.meta.dirname, 'gallery')
fs.mkdirSync(out, { recursive: true })
const { default: puppeteer } = await import('puppeteer')
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
})
try {
  for (const {
    name,
    portal,
    hash,
    keys = [],
    page: whole,
    height = 1500,
  } of SHOTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1180, height })
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ])
    const url = /^https?:/.test(portals[portal])
      ? portals[portal]
      : pathToFileURL(path.resolve(portals[portal], 'index.html')).href
    await page.goto(url, { waitUntil: 'networkidle0' })
    // shots of one portal share its origin's storage, and a later one would
    // inherit an earlier one's verdicts
    await page.evaluate(() => {
      localStorage.clear()
    })
    await page.goto(url + hash, { waitUntil: 'networkidle0' })
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('main')
    for (const key of keys) {
      await page.keyboard.press(key)
    }
    const file = path.join(out, `${name}.png`)
    if (whole) {
      await page.screenshot({ path: file })
    } else {
      // a window tall enough that each picture is drawn at its own size, and
      // a header that scrolls away rather than covering the card
      await page.addStyleTag({ content: 'header { position: static }' })
      const card = await page.waitForSelector('.card[data-current="true"]')
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.card[data-current="true"] img')]
          .filter(img => !img.closest('details:not([open])'))
          .every(img => img.complete && img.naturalWidth),
      )
      // past the cursor's bar on the left, and as much room on the right as
      // the card's own padding leaves on the left
      const clip = await card.evaluate(el => {
        const r = el.getBoundingClientRect()
        return {
          x: r.x + scrollX + 3,
          y: r.y + scrollY + 1,
          width: r.width + 9,
          height: r.height - 1,
        }
      })
      await page.screenshot({ path: file, captureBeyondViewport: true, clip })
    }
    await page.close()
  }
} finally {
  await browser.close()
}
