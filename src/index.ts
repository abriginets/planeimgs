/**
 * Core Modules
 */

import puppeteer from 'puppeteer'
import fs from 'fs'
import got from 'got'
import * as yargs from 'yargs'
import { exec as childProcessExec } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const exec = promisify(childProcessExec)

const argv = yargs.options({
    c: { type: 'number', alias: 'concurrency' }
}).argv;

const database = JSON.parse(fs.readFileSync('database.json', 'utf-8'))

/**
 * Logic
 */

// BOEING

console.log('[BOEING] Crawler started...');

(async () => {
    const browser = await puppeteer.launch({ headless: 'debug' in argv === false})
    const page = await browser.newPage()
    await page.goto('https://www.boeing.com/commercial/customers/')
    
    var customersList = await page.evaluate(() => {
        var customersLink = document.querySelectorAll('a[href^="/commercial/customers"]')
        var customersList = {}

        for(let i = 0; i < customersLink.length; i++) {
            let href = customersLink[i].getAttribute('href')

            if(/^\/commercial\/customers\/(.*)\/$/.test(href)) {
                customersList[href.match(/^\/commercial\/customers\/(.*)\/$/)[1]] = document.location.protocol + '//' + document.location.host + href
            }
        }

        return customersList
    })

    if(!fs.existsSync(path.resolve(__dirname, '../images/boeing/'))) {
        fs.mkdirSync(path.resolve(__dirname, '../images/boeing/'), { recursive: true })
    }

    var allowedAirlines = Object.keys(database.boeing)

    for(let airline in customersList) {
        if(allowedAirlines.includes(airline)) {
            await getAirlineImages(airline, customersList[airline])
        }
    }
    
    await browser.close()

})();

async function getAirlineImages(airline : string, url : string) {
    const browser = await puppeteer.launch({ headless: 'debug' in argv === false})
    const page = await browser.newPage()
    await page.goto(url)

    var planes = await page.evaluate(() => {
        let planeBlocks = document.querySelectorAll('.plane')
        let planesObj = {}

        for(let i = 0; i < planeBlocks.length; i++) {
            let dataHash = planeBlocks[i].closest('section').getAttribute('data-hash')

            if(!/^(360view|cargo)$/.test(dataHash)) {
                planesObj[dataHash] = (planeBlocks[i].children[0] as HTMLMediaElement).currentSrc
            }
        }

        return planesObj
    })

    for(let i in planes) {
        var dir = `../images/boeing/${i}/`
        var fileExt = planes[i].split('.').pop()
        let dirpath = path.resolve(__dirname, dir)

        if(!fs.existsSync(dirpath)) {
            fs.mkdirSync(dirpath, { recursive: true })
        }

        var res = await got(planes[i], { encoding: null, rejectUnauthorized: false })

        fs.writeFileSync(`${dirpath}/${airline}.${fileExt}`, res.body)

        try {
            await exec(`magick ${dirpath}/${airline}.${fileExt} -flatten -fuzz 5% -trim +repage ${dirpath}/${database.boeing[airline]}.png`)
        } catch(e) {
            console.log(`Image ${airline}.${fileExt} left unprocessed after error:\n${e}`)
        }

        fs.unlinkSync(`${dirpath}/${airline}.${fileExt}`)
    }

    await browser.close()
}