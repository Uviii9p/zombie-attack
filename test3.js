const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    let browser;
    try {
        fs.writeFileSync('logs.txt', '');
        browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => {
            fs.appendFileSync('logs.txt', `LOG [${msg.type()}]: ${msg.location().url || ''} ${msg.text()}\n`);
        });
        page.on('pageerror', err => {
            fs.appendFileSync('logs.txt', `ERROR: ${err.toString()}\n`);
        });

        await page.goto('http://localhost:8080', { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 2000));

        fs.appendFileSync('logs.txt', "Completed check.\n");
        await browser.close();
    } catch (e) {
        fs.appendFileSync('logs.txt', `PUPPETEER EXCEPTION: ${e.toString()}\n`);
        if (browser) await browser.close();
        process.exit(1);
    }
})();
