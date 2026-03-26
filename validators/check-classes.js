/**
 * Validates that classes do not exceed the maximum allowed lines.
 * @param {Array<{path: string, relativePath: string, content: string, ext: string}>} codeFiles - Loaded code files
 * @param {number} maxClassLines - Maximum allowed lines per class
 * @returns {{passed: boolean, violations: Array, stats: Object}}
 */
function validate(codeFiles, maxClassLines) {
    const violations = [];
    const stats = {
        filesChecked: codeFiles.length,
        classesFound: 0,
        classesExceedingLimit: 0
    };

    function checkFile(file) {
        const content = file.content;
        const ext = file.ext;

        let braceDepth = 0;
        let classStart = 0;
        let classLines = 0;
        let inClass = false;
        let currentClassName = '';

        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            let isClassStart = false;
            let className = '';

            if (ext === '.cs') {
                const match = trimmed.match(/^(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|abstract\s+|sealed\s+|partial\s+)*(?:class|interface|struct)\s+(\w+)/);
                if (match) {
                    isClassStart = true;
                    className = match[1];
                }
            } else if (ext === '.ts') {
                const match = trimmed.match(/^(?:export\s+|default\s+|abstract\s+)*(?:class|interface)\s+(\w+)/);
                if (match) {
                    isClassStart = true;
                    className = match[1];
                }
            } else if (ext === '.go') {
                const match = trimmed.match(/^type\s+(\w+)\s+struct/);
                if (match) {
                    isClassStart = true;
                    className = match[1];
                }
            } else if (ext === '.java') {
                const match = trimmed.match(/^(?:public\s+|private\s+|protected\s+|static\s+|final\s+)*(?:class|interface|enum)\s+(\w+)/);
                if (match) {
                    isClassStart = true;
                    className = match[1];
                }
            } else if (['.cpp', '.cc', '.cxx', '.c', '.hpp', '.h'].includes(ext)) {
                const match = trimmed.match(/^(?:class|struct)\s+(\w+)/);
                if (match) {
                    isClassStart = true;
                    className = match[1];
                }
            }

            for (const c of line) {
                if (c === '{') {
                    braceDepth++;
                    if (isClassStart && braceDepth === 1) {
                        inClass = true;
                        currentClassName = className;
                        classStart = i + 1;
                        classLines = 1;
                        stats.classesFound++;
                    }
                }
                if (c === '}') {
                    if (inClass && braceDepth === 1) {
                        if (classLines > maxClassLines) {
                            violations.push({
                                file: file.relativePath,
                                class: currentClassName,
                                start: classStart,
                                lines: classLines
                            });
                            stats.classesExceedingLimit++;
                        }
                        inClass = false;
                        classLines = 0;
                        currentClassName = '';
                    }
                    braceDepth--;
                }
            }

            if (inClass) {
                classLines++;
            }
        }
    }

    for (const file of codeFiles) {
        checkFile(file);
    }

    return {
        passed: violations.length === 0,
        violations,
        stats
    };
}

module.exports = { validate };
