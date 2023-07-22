import * as sourceMap from 'source-map-support';
sourceMap.install();
import puppeteer, { Page, ResponseForRequest } from 'puppeteer';
import { HTTPResponse } from 'puppeteer';
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk';
import shelljs from 'shelljs'
import { Snapshot } from './types.js';
import { config, isResourceCacheable } from './common.js';

async function main() {
    // Launch the browser
    const browser = await puppeteer.launch({
        headless: false,
        ignoreHTTPSErrors: true,
        args: [`--window-size=1920,1080`]
        // defaultViewport: {
        //     width: 1920,
        //     height: 1080,
        // }
    });

    // Create a page
    const page = await browser.newPage();

    // Configure network request interception.
    await page.setRequestInterception(true);

    // Load the snapshot json.
    let snapshot: Snapshot = JSON.parse(fs.readFileSync('data/youtube.json', 'utf8'))
    // let snapshot: Snapshot = JSON.parse(fs.readFileSync('data/snapshot.json', 'utf8'))

    // Setup request interception to load requests from the snapshot.
    page.on('request', async req => {
        const url = req.url()
        const resourceType = req.resourceType()
        const resourceUrl = req.url()
        const initiator = req.initiator()

        // Log basic details.
        console.log(chalk.blue(`request ${resourceType} ${resourceUrl} ${initiator}`))

        if (!isResourceCacheable(req)) {
            console.log(chalk.red(`skipping request`))
            // req.continue()
            req.abort('blockedbyclient')
            return
        }


        // Find the request in the snapshot.
        const snapshotResource = snapshot.resources.find((res) => {
            const match = res.url == url && res.method == req.method()
            return match
        })

        // If the request is found in the snapshot, respond with the snapshot.
        if (snapshotResource) {
            console.log(chalk.green(`responding with snapshot`))
            const contentType = snapshotResource.headers['content-type']            

            let responseForRequest: Partial<ResponseForRequest> = {
                status: snapshotResource.status,
                headers: {
                    // most liberal CORS policy.
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                    'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
                    'Access-Control-Allow-Credentials': 'true',

                    // Other important headers.
                    'Content-Type': contentType,
                    'Content-Length': snapshotResource.buffer.length,
                    
                    // Never cache.
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',

                    // Images.
                    'Accept-Ranges': 'bytes',
                },
                // headers: snapshotResource.headers,
                body: Buffer.from(snapshotResource.buffer as any, 'base64'),
                contentType,
            }
            // console.log(snapshotResource)
            // console.log(responseForRequest)
            req.respond(responseForRequest)
        } else {
            // console.log(chalk.red(`responding with network`))
            console.log(chalk.red('missing'), url)
            // req.continue()
            req.abort()
        }

        console.log()
    })

    // Now load the page.
    // Load the HTML of the snapshot into the page.
    
    // Set the page URL.
    await page.goto(snapshot.page.url)
    // await page.setContent(snapshot.page.content, {
    //     waitUntil: 'networkidle0'
    // })

    // Close browser.
    // await browser.close();
}

main().catch(err => {
    console.log(err.stack);
    throw err
});