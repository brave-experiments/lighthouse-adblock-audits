const puppeteer = require('puppeteer-core');
const fs = require('fs');
const {URL} = require('url');

const args = [
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-hang-monitor',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--enable-automation',
      '--password-store=basic',
      '--use-mock-keychain',
      '--ignore-certificate-errors',
      '--allow-running-insecure-content',
      '--no-sandbox',
    ];

const execPath = "/Applications/Brave\ Browser\ Nightly.app/Contents/MacOS/Brave\ Browser\ Nightly"
const userProfileDir = "./dummyprofile";

function wait (ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}



async function getFollowLinks(browser, url) {
    const page = await browser.newPage()
    await page.setCacheEnabled(false)
    console.log("Load ", url);
    await page.goto("http://" + url, {waitUntil: ["load"]})

    let links = await page.evaluate(url => {
        function shuffle(a) {
            var j, x, i;
            for (i = a.length - 1; i > 0; i--) {
                j = Math.floor(Math.random() * (i + 1));
                x = a[i];
                a[i] = a[j];
                a[j] = x;
            }
            return a;
        }

        var links = [...document.querySelectorAll("a")]
            .filter(u => u.origin.includes(url) && u.pathname.split('/').length > 1)
        links.sort((a, b) => { return (b.pathname.match(/\//g) || []).length - (a.pathname.match(/\//g) || []).length });
        var uniqueLinks = new Set(links.map(u => u.href));
        return shuffle(Array.from(uniqueLinks)).slice(1,20)
    }, url);
    page.close();
    return links
}

(async () => {
    const browser = await puppeteer.launch({
        executablePath: execPath,
        defaultViewport: {
            width: 1920,
            height: 1080,
            isMobile: false,
            isLandscape: false,
        },
        // ignoreDefaultArgs: true,
        args: args,
        userDataDir: userProfileDir,
        headless: false
    });

    let sites = fs.readFileSync('sites.txt', {encoding: 'UTF-8'}).split('\n');

    for (let i = 0; i < sites.length; i++) {
      let domain = sites[i];

      console.log("Crawling ", domain);

      let links = await getFollowLinks(browser, domain);
      console.log("Got links", links);
      for (let j = 0; j < links.length; j++) {
          fs.appendFileSync('urls.txt', links[j]+"\n");
      }
    }
})()
