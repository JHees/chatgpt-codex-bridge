# Bridge cascading controls — design QA

Result: **passed** for the scoped Windows desktop redesign, 2026-09-06.

## Reference and comparison

Product Design's existing-product, image-to-code and design-QA workflow informed this change. Native General settings and model controls were inspected before implementation, followed by a fresh Better UI settings capture. Better UI is a visual reference only; its source, configuration and private runtime APIs are not dependencies.

Light reference and implementation screenshots were supplied together in one comparison input at 1513 × 903 CSS pixels, 2× capture scale. A second combined input compared actual dark-theme Better UI settings with Bridge settings and the expanded picker at the same viewport. The original system theme was restored afterward. Class-only dark emulation did not change native tokens and was **not** counted as dark-theme evidence.

Private captures are under `.runtime/design-reference/` and `.runtime/cascade-shots/`; they include native app surroundings and are not publication assets. The previously rejected browser file fixture was not reopened through another browser or transport. QA used the separately user-authorized, owned native App renderer and the normally installed candidate.

## Findings and fixes

- **Typography and hierarchy:** retain Loader's native Bridge page title and description; remove the duplicated plugin h2. Body and section labels use system 13px text, medium labels and muted descriptions rather than oversized headings.
- **Spacing and layout:** reset the plugin-owned page to block layout to avoid inherited host flex gaps. Align 768px content width, 20px group radii, 12px vertical/16px horizontal row padding with native/Better UI settings. Bridge intentionally has fewer groups and a Save action because defaults are staged.
- **Surfaces and colors:** native foreground, secondary, border, elevated-surface and focus tokens work in the actual light and dark themes. No independent palette or decorative artwork. Native sidebar/search rendering seen in the references is outside Bridge's scope.
- **Menus:** 260px parent and 200px preset submenu, whole-row hit targets, thin library chevrons/checkmarks, clear current/default labels. Opens right when space permits; the settings picker was observed flipping left at the right edge. The task menu stays beside the original composer control.
- **Icons and assets:** Lucide library paths at 16px with 1.5px strokes match the restrained native controls more closely than filled or heavy icons. Only two icons are bundled; their license ships in the ZIP. No hand-drawn icon substitutes or raster assets.
- **Responsive layout:** 800 × 900 native settings capture shows wrapping descriptions with accessible right-side fields, no horizontal clipping. This is a Windows desktop surface, not a mobile web application.
- **Behavior:** hover previews without a configuration write; click selects the default/nearest supported effort; preset selection can happen without a preceding model click. Pro remains explicit. Only the chosen family retains a selected caption.
- **Accessibility:** semantic switches, named menus and radio items, selected/expanded states, visible focus styles, ArrowRight/Left and Up/Down navigation, nested Escape behavior, outside dismissal and teardown are covered by DOM tests. Save and task scopes remain distinct. Reduced-motion and forced-colors switch styling is retained.
- **Copy and completeness:** Chinese native UI screenshots are verified; English interaction labels are exercised by tests. Compatibility refresh, errors, active-session management and system-settings navigation remain wired to production controls, not mock buttons.

## Scope and remaining acceptance

117 tests across 14 files, typecheck, lint, build and package validation pass. Runtime capture confirms a running candidate and no duplicated controls. No Chat or Pro generation was used for UI testing.

This pass does not claim English screenshot parity, 200% accessibility zoom, screen-reader certification, arbitrary third-party long model labels or mobile support. Those remain wider release checks. Actual Pro/Spark/Luna cooperation and the full background submission matrix are separate product gates, not implied by a UI pass. User review is required before versioned publication.
