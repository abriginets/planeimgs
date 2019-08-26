/**
 * Core Modules
 */

import puppeteer from 'puppeteer'
import fs from 'fs'
import got from 'got'
import { exec as childProcessExec } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const exec = promisify(childProcessExec)

const argv = {
    debug: true,
    crawlTasks: ['boeing', 'airbus', 'airbus380'] // remove or add items to crawl specific airlines and jets
}

const database = JSON.parse(fs.readFileSync('database.json', 'utf-8'))
const URL_REGEXP = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/

/**
 * Logic
 */

exec('magick -version').then(() => start()).catch(e => console.error(e))

async function start() {
    if(argv.crawlTasks.includes('boeing')) await crawlBoeingPics()
    if(argv.crawlTasks.includes('airbus')) await crawlAirbusPics()
    if(argv.crawlTasks.includes('airbus380')) await crawlA380pics()
}

async function crawlA380pics() {
    const browser = await puppeteer.launch({ headless: 'debug' in argv === false})
    const page = await browser.newPage()
    await page.goto('https://www.iflya380.com/a380-airlines.html')

    var airlines = await page.evaluate(() => {
        var index380 = {
            'airfrance': 'AF',
            'ana': 'NH',
            'asiana': 'OZ',
            'british': 'BA',
            'chinasouthern': 'CZ',
            'emirates': 'EK',
            'etihad': 'EY',
            'hifly': '5K',
            'korean': 'KE',
            'lufthansa': 'LH',
            'malaysia': 'MH',
            'qantas': 'QF',
            'qatar': 'QR',
            'singapore': 'SQ',
            'thai': 'TG'
        }

        var airlinesLinks = {}
        document.querySelectorAll('.company-image').forEach(val => {
            airlinesLinks[index380[val.classList.value.replace('company-image ', '')]] = window.getComputedStyle(val).backgroundImage.match(/url\("(.*)"\)/)[1]
        })
        return airlinesLinks
    })

    var dirpath = path.resolve(__dirname, '../images/airbus/a380')

    if(!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath, { recursive: true })
    }

    for(let code in airlines) {
        var res = await got(airlines[code], { encoding: null, rejectUnauthorized: false })
        fs.writeFileSync(`${dirpath}/${code}.png`, res.body)
    }

    await browser.close()
}

// AIRBUS
async function crawlAirbusPics() {
    var airbusFamilies = {
        a220: 'https://www.airbus.com/aircraft/passenger-aircraft/a220-family.html',
        a320: 'https://www.airbus.com/aircraft/passenger-aircraft/a320-family.html',
        a330: 'https://www.airbus.com/aircraft/passenger-aircraft/a330-family.html',
        a340: 'https://www.airbus.com/aircraft/previous-generation-aircraft/a340-family.html',
        a350xwb: 'https://www.airbus.com/aircraft/passenger-aircraft/a350xwb-family.html'
    }
    console.log('[AIRBUS] Crawler started...')

    const browser = await puppeteer.launch({ headless: 'debug' in argv === false})
    const page = await browser.newPage()

    var urlsToCrawl : string[] = []

    for(let i in airbusFamilies) {
        await page.goto(airbusFamilies[i], { waitUntil: 'domcontentloaded' })

        var familyCrafts = await page.evaluate(() => {
            var urls = document.querySelectorAll('a')
            var matchedUrls : string[] = []

            for(let i = 0; i < urls.length; i++) {
                var href = urls[i].getAttribute('href')
                if(/^\/aircraft\/(passenger-aircraft|previous-generation-aircraft)\/a[0-9]{3}(xwb)?-family\/a[0-9]{3}(-[0-9]{3,4}|neo)?\.html$/.test(href)) {
                    matchedUrls.push(document.location.origin + href)
                }
            }

            return matchedUrls
        })

        for(let i = 0; i < familyCrafts.length; i++) {
            if(!urlsToCrawl.includes(familyCrafts[i])) {
                urlsToCrawl.push(familyCrafts[i])
            }
        }
    }

    var parallelCrawler = []

    for(let i = 0; i < urlsToCrawl.length; i++) {
        parallelCrawler.push(getAirbusImage(urlsToCrawl[i]))
    }

    await Promise.all(parallelCrawler)

    async function getAirbusImage(url : string) {
        let page = await browser.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded' })

        page.on('console', consoleObj => {
            if(consoleObj.text().startsWith('[PUPPETEER]')) {
                console.log(url)
            }
        })

        await page.waitForSelector('.slick-active-first')

        var urlToImage : string = await page.evaluate(() => {
            try {
                return document.querySelector('nav[data-config="KeyProductFigures.config.tablist"]').parentElement.querySelector('.slick-active-first').querySelector('picture source').getAttribute('srcset')
            } catch(unused) {
                console.log('[PUPPETEER]')
            }
        })

        await page.close()

        var dirpath = path.resolve(__dirname, '../images/airbus')
        var filename = url.split('/').pop().split('.')[0]

        if(!fs.existsSync(dirpath)) {
            fs.mkdirSync(dirpath, { recursive: true })
        }

        var res = await got(urlToImage, { encoding: null, rejectUnauthorized: false })
        fs.writeFileSync(`${dirpath}/${filename}_tmp.png`, res.body)

        try {
            await exec(`magick ${dirpath}/${filename}_tmp.png -colors 255 -strip -flatten -fuzz 5% -trim +repage ${dirpath}/${filename}.png`)
            fs.unlinkSync(`${dirpath}/${filename}_tmp.png`)
        } catch(e) {
            console.error(e)
        }
    }

    await browser.close()
}

// BOEING
async function crawlBoeingPics() {
    console.log('[BOEING] Crawler started...');

    const browser = await puppeteer.launch({ headless: 'debug' in argv === false})
    const page = await browser.newPage()
    await page.goto('https://www.boeing.com/commercial/customers/', { waitUntil: 'domcontentloaded' })
    
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

    var parallelPromises = [] 
    var promisesLeft = allowedAirlines.length

    for(let airline in customersList) {
        if(allowedAirlines.includes(airline)) {
            if(URL_REGEXP.test(customersList[airline])) {
                parallelPromises.push(getAirlineImages(airline, customersList[airline]))
            } else {
                console.log('ERROR: seems like Boeing changed page markup so it`s impossible to parse URL')
                break
            }
        }

        if(parallelPromises.length === 10 || (parallelPromises.length < 10 && promisesLeft === parallelPromises.length)) {
            await Promise.all(parallelPromises)
            promisesLeft = promisesLeft - 10
            console.log('[Boeing] ' + promisesLeft + ' airlines left')
            parallelPromises = []
        }
    }

    await browser.close()
    
    async function getAirlineImages(airline : string, url : string) {
        try {
            const page = await browser.newPage()
            await page.goto(url, { timeout: 3000000 })
        
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
                    await exec(`magick ${dirpath}/${airline}.${fileExt} -colors 255 -strip -flatten -fuzz 5% -trim +repage ${dirpath}/${database.boeing[airline]}.png`)
                } catch(e) {
                    console.log(`Image ${airline}.${fileExt} left unprocessed after error:\n${e}`)
                }
        
                fs.unlinkSync(`${dirpath}/${airline}.${fileExt}`)
            }

            await page.close()
        } catch(e) {
            console.log('err occured')
        }
    }
}