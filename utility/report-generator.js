const fs = require('fs');
const path = require('path');

/**
 * Generates a validation report from validator results.
 * @param {string} targetPath - Target directory that was validated
 * @param {Array} results - Array of validator results
 * @returns {Object}
 */
function generateReport(targetPath, results) {
    const allPassed = results.every(r => r.passed);

    return {
        timestamp: new Date().toISOString(),
        targetPath,
        allPassed,
        summary: {
            total: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length
        },
        validators: results.map(r => ({
            name: r.name,
            passed: r.passed,
            duration: r.duration,
            stats: r.stats,
            violationCount: countViolations(r.violations),
            violations: r.violations
        }))
    };
}

/**
 * Counts total violations from violations object.
 * @param {Object} violations - Violations object
 * @returns {number}
 */
function countViolations(violations) {
    if (!violations) return 0;
    if (Array.isArray(violations)) return violations.length;

    let count = 0;
    for (const key of Object.keys(violations)) {
        const value = violations[key];
        if (Array.isArray(value)) {
            count += value.length;
        }
    }
    return count;
}

/**
 * Saves report to JSON file.
 * @param {Object} report - Report object
 * @param {string} filePath - File path to save
 */
function saveReport(report, filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
}

/**
 * Formats validator result for console output.
 * @param {Object} result - Validator result
 * @returns {string}
 */
function formatResult(result) {
    const status = result.passed ? '✅' : '❌';
    const duration = `${result.duration}ms`;
    const violationCount = countViolations(result.violations);

    let output = `${status} ${result.name} (${duration})`;
    if (violationCount > 0) {
        output += ` - ${violationCount} violation(s)`;
    }

    return output;
}

/**
 * Formats violations for detailed console output.
 * @param {Object} violations - Violations object
 * @param {string} validatorName - Validator name
 * @returns {string}
 */
function formatViolations(violations, validatorName) {
    if (!violations) return '';

    const lines = [];

    // Handle array violations (dependencies)
    if (Array.isArray(violations)) {
        for (const v of violations) {
            if (v.file && v.errors) {
                lines.push(`  ${v.file}:`);
                for (const error of v.errors) {
                    lines.push(`    - ${error}`);
                }
            } else if (v.message) {
                lines.push(`  ${v.message}`);
            }
        }
        return lines.join('\n');
    }

    // Handle object violations (css, classes, lines)
    for (const [key, value] of Object.entries(violations)) {
        if (!Array.isArray(value) || value.length === 0) continue;

        const label = formatViolationKey(key);
        lines.push(`\n  ${label} (${value.length}):`);

        for (const v of value) {
            const line = formatViolationItem(v, key);
            if (line) lines.push(`    ${line}`);
        }
    }

    return lines.join('\n');
}

/**
 * Formats violation key to readable label.
 * @param {string} key - Violation key
 * @returns {string}
 */
function formatViolationKey(key) {
    const labels = {
        duplicateClasses: 'Duplicate CSS class definitions',
        identicalClasses: 'Identical CSS classes (code duplication)',
        duplicateVars: 'CSS variables with duplicate values',
        unusedClasses: 'Unused CSS classes',
        nestedRules: 'Nested CSS rules',
        hardcodedValues: 'Hardcoded values without var()',
        compoundVars: 'Compound parameters in :root',
        inlineStyles: 'Inline styles in code',
        htmlInCode: 'HTML in code files',
        codeFilesExceedingLimit: 'Code files exceeding line limit',
        htmlFilesExceedingLimit: 'HTML files exceeding line limit'
    };
    return labels[key] || key;
}

/**
 * Formats individual violation item.
 * @param {Object} v - Violation item
 * @param {string} key - Violation key
 * @returns {string}
 */
function formatViolationItem(v, key) {
    switch (key) {
        case 'duplicateClasses':
            return `.${v.class}: defined ${v.definitionCount} times in ${v.file}`;
        case 'identicalClasses':
            return `Classes: ${v.classes.map(c => '.' + c).join(', ')}`;
        case 'duplicateVars':
            return `Value "${v.value}": ${v.items.map(i => `--${i.name}`).join(', ')}`;
        case 'unusedClasses':
            return `.${v.class} at ${v.file}:${v.line}`;
        case 'nestedRules':
            return `.${v.nestedClass} inside .${v.parentClass} at ${v.file}:${v.line}`;
        case 'hardcodedValues':
            return `${v.file}:${v.line} .${v.class}: "${v.value}" (${v.type})`;
        case 'compoundVars':
            if (v.isDefinition) {
                return `${v.varName}: ${v.content}`;
            }
            return `${v.varName} used at ${v.file}:${v.line}`;
        case 'inlineStyles':
            return `${v.file}:${v.line}: ${v.content}`;
        case 'codeFilesExceedingLimit':
        case 'htmlFilesExceedingLimit':
            return `${v.file}: ${v.lines} lines`;
        case 'htmlInCode':
            return `${v.file}: ${v.issues.map(i => `line ${i.line}: ${i.tags.join(', ')}`).join('; ')}`;
        default:
            if (v.file) {
                return `${v.file}: ${JSON.stringify(v)}`;
            }
            return JSON.stringify(v);
    }
}

/**
 * Prints validation results to console.
 * @param {Array} results - Array of validator results
 * @param {boolean} showDetails - Whether to show detailed violations
 */
function printResults(results, showDetails = true) {
    const allPassed = results.every(r => r.passed);

    console.log('\n' + '='.repeat(50));
    if (allPassed) {
        console.log('✅ All validators passed!');
    } else {
        console.log('❌ Some validators failed!');
    }

    console.log('\nValidator Results:');
    console.log('-'.repeat(50));

    for (const result of results) {
        console.log(formatResult(result));

        if (showDetails && !result.passed && result.violations) {
            const details = formatViolations(result.violations, result.name);
            if (details) {
                console.log(details);
            }
        }
    }

    console.log('='.repeat(50));
}

module.exports = {
    generateReport,
    saveReport,
    formatResult,
    formatViolations,
    printResults,
    countViolations
};
