async function run() {
    try {
        const url = 'https://www.rankedin.com/en/tournament/65139/fnl-men-s-intermediate-clash';
        console.log(`Fetching ${url}...`);
        const res = await fetch(url);
        const html = await res.text();

        const titleMatch = html.match(/<meta property="?og:title"? content="([^"]+)"/);
        const descMatch = html.match(/<meta property="?og:description"? content="([^"]+)"/) || html.match(/<meta name="?description"? content="([^"]+)"/);
        const imageMatch = html.match(/<meta property="?og:image"? content="([^"]+)"/);

        console.log("Title:", titleMatch ? titleMatch[1] : null);
        console.log("Description:", descMatch ? descMatch[1] : null);
        console.log("Image:", imageMatch ? imageMatch[1] : null);

        // Also look for an api url in scripts
        const apiUrlMatch = html.match(/https:\/\/api\.rankedin\.com[^"'\s]+/g);
        if (apiUrlMatch) {
            console.log("Found API urls:", [...new Set(apiUrlMatch)]);
        }

    } catch (e) {
        console.error(e);
    }
}

run();
