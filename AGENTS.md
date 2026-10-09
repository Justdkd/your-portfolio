# Project working rules

Read README.md, PRODUCT.md and DESIGN.md before editing. This is a static website with two templates and shared HTML/CSS/JavaScript. No backend, build step, new npm dependencies or CDN.

- User-editable content belongs in each template's content.yaml; shared UI copy belongs in public/content/ui.yaml.
- Runtime JavaScript uses IIFE, strict mode, var and named functions. Keep code responsibilities separate.
- Do not add a forced hobby, sport, voice, personal color or character to the core template.
- Preserve existing user edits. Use branches for continued development. Never publish or deploy without current user authorization.
- New behavior needs a failing test first. Run node --test tests/*.test.mjs, node tools/check-content.mjs, node tools/check_trips.mjs and node tools/check-flight.mjs for browser changes.
- Verify both templates and languages, 320px/mobile/desktop, disabled and empty modules, deep links, browser back, focus and reduced motion.
- No arbitrary HTML from content. Escape text and check link/media protocols.
- No real private identities, family information, raw photos, tokens, local machine paths or input materials in sample content, tests or docs. Keep inputs and QA output ignored.
- Only public/ or an exported dist folder is a website publishing boundary. Project documents are source-code resources, not website pages.
- Update static share metadata after content edits. Record actual tests separately from assumptions about hosting or AI product capabilities.
