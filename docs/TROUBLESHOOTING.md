# Troubleshooting Guide

## Red Lines in VS Code (TypeScript Errors)

If you're seeing red lines/squiggles in VS Code but tests pass, try these fixes:

### Fix 1: Reload TypeScript Server
1. Open VS Code Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
2. Type "TypeScript: Restart TS Server"
3. Press Enter

### Fix 2: Reload VS Code Window
1. Open Command Palette
2. Type "Developer: Reload Window"
3. Press Enter

### Fix 3: Clear TypeScript Cache
```bash
# Close VS Code first
cd d:/Leash-main/Leash-main
rm -rf node_modules/.cache
npm run typecheck
```

Then reopen VS Code.

### Fix 4: Verify TypeScript Version
VS Code should use the workspace TypeScript (5.9.3):

1. Open any .ts file
2. Look at bottom right corner - should show "TypeScript 5.9.3"
3. Click it if it shows different version
4. Select "Use Workspace Version"

### Fix 5: Check Node Version
This project requires Node.js v22.18+:

```bash
node --version  # Should be v22.18 or higher
```

If lower, upgrade Node.js.

## Common Issues

### "Cannot find module" errors
**Cause:** TypeScript config mismatch  
**Fix:** Run `npm run typecheck` - if it passes, reload TS server (Fix 1)

### Import path red lines
**Cause:** VS Code using wrong module resolution  
**Fix:** Ensure tsconfig.json has `"moduleResolution": "NodeNext"`

### Test file errors
**Cause:** Wrong tsconfig  
**Fix:** Check tests/tsconfig.json exists and extends root config

## Verification

Run these commands - all should pass:

```bash
npm run typecheck  # Should complete with no errors
npm test          # Should show 353/353 passing
npm run web:build # Should build successfully
```

If all pass, any red lines are just VS Code display issues, not real errors.

## VS Code Settings

The project includes `.vscode/settings.json` (local only, not in git):

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "editor.codeActionsOnSave": {
    "source.fixAll": "explicit"
  }
}
```

This ensures VS Code uses the project's TypeScript version.

## Still Having Issues?

1. Check you're in the right directory: `d:/Leash-main/Leash-main`
2. Dependencies installed: `npm install`
3. No pending git changes: `git status`
4. Tests actually pass: `npm test`

If tests pass but VS Code shows errors, it's a display issue - the code is correct.
