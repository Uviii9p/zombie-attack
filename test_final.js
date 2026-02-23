const puppeteer = require('puppeteer');

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch();
        const page = await browser.newPage();

        const logs = [];
        page.on('console', msg => {
            logs.push(`[${msg.type()}] ${msg.text()}`);
        });
        page.on('pageerror', err => {
            logs.push(`[PAGE ERROR] ${err.toString()}`);
        });

        await page.goto('http://localhost:8080', { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 3000));

        // Print all logs
        logs.forEach(l => console.log(l));

        console.log("\n=== VERIFICATION COMPLETE ===");
        console.log(`Total logs: ${logs.length}`);
        console.log(`Errors: ${logs.filter(l => l.includes('[error]') || l.includes('[PAGE ERROR]')).length}`);

        await browser.close();
    } catch (e) {
        console.error('PUPPETEER EXCEPTION:', e);
        if (browser) await browser.close();
        process.exit(1);
    }
})();
