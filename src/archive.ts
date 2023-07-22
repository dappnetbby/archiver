import * as sourceMap from 'source-map-support';
sourceMap.install();
import puppeteer, { Page } from 'puppeteer';
import { HTTPResponse } from 'puppeteer';
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk';
import shelljs from 'shelljs'
import { Snapshot } from './types.js';
import { config, isResourceCacheable } from './common.js';


async function saveResource( url: string, buffer: Buffer) {
    // save the resource.
    console.log(`saving ${url}`)

    // create the path on the file system

    // parse the URL into a path string.
    const urlObj = new URL(url)
    // assert protocol is http/https
    const protocol = urlObj.protocol
    if (protocol != 'http:' && protocol != 'https:') {
        console.warn(`unsupported protocol ${protocol}`)
        return
    }
    // parse the URL path into a file path.
    const filepath = urlObj.pathname
    const hostname = urlObj.hostname
    shelljs.mkdir('-p', 'data')
    shelljs.mkdir('-p', `data/${hostname}`)

    // separate the filepath into a directory and filename.
    let parts = filepath.split('/')
    let dirname = ''
    let basename = parts.pop() || ''
    if (parts.length) {
        dirname = parts.join('/')
    }

    // const dirname = path.dirname(filepath)
    // const basename = path.basename(filepath)
    const ext = path.extname(basename)

    shelljs.mkdir('-p', `data/${hostname}/${dirname}`)

    // write the file.
    let basename2 = basename
    // case: basename == ""
    if (!basename.length) {
        basename2 = "index.html"
    }
    // case: basename == "/what-is-this"
    else if (basename.length && !ext.length) {
        basename2 = `${basename}.html`
    }

    fs.writeFileSync(path.join(`data/${hostname}/${dirname}/${basename2}`), buffer)

    return
}

function lookupInitiator() {
    // now lookup the initiator location in the page HTML.
    // const content = await page.content()
    // if (initiator?.lineNumber) {
    //     const content = await page.content()
    //     const lines = content.split('\n\r')
    //     console.log(lines.length, initiator.lineNumber)
    //     const line = lines[initiator.lineNumber]
    //     const col = line.slice(initiator.columnNumber)
    //     console.log(col)
    // }
}

