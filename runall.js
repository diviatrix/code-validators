import config from './config.js';
import { pathExists, scanAndLoadDirectory } from './utility/file-utils.js';
import { generateReport, saveReport, printResults } from './utility/report-generator.js';
import * as checkClasses from './validators/check-classes.js';
import * as checkCss from './validators/check-css.js';
import * as checkDependencies from './validators/check-dependencies.js';
import * as checkLines from './validators/check-lines.js';

const validators = {
    'check-classes': checkClasses,
    'check-css': checkCss,
    'check-dependencies': checkDependencies,
    'check-lines': checkLines
};

function runValidator(name, v, files, cfg) {
    const start = Date.now();
    let r;
    if (name === 'check-classes') r = v.validate(files.codeFiles, cfg.MAX_CLASS_LINES);
    else if (name === 'check-css') r = v.validate(files.cssFiles, files.codeFiles);
    else if (name === 'check-dependencies') r = v.validate(files.packageJsonFiles);
    else if (name === 'check-lines') r = v.validate(files.codeFiles, files.htmlFiles, cfg.MAX_LINES, cfg.HTML_TAGS, cfg.MAX_VALUE_LINES, cfg.MAX_METHOD_LINES, cfg.MAX_CLASS_LINES, cfg.LOCALES_PATH);
    r.name = name;
    r.duration = Date.now() - start;
    return r;
}

const targetDir = process.argv[2] || config.TARGET_PATH || '';
if (!pathExists(targetDir)) { console.log(`Error: Target path does not exist: ${targetDir}`); process.exit(1); }

console.log('🔍 Running all validators...\n');
console.log(`Target: ${targetDir}`);

const files = scanAndLoadDirectory(targetDir, config.EXCLUDE_DIRS, config.EXCLUDE_FILES);
const results = Object.entries(config.VALIDATORS)
    .filter(([, enabled]) => enabled)
    .map(([name]) => {
        const v = validators[name];
        if (!v) { console.log(`⚠️  Unknown validator: ${name}`); return null; }
        return runValidator(name, v, files, config);
    })
    .filter(r => r);

results.forEach(r => { if (!r.passed) process.exitCode = 1; });

printResults(results, true);

if (config.SAVE_REPORT) {
    const report = generateReport(targetDir, results);
    saveReport(report, config.REPORT_FILE);
    console.log(`📊 Report saved to ${config.REPORT_FILE}`);
}
