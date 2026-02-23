const puppeteer = require('puppeteer');

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => {
            console.log(`PAGE LOG [${msg.type()}]:`, msg.location().url || '', msg.text());
        });
        page.on('pageerror', err => {
            console.log('PAGE ERROR:', err.toString());
        });

        await page.goto('http://localhost:8080', { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 2000));

        console.log("Completed check. Closing.");
        await browser.close();
    } catch (e) {
        console.error('PUPPETEER ERROR:', e);
        if (browser) await browser.close();
        process.exit(1);
    }
})();