async function singlePageCrawl(snapshotName: string, page: Page, url: string) {
    let snapshot: Snapshot = {
        resources: [],
        page: {
            url,
            content: ""
        }
    }

    // @ts-ignore
    let reqs = []

    let archiveHtml = ``

    // Configure network request interception.
    await page.setRequestInterception(true);
    
    let requestPending: Record<string,boolean> = {}

    page.on('request', async req => {
        const requestId = req.url() + "$$$" + req.method()
        requestPending[requestId] = true

        const resourceType = req.resourceType()
        const resourceUrl = req.url()
        const initiator = req.initiator()

        console.log(`${chalk.green(resourceType.padStart(0, ' '))} ${chalk.gray(resourceUrl)}`)

        if (isResourceCacheable(req)) {
            reqs.push(req)

            const logInitiator = false
            if (logInitiator) {
                console.log(`initiator`)
                if (initiator) {
                    console.log(`  ` + initiator?.stack?.callFrames?.map(frame => {
                        return frame.url
                    }).join('\n  '))
                    // https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-Initiator
                    // Allowed Values: parser, script, preload, SignedExchange, preflight, other
                    console.log(`  ` + initiator?.type)
                    // Initiator URL, set for Parser type or for Script type(when script is importing module) or for SignedExchange type.
                    console.log(`  ` + initiator?.url)
                    // Initiator line number, set for Parser type or for Script type(when script is importing module)(0 - based).
                    console.log(`  ` + initiator?.lineNumber)
                    // Initiator column number, set for Parser type or for Script type(when script is importing module)(0 - based).
                    console.log(`  ` + initiator?.columnNumber)
                }
            }

            console.log()
        }

        req.continue();
    });

    page.on('response', async (res: HTTPResponse) => {
        const requestId = res.request().url() + "$$$" + res.request().method()
        requestPending[requestId] = false

        const url = res.url();
        const status = res.status();

        // find the request.
        // @ts-ignore
        const req = reqs.find(req => req.url() == url)
        if (!req) {
            // console.warn(`failed to find request for ${url}`)
            console.log(chalk.red('missing'), url)
            return
        }

        let buffer
        try {
            buffer = await res.buffer();
        } catch (err) {
            console.warn(`failed to buffer ${res.url()}`)
            return
        }

        // @ts-ignore
        let resource: Resource = {}
        resource.url = url
        resource.status = status
        resource.method = req.method()
        resource.headers = res.headers()
        resource.buffer = buffer.toString('base64'),
        // @ts-ignore
        snapshot.resources.push(resource)

        if (status == 200) {
            // await saveResource(url, buffer)
        }
    })

    // Go to your site
    // const res = await page.goto(`https://app.lyra.finance/`);
    const res = await page.goto(url, {
        // waitUntil: 'networkidle0'
    })

    // Wait for the page to load.
    // await page.waitForNetworkIdle({
    //     timeout: 10000,
    // });]

    // Scroll the page by (viewport height * 0.9) every 100ms.
    // await page.evaluate(() => {
    //     const scrollHeight = document.documentElement.scrollHeight;
    //     const viewportHeight = window.innerHeight;
    //     const maxScrollTop = scrollHeight - viewportHeight;
    //     window.scrollBy(0, viewportHeight * 0.9);

    //     // @ts-ignore
    //     const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    //     const smoothScroll = async () => {
    //         await sleep(100);
    //         if (window.scrollY < maxScrollTop) {
    //             window.scrollBy(0, viewportHeight * 0.9);
    //             smoothScroll();
    //         }
    //     };
    //     smoothScroll();
    // });

    // wait 10s.
    await page.waitForTimeout(15000)
    

    // Save the content.
    console.log(`saving content`)
    const content = await page.content();
    const buffer = Buffer.from(content)
    await saveResource(url, buffer)

    // save the content using a content script, 

    snapshot.page.content = content

    // Dump state to file.
    fs.writeFileSync(`data/${snapshotName}.json`, JSON.stringify(snapshot, null, 2))

    return page
}

async function main() {
    // Launch the browser
    const browser = await puppeteer.launch({
        // headless: false,
        defaultViewport: {
            width: 1920,
            // Set the height to something large enough to fit the content without scrolling.
            // This way, images which are lazy loaded are inside the viewport on page load, and hence are requested
            // by the browser, which we can now intercept and capture for archival.
            height: 1080*500,
        }
    });

    // Create a page
    const page = await browser.newPage();
    // await singlePageCrawl("youtube", page, `https://cobie.substack.com/p/tokens-in-the-attention-economy`)
    // await singlePageCrawl("youtube", page, `https://liamzebedee.medium.com/the-invention-of-the-blockchain-fe25be0caebc`)

    await singlePageCrawl("youtube", page, `https://twitter.com/rargulati/status/1564361950158471168`)
    // await singlePageCrawl(page, `https://app.uniswap.org`)
    
    // const page2 = await browser.newPage();
    // const page3 = await browser.newPage();

    // singlePageCrawl(page, `https://liamzebedee.gitbook.io/dappnet/`)
    // singlePageCrawl(page2, `https://liamzebedee.gitbook.io/dappnet/overview/what-is-dappnet`)

    // singlePageCrawl(page3, `https://geohot.github.io/blog/jekyll/update/2021/10/29/an-architecture-for-life.html`)

    // Now crawl all the links inside this page.
    // wait 10s
    // await page.waitForTimeout(10000);

    // const cdp = await page.target().createCDPSession();
    // const { data } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
    // fs.writeFileSync('page.mhtml', data);

    // Log all of the network requests for the page.
    // e.g. AJAX, JS, CSS, images.

    // Close browser.
    await browser.close();
}

main().catch(err => {
    console.log(err.stack);
    throw err
});