// Screenshot a built portal in both color schemes:
//   node docs/shoot.mjs <portal dir> [out prefix] [support filter value]
// Needs puppeteer resolvable from where it is run, and PUPPETEER_EXECUTABLE_PATH
// where puppeteer's own download is absent.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [dir, prefix = 'review-page', support] = process.argv.slice(2)
if (!dir) {
  console.error('usage: node docs/shoot.mjs <portal dir> [out prefix]')
  process.exit(1)
}
const { default: puppeteer } = await import('puppeteer')
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--allow-file-access-from-files'],
})
try {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1240, height: 1400 })
    // reduced motion, so a scroll has landed by the time the shot is taken
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: scheme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ])
    const url = pathToFileURL(path.resolve(dir, 'index.html')).href
    await page.goto(url, { waitUntil: 'networkidle0' })
    // both schemes share one origin's storage, and the second would undo the
    // first one's verdict
    await page.evaluate(() => {
      localStorage.clear()
    })
    await page.reload({ waitUntil: 'networkidle0' })
    if (support) {
      await page.select('#sf', support)
    }
    // a verdict and a cursor, so the shot shows a queue in use
    await page.keyboard.press('j')
    await page.keyboard.press('1')
    await page.keyboard.press('j')
    await page.screenshot({ path: `${prefix}-${scheme}.png` })
    await page.close()
  }
} finally {
  await browser.close()
}
