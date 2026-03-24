const fs = require('fs');
const path = require('path');
const { walkCodeFiles, walkDir, readFileSafe, getRelativePath } = require('../utility/file-utils');

function validate(targetDir, maxLines, excludeDirs, excludeFiles, htmlTags, codeExtensions, maxValueLines, maxMethodLines) {
    const violations = {
        htmlInCode: [],
        codeFilesExceedingLimit: [],
        htmlFilesExceedingLimit: [],
        longVariables: [],
        longMethods: []
    };

    const stats = {
        codeFilesChecked: 0,
        htmlFilesChecked: 0,
        variablesFound: 0,
        variablesExceedingLimit: 0,
        methodsFound: 0,
        methodsExceedingLimit: 0
    };

    function findHtmlInCode(file) {
        const code = readFileSafe(file);
        if (!code) return [];

        const issues = [];
        const lines = code.split('\n');
        const lineGroups = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;

            for (const tag of htmlTags) {
                if (line.toLowerCase().includes('<' + tag)) {
                    if (!lineGroups[i + 1]) {
                        lineGroups[i + 1] = [];
                    }
                    const tagName = '<' + tag + '>';
                    if (!lineGroups[i + 1].includes(tagName)) {
                        lineGroups[i + 1].push(tagName);
                    }
                }
            }
        }

        for (const [line, tags] of Object.entries(lineGroups)) {
            issues.push({ line: parseInt(line), tags });
        }

        return issues;
    }

    function isComment(trimmed) {
        return trimmed.startsWith('//') || trimmed.startsWith('#') ||
            trimmed.startsWith('*') || trimmed.startsWith('/*');
    }

    function isVarDeclaration(trimmed, parenDepth) {
        if (parenDepth !== 0) return null;
        const m = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*/);
        if (!m) return null;
        const after = trimmed.substring(trimmed.indexOf('=') + 1).trim();
        if (after.startsWith('{') || after.startsWith('[') || after.startsWith('(')) {
            return { name: m[1] };
        }
        return null;
    }

    function isFunctionDecl(trimmed) {
        const m = trimmed.match(/^function\s+(\w+)\s*\(/);
        return m ? { name: m[1] } : null;
    }

    function isArrowFunc(trimmed) {
        const m = trimmed.match(/^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
        return m ? { name: m[1] } : null;
    }

    function isClassDecl(trimmed, braceDepth) {
        if (braceDepth !== 0) return null;
        const m = trimmed.match(/^(?:export\s+|default\s+|public\s+|private\s+|protected\s+|static\s+)*(?:class|interface)\s+(\w+)/);
        return m ? { name: m[1] } : null;
    }

    function isPyFunc(trimmed) {
        const m = trimmed.match(/^def\s+(\w+)\s*\(/);
        return m ? { name: m[1] } : null;
    }

    function checkVarsAndMethods(file) {
        const code = readFileSafe(file);
        if (!code) return;

        const lines = code.split('\n');
        const ext = path.extname(file);
        const relPath = getRelativePath(targetDir, file);
        const isJsLike = ['.js', '.ts', '.jsx', '.tsx'].includes(ext);
        const isPython = ext === '.py';

        let braceDepth = 0;
        let parenDepth = 0;
        let currentScope = 'root';
        let scopeStack = ['root'];

        let varStartLine = -1;
        let varName = '';
        let inVar = false;
        let varBodyDepth = -1;

        // Стек методов: {name, startLine, scope, bodyDepth}
        // bodyDepth = уровень вложенности { тела функции
        let methodStack = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (isComment(trimmed)) continue;

            if (isJsLike || isPython) {
                // Детектим функции
                const cls = isClassDecl(trimmed, braceDepth);
                if (cls) {
                    currentScope = cls.name;
                    scopeStack.push(currentScope);
                }

                const fn = isFunctionDecl(trimmed);
                if (fn) {
                    methodStack.push({
                        name: fn.name,
                        startLine: i,
                        scope: currentScope,
                        bodyDepth: -1
                    });
                    stats.methodsFound++;
                }

                const af = isArrowFunc(trimmed);
                if (af) {
                    methodStack.push({
                        name: af.name,
                        startLine: i,
                        scope: currentScope,
                        bodyDepth: -1
                    });
                    stats.methodsFound++;
                }

                const vr = isVarDeclaration(trimmed, parenDepth);
                if (vr && !inVar) {
                    inVar = true;
                    varName = vr.name;
                    varStartLine = i;
                    varBodyDepth = -1;
                    stats.variablesFound++;
                }

                if (isPython) {
                    const pf = isPyFunc(trimmed);
                    if (pf) {
                        methodStack.push({
                            name: pf.name,
                            startLine: i,
                            scope: currentScope,
                            bodyDepth: 0
                        });
                        stats.methodsFound++;
                    }
                }

                // Подсчет скобок (игнорируем внутри строк и комментариев)
                let inString = null;
                for (let j = 0; j < line.length; j++) {
                    const ch = line[j];
                    const prev = j > 0 ? line[j-1] : '';

                    // Отслеживаем строки
                    if (!inString && (ch === '"' || ch === "'" || ch === '`')) {
                        inString = ch;
                        continue;
                    }
                    if (inString && ch === inString && prev !== '\\') {
                        inString = null;
                        continue;
                    }
                    if (inString) continue;

                    if (ch === '(') parenDepth++;
                    else if (ch === ')') parenDepth--;
                    else if (ch === '{') {
                        braceDepth++;
                        // Первая { для метода - это его тело
                        if (methodStack.length > 0) {
                            const top = methodStack[methodStack.length - 1];
                            if (top.bodyDepth === -1) {
                                top.bodyDepth = braceDepth;
                            }
                        }
                        if (inVar && varBodyDepth === -1) varBodyDepth = braceDepth;
                    } else if (ch === '}') {
                        // Закрываем методы у которых bodyDepth == текущей глубине
                        for (let m = methodStack.length - 1; m >= 0; m--) {
                            if (methodStack[m].bodyDepth === braceDepth) {
                                const method = methodStack[m];
                                methodStack.splice(m, 1);
                                const cnt = i - method.startLine + 1;
                                if (cnt > maxMethodLines) {
                                    violations.longMethods.push({ file: relPath, name: method.name, start: method.startLine + 1, lines: cnt, scope: method.scope });
                                    stats.methodsExceedingLimit++;
                                }
                                break;
                            }
                        }

                        if (inVar && varBodyDepth === braceDepth) {
                            const cnt = i - varStartLine + 1;
                            if (cnt > maxValueLines) {
                                violations.longVariables.push({ file: relPath, name: varName, start: varStartLine + 1, lines: cnt, scope: currentScope });
                                stats.variablesExceedingLimit++;
                            }
                            inVar = false;
                            varBodyDepth = -1;
                            varName = '';
                        }
                        braceDepth--;
                        if (scopeStack.length > 1) {
                            scopeStack.pop();
                            currentScope = scopeStack[scopeStack.length - 1];
                        }
                    }
                }
            }
        }

        // Незакрытые методы в конце файла
        for (const method of methodStack) {
            const cnt = lines.length - method.startLine;
            if (cnt > maxMethodLines) {
                violations.longMethods.push({ file: relPath, name: method.name, start: method.startLine + 1, lines: cnt, scope: method.scope });
                stats.methodsExceedingLimit++;
            }
        }

        if (inVar) {
            const cnt = lines.length - varStartLine;
            if (cnt > maxValueLines) {
                violations.longVariables.push({ file: relPath, name: varName, start: varStartLine + 1, lines: cnt, scope: currentScope });
                stats.variablesExceedingLimit++;
            }
        }
    }

    const codeFiles = walkCodeFiles(targetDir, codeExtensions, excludeDirs, excludeFiles);
    const htmlFiles = walkDir(targetDir, '.html', excludeDirs, excludeFiles);

    stats.codeFilesChecked = codeFiles.length;
    stats.htmlFilesChecked = htmlFiles.length;

    for (const file of codeFiles) {
        const code = readFileSafe(file);
        if (!code) continue;

        const lines = code.split('\n').length;
        const relPath = getRelativePath(targetDir, file);

        if (lines > maxLines) {
            violations.codeFilesExceedingLimit.push({ file: relPath, lines });
        }

        const htmlIssues = findHtmlInCode(file);
        if (htmlIssues.length > 0) {
            violations.htmlInCode.push({ file: relPath, issues: htmlIssues });
        }

        if (maxValueLines && maxMethodLines) {
            checkVarsAndMethods(file);
        }
    }

    for (const file of htmlFiles) {
        const code = readFileSafe(file);
        if (!code) continue;

        const lines = code.split('\n').length;
        if (lines > maxLines) {
            violations.htmlFilesExceedingLimit.push({ file: getRelativePath(targetDir, file), lines });
        }
    }

    const hasErrors = violations.htmlInCode.length > 0 ||
        violations.codeFilesExceedingLimit.length > 0 ||
        violations.htmlFilesExceedingLimit.length > 0 ||
        violations.longVariables.length > 0 ||
        violations.longMethods.length > 0;

    return {
        passed: !hasErrors,
        violations,
        stats
    };
}

module.exports = { validate };
