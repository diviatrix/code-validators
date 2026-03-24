const path = require('path');
const config = require('./config');
const { pathExists } = require('./utility/file-utils');
const { generateReport, saveReport, printResults } = require('./utility/report-generator');

// Import all validators
const validators = {
    'check-classes': require('./validators/check-classes'),
    'check-css': require('./validators/check-css'),
    'check-dependencies': require('./validators/check-dependencies'),
    'check-lines': require('./validators/check-lines')
};

// Get target directory from command line arguments or use config default
const targetDir = process.argv[2] || config.TARGET_PATH || '';

// Validate target directory
if (!pathExists(targetDir)) {
    console.log(`Error: Target path does not exist: ${targetDir}`);
    process.exit(1);
}

console.log('🔍 Running all validators...\n');
console.log(`Target: ${targetDir}`);

const results = [];
let allPassed = true;

// Run only validators enabled in config.VALIDATORS
for (const [validatorName, enabled] of Object.entries(config.VALIDATORS)) {
    if (!enabled) continue;

    const validator = validators[validatorName];

    if (!validator) {
        console.log(`⚠️  Unknown validator: ${validatorName}`);
        continue;
    }

    const startTime = Date.now();
    let result;

    // Run validator with appropriate config
    if (validatorName === 'check-classes') {
        result = validator.validate(targetDir, config.MAX_CLASS_LINES, config.CODE_EXTENSIONS);
    } else if (validatorName === 'check-css') {
        result = validator.validate(targetDir, config.IGNORE_FOLDERS);
    } else if (validatorName === 'check-dependencies') {
        result = validator.validate(targetDir, config.IGNORE_FOLDERS);
    } else if (validatorName === 'check-lines') {
        result = validator.validate(targetDir, config.MAX_LINES, config.EXCLUDE_DIRS, config.EXCLUDE_FILES, config.HTML_TAGS, config.CODE_EXTENSIONS, config.MAX_VALUE_LINES, config.MAX_METHOD_LINES);
    }

    result.name = validatorName;
    result.duration = Date.now() - startTime;
    results.push(result);

    if (!result.passed) {
        allPassed = false;
    }
}

// Print results
printResults(results, true);

// Save report if enabled
if (config.SAVE_REPORT) {
    const report = generateReport(targetDir, results);
    saveReport(report, config.REPORT_FILE);
    console.log(`📊 Report saved to ${config.REPORT_FILE}`);
}

// Exit with appropriate code
if (!allPassed) {
    process.exit(1);
}
