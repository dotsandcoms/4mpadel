const { Jimp } = require('jimp');

async function removeBlackBackground() {
    try {
        const imagePath = '/Users/bradein/.gemini/antigravity/brain/e60cfd28-b285-4dda-ab26-7b3352d8f4d6/media__1775677878852.png';
        const image = await Jimp.read(imagePath);
        
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
            const r = image.bitmap.data[idx];
            const g = image.bitmap.data[idx + 1];
            const b = image.bitmap.data[idx + 2];
            
            // If pixel is very very dark (almost black)
            if (r < 15 && g < 15 && b < 15) {
                // Set alpha to 0 (transparent)
                image.bitmap.data[idx + 3] = 0;
            }
        });
        
        await image.write('./public/images/kitkat-elite-crest.png');
        console.log('Background removed and saved successfully.');
    } catch (error) {
        console.error('Error:', error);
    }
}

removeBlackBackground();
