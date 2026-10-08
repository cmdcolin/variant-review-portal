// Screenshot a built portal: the cards in light, the table in dark.
//   node docs/shoot.mjs <portal dir> [out dir]
// Needs puppeteer resolvable from where it is run, and PUPPETEER_EXECUTABLE_PATH
// where puppeteer's own download is absent.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [dir, outDir = import.meta.dirname] = process.argv.slice(2)
if (!dir) {
  console.error('usage: node docs/shoot.mjs <portal dir> [out dir]')
  process.exit(1)
}
// the calls a matched normal carries too, most split reads first; then the
// whole callset as a table on the caller's allele fraction
const SHOTS = [
  { name: 'review-page-light', scheme: 'light', hash: '#support=control&sort=reads', keys: ['j', '1', 'j'] },
  { name: 'review-table-dark', scheme: 'dark', hash: '#sort=format%3AAF&view=table', keys: ['j', '1', 'j', '3', 'j'] },
]
const { default: puppeteer } = await import('puppeteer')
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
})
try {
  for (const { name, scheme, hash, keys } of SHOTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 1000 })
    // reduced motion, so a scroll has landed by the time the shot is taken
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: scheme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ])
    const url = pathToFileURL(path.resolve(dir, 'index.html')).href
    await page.goto(url, { waitUntil: 'networkidle0' })
    // both shots share one origin's storage, and the second would inherit the
    // first one's verdicts
    await page.evaluate(() => {
      localStorage.clear()
    })
    await page.goto(url + hash, { waitUntil: 'networkidle0' })
    await page.reload({ waitUntil: 'networkidle0' })
    // verdicts and a cursor, so the shot shows a queue in use
    for (const key of keys) {
      await page.keyboard.press(key)
    }
    await page.screenshot({ path: path.join(outDir, `${name}.png`) })
    await page.close()
  }
} finally {
  await browser.close()
}
