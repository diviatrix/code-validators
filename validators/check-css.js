function extractRootVars(cssFiles) {
    const rootVars = new Map();
    for (const file of cssFiles) {
        let inRoot = false;
        file.content.split('\n').forEach((line, i) => {
            if (line.includes(':root')) inRoot = true;
            if (inRoot) {
                const m = line.match(/--([a-zA-Z0-9_-]+)\s*:\s*(.+?)\s*;/);
                if (m && !m[2].trim().startsWith('var(')) {
                    if (!rootVars.has(m[2].trim())) rootVars.set(m[2].trim(), []);
                    rootVars.get(m[2].trim()).push({ name: m[1], line: i + 1, file: file.relativePath, content: line.trim() });
                }
                if (line.includes('}')) inRoot = false;
            }
        });
    }
    return rootVars;
}

function extractClassDefs(cssFiles) {
    const defs = new Map();
    for (const file of cssFiles) {
        let current = null, content = [], inClass = false;
        file.content.split('\n').forEach((line, i) => {
            const m = line.match(/^\s*\.([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/);
            if (m) {
                if (inClass && current) { const e = defs.get(current); if (e) e.content = content.join('\n').trim(); }
                current = m[1]; content = [line]; inClass = true;
                if (!defs.has(current)) defs.set(current, { lines: [], content: '', hasDup: false, file: file.relativePath });
                defs.get(current).lines.push(i + 1);
                defs.get(current).file = file.relativePath;
                if (defs.get(current).lines.length > 1) defs.get(current).hasDup = true;
                if (line.includes('}')) { defs.get(current).content = content.join('\n').trim(); inClass = false; current = null; }
                return;
            }
            if (inClass) {
                content.push(line);
                if (line.includes('}')) { defs.get(current).content = content.join('\n').trim(); inClass = false; current = null; }
            }
        });
    }
    return defs;
}

function findIdenticalClasses(classDefs) {
    const map = new Map();
    for (const [cls, data] of classDefs.entries()) {
        const c = data.content.replace(/\s+/g, ' ').trim();
        if (c && !c.startsWith('.')) {
            if (!map.has(c)) map.set(c, []);
            map.get(c).push(cls);
        }
    }
    return [...map.entries()].filter(([, v]) => v.length > 1).map(([c, cls]) => ({ content: c, classes: cls }));
}

function findDuplicateClasses(classDefs) {
    return [...classDefs.entries()].filter(([, d]) => d.hasDup).map(([cls, d]) => ({
        class: cls, definitionCount: d.lines.length, file: d.file, lines: d.lines
    }));
}

function addClassesFromMatch(content, used) {
    content.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach(c => { if (c.trim()) used.add(c); });
}

function findClassesUsed(codeFiles) {
    const used = new Set();
    for (const file of codeFiles) {
        const c = file.content;
        for (const m of c.matchAll(/class="([^"]*)"/g)) addClassesFromMatch(m[1], used);
        for (const m of c.matchAll(/class='([^']*)'/g)) addClassesFromMatch(m[1], used);
        for (const m of c.matchAll(/(?:querySelector|querySelectorAll)\(['"]\.([a-zA-Z_-][a-zA-Z0-9_-]*)['"]\)/g)) used.add(m[1]);
        for (const m of c.matchAll(/classList\.(?:add|remove|toggle)\(['"]([a-zA-Z_-][a-zA-Z0-9_-]*)['"]\)/g)) used.add(m[1]);
        for (const m of c.matchAll(/(?:createEl|createElement|_el|_c|h)\s*\(\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]/g)) {
            m[1].split(/\s+/).forEach(c => { if (c.trim()) used.add(c); });
        }
    }
    return used;
}

function findUnusedClasses(classDefs, used) {
    return [...classDefs.entries()].filter(([cls, d]) => !used.has(cls) && !cls.startsWith('-') && cls !== 'root')
        .map(([cls, d]) => ({ class: cls, line: d.lines[0], file: d.file, content: d.content.split('\n')[0] }));
}

function checkInlineStyles(codeFiles) {
    const violations = [];
    for (const file of codeFiles) {
        const c = file.content;
        for (const m of c.matchAll(/style=["'][^"']*["']/g)) {
            violations.push({ file: file.relativePath, line: c.substring(0, m.index).split('\n').length, content: m[0] });
        }
    }
    return violations;
}

function parseCssStructure(lines) {
    const result = [];
    let inRoot = false, currentClass = null, depth = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(':root')) { inRoot = true; continue; }
        if (inRoot && line.includes('}')) { inRoot = false; continue; }
        if (inRoot) continue;
        const m = line.match(/^\s*\.([a-zA-Z_-][a-zA-Z0-9_-]*)/);
        if (m && line.includes('{')) { currentClass = m[1]; depth = 1; if (line.includes('}')) { depth = 0; currentClass = null; } }
        else {
            for (const c of line) { if (c === '{') depth++; if (c === '}') depth--; }
            if (depth <= 0) currentClass = null;
        }
        result.push({ line, i, currentClass, depth });
    }
    return result;
}

function checkNestedRules(cssFiles) {
    const violations = [];
    for (const file of cssFiles) {
        parseCssStructure(file.content.split('\n')).forEach(({ line, i, currentClass, depth }) => {
            if (currentClass && depth > 0) {
                const m = line.match(/^\s*\.([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/);
                if (m && m[1] !== currentClass) {
                    violations.push({ parentClass: currentClass, nestedClass: m[1], line: i + 1, file: file.relativePath, content: line.trim() });
                }
            }
        });
    }
    return violations;
}

function checkHardcodedValues(cssFiles) {
    const violations = [];
    for (const file of cssFiles) {
        parseCssStructure(file.content.split('\n')).forEach(({ line, i, currentClass }) => {
            if (line.trim().startsWith('/*') || line.trim() === '{' || line.trim() === '}') return;
            const cls = currentClass || 'unknown', rel = file.relativePath, ln = i + 1, trim = line.trim();
            if (line.includes('border')) {
                const m = line.match(/border(?:-left|-right|-top|-bottom)?\s*:\s*([^;]+)/);
                if (m && /#(?:[0-9a-fA-F]{3,6}|rgba?|hsla?)\(/i.test(m[1].trim())) {
                    violations.push({ class: cls, line: ln, file: rel, value: m[1].trim(), type: 'border', content: trim });
                    return;
                }
            }
            if (line.includes('var(--')) return;
            const hex = line.match(/#[0-9a-fA-F]{3,6}\b/);
            if (hex) { violations.push({ class: cls, line: ln, file: rel, value: hex[0], type: 'hex-color', content: trim }); return; }
            for (const m of line.matchAll(/\b(\d+\.?\d*)(rem|pt|px)\b/g)) {
                if (!['1pt', '2pt', '4pt'].includes(m[0])) violations.push({ class: cls, line: ln, file: rel, value: m[0], type: 'size', content: trim });
            }
            const color = line.match(/(rgba|hsla|rgb|hsl)\s*\([^)]+\)/i);
            if (color) violations.push({ class: cls, line: ln, file: rel, value: color[0], type: 'color-function', content: trim });
            for (const prop of line.split(';')) {
                const m = prop.match(/^[\s]*([a-z-]+)[\s]*:[\s]*(.+)$/i);
                if (m && m[2].trim() && !m[2].trim().startsWith('var(')) {
                    violations.push({ class: cls, line: ln, file: rel, value: m[2].trim(), type: 'hardcoded-value', content: trim });
                    break;
                }
            }
        });
    }
    return violations;
}

function validate(cssFiles, codeFiles) {
    const violations = { duplicateClasses: [], identicalClasses: [], duplicateVars: [], unusedClasses: [], nestedRules: [], hardcodedValues: [], compoundVars: [], inlineStyles: [] };
    const stats = { cssFilesScanned: cssFiles.length, codeFilesScanned: codeFiles.length, classesDefined: 0, classesUsed: 0, rootVarsCount: 0 };
    if (cssFiles.length === 0) return { passed: true, violations, stats };
    const rootVars = extractRootVars(cssFiles);
    stats.rootVarsCount = rootVars.size;
    for (const [value, items] of rootVars.entries()) { if (items.length > 1) violations.duplicateVars.push({ value, items }); }
    const classDefs = extractClassDefs(cssFiles);
    stats.classesDefined = classDefs.size;
    violations.identicalClasses = findIdenticalClasses(classDefs);
    violations.duplicateClasses = findDuplicateClasses(classDefs);
    const classesUsed = findClassesUsed(codeFiles);
    stats.classesUsed = classesUsed.size;
    violations.unusedClasses = findUnusedClasses(classDefs, classesUsed);
    violations.inlineStyles = checkInlineStyles(codeFiles);
    violations.nestedRules = checkNestedRules(cssFiles);
    violations.hardcodedValues = checkHardcodedValues(cssFiles);
    return { passed: !Object.values(violations).some(v => v.length > 0), violations, stats };
}

module.exports = { validate };
