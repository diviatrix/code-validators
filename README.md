# Validator Scripts

This directory contains validation scripts for the project.

## Validators

### check-lines.js
Checks that code blocks (functions, const/let/var declarations) do not exceed 15 lines.
```bash
cd database/server && node ../../validator/check-lines.js
```

### check-classes.js
Checks that classes in code files (.cs, .ts, .go, .java, .cpp, .c, .hpp, .h) do not exceed 250 lines.
```bash
node validator/check-classes.js [directory]
```

### check-css.js
Checks CSS files for issues.
```bash
node validator/check-css.js [directory]
```

## Run All Validators

```bash
node validator/runall.js [directory]
```

## Exit Codes
- `0` - All checks passed
- `1` - One or more violations found
