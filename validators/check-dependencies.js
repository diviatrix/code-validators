const fs = require('fs');
const path = require('path');

/**
 * Validates dependencies in package.json files.
 * @param {Array<{path: string, relativePath: string, content: string, ext: string}>} packageJsonFiles - Loaded package.json files
 * @returns {{passed: boolean, violations: Array, stats: Object}}
 */
function validate(packageJsonFiles) {
    const violations = [];
    const stats = {
        packageJsonFilesChecked: packageJsonFiles.length,
        totalDependencies: 0,
        totalDevDependencies: 0
    };

    if (packageJsonFiles.length === 0) {
        return {
            passed: true,
            violations: [],
            stats
        };
    }

    for (const file of packageJsonFiles) {
        const projectDir = path.dirname(file.path);
        const nodeModulesDir = path.join(projectDir, 'node_modules');

        let packageJson;
        try {
            packageJson = JSON.parse(file.content);
        } catch (err) {
            violations.push({
                file: file.relativePath,
                errors: [`Invalid JSON: ${err.message}`]
            });
            continue;
        }

        const dependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies
        };

        const errors = [];

        stats.totalDependencies += Object.keys(packageJson.dependencies || {}).length;
        stats.totalDevDependencies += Object.keys(packageJson.devDependencies || {}).length;

        if (!fs.existsSync(nodeModulesDir)) {
            errors.push('node_modules directory does not exist. Run "npm install"');
        } else {
            for (const [name, version] of Object.entries(dependencies)) {
                const modulePath = path.join(nodeModulesDir, name);
                if (!fs.existsSync(modulePath)) {
                    errors.push(`Missing dependency: ${name}@${version}`);
                }
            }

            const installedModules = fs.readdirSync(nodeModulesDir)
                .filter(name => {
                    const modulePath = path.join(nodeModulesDir, name);
                    return fs.statSync(modulePath).isDirectory() && !name.startsWith('.');
                });

            const declaredDeps = new Set(Object.keys(dependencies));
            for (const module of installedModules) {
                if (module.startsWith('@') || module === '.bin') continue;

                if (!declaredDeps.has(module)) {
                    const modulePackagePath = path.join(nodeModulesDir, module, 'package.json');
                    if (fs.existsSync(modulePackagePath)) {
                        const modulePackageContent = fs.readFileSync(modulePackagePath, 'utf8');
                        const modulePackage = JSON.parse(modulePackageContent);
                        if (modulePackage && !modulePackage._requiredBy) {
                            errors.push(`Potentially unused dependency: ${module}`);
                        }
                    }
                }
            }
        }

        const deps = Object.keys(packageJson.dependencies || {});
        const devDeps = Object.keys(packageJson.devDependencies || {});
        const duplicates = deps.filter(d => devDeps.includes(d));
        if (duplicates.length > 0) {
            errors.push(`Duplicate dependencies: ${duplicates.join(', ')}`);
        }

        for (const [name, version] of Object.entries(dependencies)) {
            if (!version || version === '' || version === '*' || version === 'latest') {
                errors.push(`Missing version constraint for: ${name}`);
            }
        }

        if (errors.length > 0) {
            violations.push({
                file: file.relativePath,
                errors
            });
        }
    }

    return {
        passed: violations.length === 0,
        violations,
        stats
    };
}

module.exports = { validate };
