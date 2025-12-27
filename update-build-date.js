const fs = require('fs');

const now = new Date();
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0');
const year = now.getFullYear();
const dateStr = `${day}/${month}/${year}`;

const content = `export const BUILD_DATE = "${dateStr}";\n`;

try {
    fs.writeFileSync('./src/buildDate.ts', content);
    console.log(`✅ Build date updated to: ${dateStr}`);
} catch (err) {
    console.error('❌ Failed to update build date:', err);
    process.exit(1);
}
