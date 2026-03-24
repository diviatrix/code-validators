const fs = require('fs');
const path = require('path');
const { scanDirectory, readFileSafe, getRelativePath } = require('../utility/file-utils');

/**
 * Validates CSS files for various issues.
 * @param {string} targetDir - Target directory to validate
 * @param {string[]} ignoreFolders - Folders to ignore
 * @returns {{passed: boolean, violations: Object, stats: Object}}
 */
function validate(targetDir, ignoreFolders) {
    const violations = {
        duplicateClasses: [],
        identicalClasses: [],
        duplicateVars: [],
        unusedClasses: [],
        nestedRules: [],
        hardcodedValues: [],
        compoundVars: [],
        inlineStyles: []
    };

    const stats = {
        cssFilesScanned: 0,
        codeFilesScanned: 0,
        classesDefined: 0,
        classesUsed: 0,
        rootVarsCount: 0
    };

    const { cssFiles, codeFiles } = scanDirectory(targetDir, ignoreFolders);

    stats.cssFilesScanned = cssFiles.length;
    stats.codeFilesScanned = codeFiles.length;

    if (cssFiles.length === 0) {
        return { passed: true, violations, stats };
    }

    // Extract :root variables
    const rootVars = new Map();
    for (const cssFile of cssFiles) {
        const cssContent = readFileSafe(cssFile);
        if (!cssContent) continue;

        const cssLines = cssContent.split('\n');
        const relPath = getRelativePath(targetDir, cssFile);

        let inRoot = false;
        for (let i = 0; i < cssLines.length; i++) {
            const line = cssLines[i];
            if (line.includes(':root')) inRoot = true;
            if (inRoot) {
                const varMatch = line.match(/--([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*;/);
                if (varMatch) {
                    const varName = varMatch[1];
                    const value = varMatch[2].trim();
                    if (value.startsWith('var(')) continue;
                    if (!rootVars.has(value)) {
                        rootVars.set(value, []);
                    }
                    rootVars.get(value).push({ name: varName, line: i + 1, file: relPath, content: line.trim() });
                }
                if (line.includes('}')) inRoot = false;
            }
        }
    }

    stats.rootVarsCount = rootVars.size;

    for (const [value, items] of rootVars.entries()) {
        if (items.length > 1) {
            violations.duplicateVars.push({ value, items });
        }
    }

    // Extract all CSS class definitions
    const classDefs = new Map();
    for (const cssFile of cssFiles) {
        const cssContent = readFileSafe(cssFile);
        if (!cssContent) continue;

        const cssLines = cssContent.split('\n');
        const relPath = getRelativePath(targetDir, cssFile);

        let currentClass = null;
        let classContent = [];
        let inClass = false;

        for (let i = 0; i < cssLines.length; i++) {
            const line = cssLines[i];

            const classMatch = line.match(/^\s*\.([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/);
            if (classMatch) {
                if (inClass && currentClass) {
                    const entry = classDefs.get(currentClass);
                    if (entry) {
                        entry.content = classContent.join('\n').trim();
                    }
                }

                currentClass = classMatch[1];
                classContent = [line];
                inClass = true;

                if (!classDefs.has(currentClass)) {
                    classDefs.set(currentClass, { lines: [], content: '', hasDup: false, file: relPath });
                }
                classDefs.get(currentClass).lines.push(i + 1);
                classDefs.get(currentClass).file = relPath;
                if (classDefs.get(currentClass).lines.length > 1) {
                    classDefs.get(currentClass).hasDup = true;
                }

                if (line.includes('}')) {
                    const entry = classDefs.get(currentClass);
                    entry.content = classContent.join('\n').trim();
                    inClass = false;
                    currentClass = null;
                }
                continue;
            }

            if (inClass) {
                classContent.push(line);
                if (line.includes('}')) {
                    const entry = classDefs.get(currentClass);
                    entry.content = classContent.join('\n').trim();
                    inClass = false;
                    currentClass = null;
                }
            }
        }
    }

    stats.classesDefined = classDefs.size;

    // Find classes with identical content
    const contentMap = new Map();
    for (const [cls, data] of classDefs.entries()) {
        const content = data.content.replace(/\s+/g, ' ').trim();
        if (content && !content.startsWith('.')) {
            if (!contentMap.has(content)) {
                contentMap.set(content, []);
            }
            contentMap.get(content).push(cls);
        }
    }

    for (const [content, classes] of contentMap.entries()) {
        if (classes.length > 1) {
            violations.identicalClasses.push({ content, classes });
        }
    }

    // Find duplicate class definitions
    for (const [cls, data] of classDefs.entries()) {
        if (data.hasDup) {
            violations.duplicateClasses.push({
                class: cls,
                definitionCount: data.lines.length,
                file: data.file,
                lines: data.lines
            });
        }
    }

    // Find all classes used in codebase
    const classesUsed = new Set();
    for (const file of codeFiles) {
        const content = readFileSafe(file);
        if (!content) continue;

        const relPath = getRelativePath(targetDir, file);

        const classMatches = content.matchAll(/class="([^"]*)"/g);
        for (const match of classMatches) {
            const classStr = match[1].replace(/\$\{[^}]*\}/g, ' ');
            const classes = classStr.split(/\s+/).filter(c => c.trim());
            for (const cls of classes) {
                classesUsed.add(cls);
            }
        }

        const singleQuoteClassMatches = content.matchAll(/class='([^']*)'/g);
        for (const match of singleQuoteClassMatches) {
            const classStr = match[1].replace(/\$\{[^}]*\}/g, ' ');
            const classes = classStr.split(/\s+/).filter(c => c.trim());
            for (const cls of classes) {
                classesUsed.add(cls);
            }
        }

        const querySelectorMatches = content.matchAll(/(?:querySelector|querySelectorAll)\(['"]\.([a-zA-Z_-][a-zA-Z0-9_-]*)['"]\)/g);
        for (const match of querySelectorMatches) {
            classesUsed.add(match[1]);
        }

        const classListMatches = content.matchAll(/classList\.(?:add|remove|toggle)\(['"]([a-zA-Z_-][a-zA-Z0-9_-]*)['"]\)/g);
        for (const match of classListMatches) {
            classesUsed.add(match[1]);
        }

        // Check for inline styles
        const inlineStyleMatches = content.matchAll(/style=["'][^"']*["']/g);
        for (const match of inlineStyleMatches) {
            const lineNum = content.substring(0, match.index).split('\n').length;
            violations.inlineStyles.push({
                file: relPath,
                line: lineNum,
                content: match[0]
            });
        }
    }

    stats.classesUsed = classesUsed.size;

    // Find unused classes
    for (const [cls, data] of classDefs.entries()) {
        if (!classesUsed.has(cls) && !cls.startsWith('-') && cls !== 'root') {
            violations.unusedClasses.push({
                class: cls,
                line: data.lines[0],
                file: data.file,
                content: data.content.split('\n')[0]
            });
        }
    }

    // Check for hardcoded values and nested rules
    for (const cssFile of cssFiles) {
        const cssContent = readFileSafe(cssFile);
        if (!cssContent) continue;

        const cssLines = cssContent.split('\n');
        const relPath = getRelativePath(targetDir, cssFile);

        let inRootBlock = false;
        let currentClassName = null;
        let braceDepth = 0;

        for (let i = 0; i < cssLines.length; i++) {
            const line = cssLines[i];

            if (line.includes(':root')) {
                inRootBlock = true;
                continue;
            }
            if (inRootBlock && line.includes('}')) {
                inRootBlock = false;
                continue;
            }
            if (inRootBlock) continue;

            const classMatch = line.match(/^\s*\.([a-zA-Z_-][a-zA-Z0-9_-]*)/);
            if (classMatch && line.includes('{')) {
                currentClassName = classMatch[1];
                braceDepth = 1;
                if (line.includes('}')) {
                    braceDepth = 0;
                    currentClassName = null;
                }
            } else {
                for (const c of line) {
                    if (c === '{') braceDepth++;
                    if (c === '}') braceDepth--;
                }
                if (braceDepth <= 0) {
                    currentClassName = null;
                }
            }

            if (currentClassName && braceDepth > 0) {
                const nestedClassMatch = line.match(/^\s*\.([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/);
                if (nestedClassMatch && nestedClassMatch[1] !== currentClassName) {
                    violations.nestedRules.push({
                        parentClass: currentClassName,
                        nestedClass: nestedClassMatch[1],
                        line: i + 1,
                        file: relPath,
                        content: line.trim()
                    });
                }
            }

            if (line.trim().startsWith('/*') || line.trim() === '{' || line.trim() === '}') {
                continue;
            }

            if (line.includes('border')) {
                const borderMatch = line.match(/border(?:-left|-right|-top|-bottom)?\s*:\s*([^;]+)/);
                if (borderMatch) {
                    const borderValue = borderMatch[1].trim();
                    const hasHardcodedColor = /#[0-9a-fA-F]{3,6}|rgba?\(|hsla?\(/i.test(borderValue);
                    if (hasHardcodedColor) {
                        violations.hardcodedValues.push({
                            class: currentClassName || 'unknown',
                            line: i + 1,
                            file: relPath,
                            value: borderValue,
                            type: 'border',
                            content: line.trim()
                        });
                        continue;
                    }
                }
            }

            if (line.includes('var(--')) continue;

            const hexColorMatch = line.match(/#[0-9a-fA-F]{3,6}\b/);
            if (hexColorMatch) {
                violations.hardcodedValues.push({
                    class: currentClassName || 'unknown',
                    line: i + 1,
                    file: relPath,
                    value: hexColorMatch[0],
                    type: 'hex-color',
                    content: line.trim()
                });
                continue;
            }

            const sizeMatches = line.matchAll(/\b(\d+\.?\d*)(rem|pt|px)\b/g);
            for (const sizeMatch of sizeMatches) {
                const value = sizeMatch[0];
                if (value === '1pt' || value === '2pt' || value === '4pt') continue;
                violations.hardcodedValues.push({
                    class: currentClassName || 'unknown',
                    line: i + 1,
                    file: relPath,
                    value: value,
                    type: 'size',
                    content: line.trim()
                });
            }

            const colorFuncMatch = line.match(/(rgba|hsla|rgb|hsl)\s*\([^)]+\)/i);
            if (colorFuncMatch) {
                violations.hardcodedValues.push({
                    class: currentClassName || 'unknown',
                    line: i + 1,
                    file: relPath,
                    value: colorFuncMatch[0],
                    type: 'color-function',
                    content: line.trim()
                });
            }

            const props = line.split(';');
            for (const prop of props) {
                const match = prop.match(/^[\s]*([a-z-]+)[\s]*:[\s]*(.+)$/i);
                if (match) {
                    const value = match[2].trim();
                    if (value && !value.startsWith('var(')) {
                        violations.hardcodedValues.push({
                            class: currentClassName || 'unknown',
                            line: i + 1,
                            file: relPath,
                            value: value,
                            type: 'hardcoded-value',
                            content: line.trim()
                        });
                        break;
                    }
                }
            }
        }
    }

    // Check for compound variables in :root
    const compoundVarsInRoot = new Map();
    for (const cssFile of cssFiles) {
        const cssContent = readFileSafe(cssFile);
        if (!cssContent) continue;

        const cssLines = cssContent.split('\n');
        const relPath = getRelativePath(targetDir, cssFile);

        let inRoot = false;
        for (let i = 0; i < cssLines.length; i++) {
            const line = cssLines[i];
            if (line.includes(':root')) inRoot = true;
            if (inRoot) {
                const varMatch = line.match(/--([a-zA-Z0-9_-]+)\s*:\s*var\((--[a-zA-Z0-9_-]+)\)\s*;/);
                if (varMatch) {
                    const varName = varMatch[1];
                    const targetVar = varMatch[2];
                    compoundVarsInRoot.set(varName, { targetVar, line: i + 1, file: relPath, content: line.trim() });
                }
                if (line.includes('}')) inRoot = false;
            }
        }
    }

    for (const cssFile of cssFiles) {
        const cssContent = readFileSafe(cssFile);
        if (!cssContent) continue;

        for (const [varName, data] of compoundVarsInRoot.entries()) {
            const usageRegex = new RegExp(`var\\(--${varName.replace('-', '\\-')}\\)`, 'g');
            let match;
            while ((match = usageRegex.exec(cssContent)) !== null) {
                const lineNum = cssContent.substring(0, match.index).split('\n').length;
                violations.compoundVars.push({
                    varName: `--${varName}`,
                    targetVar: data.targetVar,
                    line: lineNum,
                    file: relPath,
                    definition: data
                });
            }
        }
    }

    for (const [varName, data] of compoundVarsInRoot.entries()) {
        violations.compoundVars.push({
            varName: `--${varName}`,
            targetVar: data.targetVar,
            line: data.line,
            file: data.file,
            content: data.content,
            isDefinition: true
        });
    }

    const hasErrors = violations.duplicateClasses.length > 0 ||
        violations.identicalClasses.length > 0 ||
        violations.duplicateVars.length > 0 ||
        violations.unusedClasses.length > 0 ||
        violations.nestedRules.length > 0 ||
        violations.hardcodedValues.length > 0 ||
        violations.compoundVars.length > 0 ||
        violations.inlineStyles.length > 0;

    return {
        passed: !hasErrors,
        violations,
        stats
    };
}

module.exports = { validate };
