const fs = require('fs');
const path = require('path');

function generateReport(targetPath, results) {
    return {
        timestamp: new Date().toISOString(),
        targetPath,
        allPassed: results.every(r => r.passed),
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

function countViolations(v) {
    if (!v) return 0;
    if (Array.isArray(v)) return v.length;
    return Object.keys(v).reduce((c, k) => c + (Array.isArray(v[k]) ? v[k].length : 0), 0);
}

function saveReport(report, filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
}

function formatResult(result) {
    const status = result.passed ? '✅' : '❌';
    const out = `${status} ${result.name} (${result.duration}ms)`;
    const count = countViolations(result.violations);
    return count > 0 ? `${out} - ${count} violation(s)` : out;
}

function formatArrayViolations(violations) {
    const out = [];
    for (const v of violations) {
        if (v.file && v.errors) {
            out.push(`  ${v.file}:`);
            v.errors.forEach(e => out.push(`    - ${e}`));
        } else if (v.class && v.lines) {
            const line = formatViolationItem(v, 'classesExceedingLimit');
            if (line) out.push(`    ${line}`);
        } else if (v.message) {
            out.push(`  ${v.message}`);
        }
    }
    return out.join('\n');
}

function formatObjectViolations(violations) {
    const out = [];
    for (const [key, value] of Object.entries(violations)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        out.push(`\n  ${formatViolationKey(key)} (${value.length}):`);
        value.forEach(v => {
            const line = formatViolationItem(v, key);
            if (line) out.push(`    ${line}`);
        });
    }
    return out.join('\n');
}

function formatViolations(violations) {
    if (!violations) return '';
    return Array.isArray(violations)
        ? formatArrayViolations(violations)
        : formatObjectViolations(violations);
}

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
        classesExceedingLimit: 'Classes exceeding line limit',
        codeFilesExceedingLimit: 'Code files exceeding line limit',
        htmlFilesExceedingLimit: 'HTML files exceeding line limit',
        hardcodedStrings: 'Hardcoded strings in code'
    };
    return labels[key] || key;
}

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
            return v.isDefinition
                ? `${v.varName}: ${v.content}`
                : `${v.varName} used at ${v.file}:${v.line}`;
        case 'inlineStyles':
        case 'codeFilesExceedingLimit':
        case 'htmlFilesExceedingLimit':
            return `${v.file}: ${v.lines || v.content} lines`.replace(' lines lines', ' lines');
        case 'htmlInCode':
            return `${v.file}: ${v.issues.map(i => `line ${i.line}: ${i.tags.join(', ')}`).join('; ')}`;
        case 'hardcodedStrings':
            return `${v.file}: ${v.issues.map(i => `line ${i.line}: ${i.string}`).join(', ')}`;
        case 'classesExceedingLimit':
            return `${v.class} in ${v.file}: ${v.lines} lines (starts at line ${v.start})`;
        default:
            return v.file ? `${v.file}: ${JSON.stringify(v)}` : JSON.stringify(v);
    }
}

function printResults(results, showDetails = true) {
    console.log('\n' + '='.repeat(50));
    console.log(results.every(r => r.passed)
        ? '✅ All validators passed!'
        : '❌ Some validators failed!');
    console.log('\nValidator Results:');
    console.log('-'.repeat(50));

    for (const result of results) {
        console.log(formatResult(result));
        if (showDetails && !result.passed && result.violations) {
            const details = formatViolations(result.violations);
            if (details) console.log(details);
        }
    }

    console.log('='.repeat(50));
}

module.exports = {
    generateReport, saveReport, formatResult,
    formatViolations, printResults, countViolations
};
