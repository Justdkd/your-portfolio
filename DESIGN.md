---
name: your-portfolio
description: An editorial atlas and a creator portfolio.
colors:
  paper: "#F5F2EB"
  ink: "#242923"
  muted: "#60665C"
  line: "#D5D7CB"
  traveler-accent: "#805136"
  creator-accent: "#496039"
typography:
  display:
    fontFamily: "Georgia, Songti SC, serif"
    fontSize: "clamp(44px, 5.5vw, 78px)"
    fontWeight: 500
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  body:
    fontFamily: "system-ui, PingFang SC, sans-serif"
    fontSize: "16px"
    lineHeight: 1.65
rounded:
  dialog: "12px"
spacing:
  small: "16px"
  medium: "24px"
  large: "64px"
---

# Visual system

Mode: experience. The public templates have no inherited personal branding.

Traveler is a warm paper atlas: a large globe beside a serif title, travel records read as dated editorial rows. Creator is a quiet portfolio: an oversized title, a lead work image and generous project spreads. Both use real content rather than decorative dashboards.

Tokens: paper #F5F2EB, ink #242923, muted #60665C, line #D5D7CB; traveler accent #805136, creator accent #496039. Shared spacing 8/16/24/40/64/96px; controls at least 44px. Georgia and local serif fallbacks for display, system sans for reading; no downloaded or CDN fonts. A neutral configurable accent is not a fixed personal identity.

Grounded structures considered: travel journal, exhibition wall, directory of records, editorial atlas/portfolio (selected), contact sheet, personal archive, walking route. The selected world uses the seed's fourth candidate. Card-stack comparison contributes addressable details and reliable back navigation; the instrument and dossier worlds do not fit the non-technical editing audience. No unrelated audio or sports motif is introduced.

Interaction: one purposeful globe opening, pointer and touch rotation, real buttons for places, explicit timeline navigation. Project artwork opens a protected-focus dialog with its own URL. Reduced motion skips the globe opening and smooth scrolling. No hover-only affordances.

Map place selection uses an optional one-second paper-plane flight from the configured departure city before opening details. Timeline entries and deep links open directly. Plane outlines inherit the template accent, folds inherit globe ocean, and the home marker inherits globe home color. Interrupted flights cannot open stale details; reduced motion skips travel animation.

Responsive: split first viewport on desktop; copy then globe/artwork on mobile; timeline collapses to two readable columns; dialogs fill the mobile viewport. Templates remain useful with no optional photo, globe or project image.

Scope: this implementation uses native code visuals following the user's instruction to proceed; no standing image-first/code-first workflow preference is saved.
