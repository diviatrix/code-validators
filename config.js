const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Resolve TARGET_PATH if provided
if (config.TARGET_PATH) {
    config.TARGET_PATH = path.resolve(__dirname, config.TARGET_PATH);
}

// Override with command line argument if provided
if (process.argv[2]) {
    config.TARGET_PATH = path.resolve(process.argv[2]);
}

module.exports = config;
