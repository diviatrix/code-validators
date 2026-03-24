# Code Validators

This project is born as anti-shit-code gate for LLMs.
These scripts basically just algoritmically parse code and list all misalignments

You can run it yourself, you can ask your Coding Agent do that.
Slightly configurable via @config.json

Basically it is Eslint younger brother, which works with ts, js, c#, go, python, etc.
Does simple checks:
- **Lines**: Files and code blocks (functions, variables) should not exceed configurable line limits
- **Classes**: Classes should not exceed 250 lines
- **CSS**: Duplicate/identical classes, unused classes, nested rules, hardcoded values, inline styles
- **Dependencies**: Missing, duplicate, or unused dependencies in package.json

## Run Example
```bash
🔍 Running all validators...

Target: E:\GitRepos\code-validators

==================================================
❌ Some validators failed!

Validator Results:
--------------------------------------------------
❌ check-lines (9ms) - 10 violation(s)

  Code files exceeding line limit (2):
    validators\check-css.js: 444 lines
    validators\check-lines.js: 308 lines

  longVariables (1):
    validators\check-css.js: {"file":"validators\\check-css.js","name":"classContent","start":87,"lines":48,"scope":"root"}

  longMethods (7):
    validators\check-classes.js: {"file":"validators\\check-classes.js","name":"checkFile","start":19,"lines":87,"scope":"root"}
    validators\check-classes.js: {"file":"validators\\check-classes.js","name":"validate","start":11,"lines":109,"scope":"root"}
    validators\check-css.js: {"file":"validators\\check-css.js","name":"validate","start":11,"lines":204,"scope":"root"}
    validators\check-dependencies.js: {"file":"validators\\check-dependencies.js","name":"validate","start":11,"lines":98,"scope":"root"}        
    validators\check-lines.js: {"file":"validators\\check-lines.js","name":"findHtmlInCode","start":23,"lines":32,"scope":"root"}
    validators\check-lines.js: {"file":"validators\\check-lines.js","name":"checkVarsAndMethods","start":93,"lines":145,"scope":"root"}
    validators\check-lines.js: {"file":"validators\\check-lines.js","name":"validate","start":5,"lines":251,"scope":"root"}
✅ check-classes (17ms)
✅ check-css (0ms)
```

# Quickstart

## Run All Validators
```bash
node validator/runall.js [directory]
```

## Validators

### check-lines.js
Checks that code blocks do not exceed configurable line limits:
- Files exceeding maximum lines (default: 15 lines for code blocks)
- HTML tags embedded in code files
- Variable declarations exceeding maximum lines
- Function/method declarations exceeding maximum lines
```bash
cd database/server && node ../../validator/check-lines.js
```

### check-classes.js
Checks that classes in code files (.cs, .ts, .go, .java, .cpp, .c, .hpp, .h) do not exceed 250 lines.
```bash
node validator/check-classes.js [directory]
```

### check-css.js
Checks CSS files for issues:
- Duplicate class definitions (same class defined multiple times)
- Identical classes (different names with same content)
- Duplicate CSS variables (same value, different names in :root)
- Unused classes (defined in CSS but not used in code)
- Nested class rules
- Hardcoded values (colors, sizes instead of CSS variables)
- Compound CSS variables (variables that just reference other variables)
- Inline styles in HTML/JS
```bash
node validator/check-css.js [directory]
```

### check-dependencies.js
Validates package.json dependencies:
- Missing dependencies (declared but not in node_modules)
- Unused dependencies (in node_modules but not declared)
- Duplicate dependencies (in both dependencies and devDependencies)
- Missing version constraints
```bash
node validator/check-dependencies.js [directory]
```


## Exit Codes
- `0` - All checks passed
- `1` - One or more violations found

## Configuration

Configure via `config.json`:

```json
{
    "TARGET_PATH": ".",
    "SAVE_REPORT": true,
    "REPORT_FILE": "data/code-quality-report.json",
    "IGNORE_FOLDERS": ["node_modules", ".git", "tasks", "utility", "data"],
    "EXCLUDE_DIRS": ["node_modules", "public", "dist", "build"],
    "EXCLUDE_FILES": ["runall.js", "eslint.config.js"],
    "HTML_TAGS": ["html", "head", "body", "div", "span", "p", "img"],
    "CODE_EXTENSIONS": [".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".cs", ".go"],
    "MAX_LINES": 300,
    "MAX_CLASS_LINES": 250,
    "MAX_VALUE_LINES": 15,
    "MAX_METHOD_LINES": 25,
    "VALIDATORS": {
        "check-lines": true,
        "check-classes": true,
        "check-css": true,
        "check-dependencies": false
    }
}
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `TARGET_PATH` | Directory to validate | `.` |
| `SAVE_REPORT` | Save validation report to file | `true` |
| `REPORT_FILE` | Path to save the report | `data/code-quality-report.json` |
| `IGNORE_FOLDERS` | Folders to skip during scanning | `["node_modules", ".git", ...]` |
| `EXCLUDE_DIRS` | Directories excluded from validation | `["node_modules", "dist", ...]` |
| `EXCLUDE_FILES` | Files excluded from validation | `["runall.js", ...]` |
| `HTML_TAGS` | HTML tags to detect in code files | Common HTML tags |
| `CODE_EXTENSIONS` | File extensions to validate | `[".js", ".ts", ".py", ...]` |
| `MAX_LINES` | Maximum lines for code blocks | `300` |
| `MAX_CLASS_LINES` | Maximum lines per class (also used for root-level methods) | `250` |
| `MAX_VALUE_LINES` | Maximum lines for variable declarations | `15` |
| `MAX_METHOD_LINES` | Maximum lines for nested functions/methods | `25` |
| `VALIDATORS` | Enable/disable individual validators | All `true` except `check-dependencies` |
