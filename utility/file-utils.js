const fs = require('fs');
const path = require('path');

/**
 * Scans directory recursively for files and folders.
 * @param {string} dir - Directory to scan
 * @param {string[]} ignoreFolders - Folders to ignore
 * @returns {{cssFiles: string[], codeFiles: string[], allFiles: string[]}}
 */
function scanDirectory(dir, ignoreFolders = []) {
    const result = {
        cssFiles: [],
        codeFiles: [],
        allFiles: [],
        packageJsonFiles: [],
        htmlFiles: []
    };

    function scan(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!ignoreFolders.includes(entry.name)) {
                    scan(fullPath);
                }
            } else if (entry.isFile()) {
                result.allFiles.push(fullPath);
                if (entry.name.endsWith('.css')) {
                    result.cssFiles.push(fullPath);
                } else if (/\.(js|html|ejs|jsx|ts|tsx)$/.test(entry.name)) {
                    result.codeFiles.push(fullPath);
                } else if (entry.name === 'package.json') {
                    result.packageJsonFiles.push(fullPath);
                } else if (entry.name.endsWith('.html')) {
                    result.htmlFiles.push(fullPath);
                }
            }
        }
    }

    scan(dir);
    return result;
}

/**
 * Walks directory recursively for files with specific extension.
 * @param {string} dir - Directory to walk
 * @param {string} ext - File extension to filter
 * @param {string[]} excludeDirs - Directories to exclude
 * @param {string[]} excludeFiles - Files to exclude
 * @returns {string[]}
 */
function walkDir(dir, ext, excludeDirs = [], excludeFiles = []) {
    const files = [];

    if (!fs.existsSync(dir)) return files;

    function shouldExclude(filePath) {
        for (const d of excludeDirs) {
            if (filePath.includes(path.sep + d + path.sep) || filePath.endsWith(path.sep + d)) {
                return true;
            }
        }
        for (const f of excludeFiles) {
            if (filePath.endsWith(f)) {
                return true;
            }
        }
        return false;
    }

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!excludeDirs.includes(entry.name)) {
                    walk(fullPath);
                }
            } else if (entry.isFile() && entry.name.endsWith(ext)) {
                if (!shouldExclude(fullPath)) {
                    files.push(fullPath);
                }
            }
        }
    }

    walk(dir);
    return files;
}

/**
 * Walks directory for code files with multiple extensions.
 * @param {string} dir - Directory to walk
 * @param {string[]} extensions - File extensions to include
 * @param {string[]} excludeDirs - Directories to exclude
 * @param {string[]} excludeFiles - Files to exclude
 * @returns {string[]}
 */
function walkCodeFiles(dir, extensions, excludeDirs = [], excludeFiles = []) {
    const files = [];
    for (const ext of extensions) {
        files.push(...walkDir(dir, ext, excludeDirs, excludeFiles));
    }
    return files;
}

/**
 * Reads file content safely.
 * @param {string} filePath - File path to read
 * @returns {string|null}
 */
function readFileSafe(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        return null;
    }
}

/**
 * Reads JSON file safely.
 * @param {string} filePath - File path to read
 * @returns {Object|null}
 */
function readJsonFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        return null;
    }
}

/**
 * Gets relative path from target directory.
 * @param {string} targetDir - Target directory
 * @param {string} filePath - File path
 * @returns {string}
 */
function getRelativePath(targetDir, filePath) {
    return path.relative(targetDir, filePath);
}

/**
 * Checks if target path exists.
 * @param {string} targetPath - Path to check
 * @returns {boolean}
 */
function pathExists(targetPath) {
    return fs.existsSync(targetPath);
}

module.exports = {
    scanDirectory,
    walkDir,
    walkCodeFiles,
    readFileSafe,
    readJsonFile,
    getRelativePath,
    pathExists
};
