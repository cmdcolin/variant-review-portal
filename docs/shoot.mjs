// Rebuild the README's screenshots, in light mode, from built portals: each a
// directory or a hosted URL.
//   node docs/shoot.mjs <sv portal> [snv portal]
//   node docs/shoot.mjs https://jbrowse.org/demos/colo829_review/ \
//     https://jbrowse.org/demos/colo829_snv_review/
// Needs puppeteer resolvable from where it is run, and PUPPETEER_EXECUTABLE_PATH
// where puppeteer's own download is absent.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [sv, snv] = process.argv.slice(2)
if (!sv) {
  console.error('usage: node docs/shoot.mjs <sv portal> [snv portal]')
  process.exit(1)
}
// the calls only the tumor carries, most supporting reads first; the whole
// callset as a table on the caller's allele fraction; one coding variant
const SHOTS = [
  {
    name: 'review-cards',
    portal: sv,
    hash: '#support=sample&sort=reads',
    keys: ['j', '1', 'j'],
  },
  {
    name: 'review-table',
    portal: sv,
    hash: '#sort=format%3AAF&view=table',
    keys: ['j', '1', 'j', '3', 'j'],
  },
  {
    name: 'review-snv',
    portal: snv,
    hash: '#q=BRAF',
    keys: ['j'],
  },
].filter(shot => shot.portal)
const { default: puppeteer } = await import('puppeteer')
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
})
try {
  for (const { name, portal, hash, keys } of SHOTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 1000 })
    // reduced motion, so a scroll has landed by the time the shot is taken
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ])
    const url = /^https?:/.test(portal)
      ? portal
      : pathToFileURL(path.resolve(portal, 'index.html')).href
    await page.goto(url, { waitUntil: 'networkidle0' })
    // shots of one portal share its origin's storage, and the second would
    // inherit the first one's verdicts
    await page.evaluate(() => {
      localStorage.clear()
    })
    await page.goto(url + hash, { waitUntil: 'networkidle0' })
    await page.reload({ waitUntil: 'networkidle0' })
    // verdicts and a cursor, so the shot shows a queue in use
    for (const key of keys) {
      await page.keyboard.press(key)
    }
    await page.screenshot({
      path: path.join(import.meta.dirname, `${name}.png`),
    })
    await page.close()
  }
} finally {
  await browser.close()
}
