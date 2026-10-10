# Hacky working instructions

- After a context reset, start with CORE.md, HANDOFF.md and PHILOSOPHY.md. PRODUCT.md records the confirmed scope; DESIGN.md records the current visual system.
- Build and present every design phone first. Open review previews at 390 x 844 in visible Chrome; inspect desktop only as a secondary adaptation. Treat complete character portraits and finished interaction states as part of the design.
- Keep browser testing and research headless. Open every preview for the user in visible Google Chrome automatically; do not stop at sending a link. Prefer the working headless WebKit setup for UI checks when the Chrome bridge is unavailable.
- Launch delegated agents through Herdr, not harness subagents, so the user can see their progress. Read `herdr --skill` and the relevant CLI help first. Official source: https://github.com/herdrdev/herdr.
- Preserve the product direction in DESIGN.md and the fictional-demo disclosures in the app.
- Place new files by responsibility using `.agents/skills/context-architecture/SKILL.md`; keep the directory structure as shallow as the work allows.
- Apply frontend design refinements directly during live iteration without asking for permission; the user will steer subsequent changes.
- Impeccable is installed at `.agents/skills/impeccable/SKILL.md`. Read it and the relevant command reference before design work.
- See `.agents/skills/README.md` for the included skills, provenance and external tool requirements.
- Reveal delivered files in Finder. Never use em dashes or add agent co-authors to commits. Do not manually edit auto-generated files or CHANGELOG.md.
