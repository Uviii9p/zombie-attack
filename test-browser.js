const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => {
            console.log(`PAGE LOG [${msg.type()}]:`, msg.text());
        });
        page.on('pageerror', err => {
            console.log('PAGE ERROR:', err.toString());
        });

        await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });

        // Take a screenshot to verify what's rendering
        await page.screenshot({ path: 'screenshot.png' });

        console.log("Completed check. Closing.");
        await browser.close();
    } catch (e) {
        console.error('PUPPETEER ERROR:', e);
        process.exit(1);
    }
})();
