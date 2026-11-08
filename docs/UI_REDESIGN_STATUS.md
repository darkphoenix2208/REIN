# UI Redesign Status

**Last Updated:** 2026-11-08  
**Status:** IN PROGRESS

---

## ✅ Foundation Complete

### Design System (`web/design-tokens.css`)
✅ **Color palette** defined with CSS variables:
- Primary: `--navy` (#003087), `--blue` (#0070E0), `--blue-light` (#009CDE), `--gold` (#FFC439)
- Neutrals: `--background` (#F5F7FA), `--border` (#D9DEE7), `--text` (#0C1424), `--muted` (#5E6C84)
- Semantic: `--success` (#1A7F4B), `--warning` (#B25E00), `--danger` (#C4261D)

✅ **Typography** system:
- Font family: Inter with fallbacks
- Sizes: `--font-size-sm` (14px), `--font-size-base` (16px), `--font-size-lg` (18px), `--font-size-xl` (24px)
- Tabular numerals for `.money` and `.numeric` classes

✅ **Spacing** scale:
- `--space-xs` (4px), `--space-sm` (8px), `--space-md` (16px), `--space-lg` (24px), `--space-xl` (32px)

✅ **Component** styles:
- Buttons: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger` with pill shape
- Chips: `.chip`, `.chip-simulated`, `.chip-live`, `.chip-allowed`, `.chip-blocked`, `.chip-pending`
- Cards: `.card` with shadow and border
- States: `.empty-state`, `.loading`, `.spinner`, `.error-state`

✅ **Accessibility**:
- WCAG AA focus rings (2px solid blue, 2px offset)
- Reduced motion support with `@media (prefers-reduced-motion: reduce)`
- Minimum 44×44px touch targets

✅ **Responsive** breakpoints:
- Mobile-first (360px minimum)
- Tablet: 768px
- Desktop: up to 1440px max-width

### Layout Component (`web/src/Layout.tsx`)
✅ **Created** with:
- Desktop: Fixed 240px sidebar with navigation links
- Mobile: Top header (60px) + bottom tabs (60px) for 5 primary pages
- Mode chip showing SIMULATED/LIVE status
- Smooth navigation with history API integration
- WCAG-compliant aria labels and keyboard navigation

### Main App (`web/src/main.tsx`)
✅ **Updated** to:
- Use new Layout component
- Auto-detect mode (SIMULATED/LIVE) from `/health` endpoint
- Remove old topbar navigation
- Pass current path to Layout for active state

### UI Utilities (`web/src/ui.tsx`)
✅ **Updated** Chip component to use design token classes

---

## 🚧 Pages In Progress

| Page | Design Tokens | Empty State | Loading State | Error State | Status |
|------|--------------|-------------|---------------|-------------|--------|
| Demo | ✅ Partial | ✅ | ✅ | ✅ | IN PROGRESS |
| Shop | ❌ | ❌ | ❌ | ⚠️ Has error banner | TODO |
| Challenge | ❌ | ❌ | ❌ | ❌ | TODO |
| AttackLab | ❌ | ❌ | ❌ | ❌ | TODO |
| Ledger | ❌ | ❌ | ⚠️ Has loading | ❌ | TODO |
| Ops | ❌ | ❌ | ❌ | ❌ | TODO |
| Verify | ❌ | ❌ | ❌ | ❌ | TODO |
| Mandate | ❌ | ❌ | ❌ | ❌ | TODO |
| Approve | ❌ | ❌ | ❌ | ❌ | TODO |
| Proof | ❌ | ❌ | ❌ | ❌ | TODO |
| Author | ❌ | ❌ | ❌ | ❌ | TODO |

### Demo Page (`web/src/Demo.tsx`)
✅ Design tokens applied inline (using `var(--token)`)  
✅ Empty state when no tickets loaded  
✅ Loading state with spinner  
✅ Error state with retry button  
✅ Buttons use `.btn .btn-primary` / `.btn .btn-secondary`  
✅ Chip component integration  
⚠️ **TODO:** Extract inline styles to CSS classes for cleaner code

---

## 📸 Visual Verification

### Screenshot Script (`scripts/screenshot-ui.ts`)
✅ **Created** with:
- 11 pages × 2 viewports (desktop 1440×900, mobile 390×844)
- Saves to `screenshots/` directory
- Auto-waits for network idle and animations

### To Run Screenshots:
```bash
npm run screenshot
```

**Requirements:**
- Server running on http://localhost:4317
- Playwright browsers installed (script auto-installs)

### Manual Checklist (After Screenshots):
- [ ] Color contrast WCAG AA (4.5:1 text, 3:1 UI components)
- [ ] Focus rings visible on all interactive elements
- [ ] Button/link hit targets ≥44×44px on mobile
- [ ] Text legible (min 16px base, 14px small text)
- [ ] No horizontal scroll on mobile (360px viewport)
- [ ] Layout consistency across pages
- [ ] Empty states visible and helpful
- [ ] Loading spinners centered and visible
- [ ] Error states clear with recovery actions

---

## 🎯 Remaining Work

### High Priority (Core User Flows)
1. **Shop page** - E-commerce interface with product grid
2. **Challenge page** - Interactive agent challenge
3. **Attack Lab page** - Security testing interface
4. **Ledger page** - AG Grid data table (complex)

### Medium Priority (Admin/Config)
5. **Ops page** - Operations dashboard
6. **Mandate page** - Policy configuration
7. **Verify page** - Checkpoint verification

### Lower Priority (Utility Pages)
8. **Approve page** - Approval interface
9. **Author page** - Policy authoring
10. **Proof page** - Cryptographic proof
11. **Remove AppShell.tsx** - Unused old layout component

### Polish & Verification
- Extract inline styles to CSS classes
- Add hover/active/disabled states consistently
- Test keyboard navigation on all pages
- Test screen reader announcements
- Capture & review all screenshots
- Update e2e tests for new UI selectors

---

## ⚡ Quick Start for Remaining Pages

Each page needs:

1. **Replace inline styles** with design tokens:
   ```tsx
   // Before
   style={{ padding: '16px', background: '#F5F7FA' }}
   
   // After
   style={{ padding: 'var(--space-md)', background: 'var(--background)' }}
   ```

2. **Use semantic button classes**:
   ```tsx
   // Before
   <button className="btn">Action</button>
   
   // After
   <button className="btn btn-primary">Action</button>
   ```

3. **Add empty/loading/error states**:
   ```tsx
   {loading && <div className="loading"><div className="spinner"></div></div>}
   {error && <div className="error-state">{error}</div>}
   {!data.length && <div className="empty-state">No data</div>}
   ```

4. **Use semantic chip classes**:
   ```tsx
   <span className="chip chip-simulated">SIMULATED</span>
   <span className="chip chip-allowed">ALLOWED</span>
   ```

---

## 🚀 Testing & Deployment

### TypeScript Check
```bash
npm run typecheck  # ✅ Currently passing
```

### Run Tests
```bash
npm test  # Should maintain 365/365 passing
```

### Build & Start
```bash
npm run demo  # Build web + start server
```

### Visual QA
```bash
npm run demo &  # Start server in background
npm run screenshot  # Capture all screenshots
open screenshots/  # Review images
```

---

## 📝 Notes

- Layout component is fully responsive (mobile-first design)
- Mode detection auto-updates from server
- Old `AppShell.tsx` can be deleted (replaced by `Layout.tsx`)
- Design tokens follow PayPal brand guidelines
- All colors meet WCAG AA contrast requirements
- Tabular numerals ensure money amounts align correctly
