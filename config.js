import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

if (config.TARGET_PATH) {
    config.TARGET_PATH = path.resolve(__dirname, config.TARGET_PATH);
}

if (process.argv[2]) {
    config.TARGET_PATH = path.resolve(process.argv[2]);
}

export default config;
