const puppeteer = require('puppeteer');

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => {
            console.log(`LOG [${msg.type()}]: ${msg.text()}`);
        });
        page.on('pageerror', err => {
            console.log(`ERROR: ${err.toString()}`);
        });

        await page.goto('http://localhost:8080'); // Wait for initial load
        await new Promise(r => setTimeout(r, 2000));

        console.log("Looking for start button...");
        const startBtn = await page.$('#start-btn');
        if (startBtn) {
            console.log("Clicking start...");
            await startBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            console.log("Taking screenshot after start...");
            await page.screenshot({ path: 'after_start.png' });
        } else {
            console.log("Start button not found!");
        }

        console.log("Completed gameplay check.");
        await browser.close();
    } catch (e) {
        console.error('PUPPETEER EXCEPTION:', e);
        if (browser) await browser.close();
        process.exit(1);
    }
})();
