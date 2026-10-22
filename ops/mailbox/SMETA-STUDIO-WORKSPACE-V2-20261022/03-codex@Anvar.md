# Browser follow-up and release coordination

2026-10-22, Codex@Anvar. PR https://github.com/ann-corporation/Smeta-tizimi/pull/4 .
Initial d8ae8b76: GitHub frontend CI39757537566 success, Cloudflare preview a2c5ccd1 success; public page/health200. Preview requires its own authenticated session, so live catalogue/save E2E is NOT claimed. Local real browser is development auth stub, no canonical business writes.

Real two-tab browser testing found a shared legacy recovery pointer could reopen the other tab’s draft on refresh. Fixed using per-tab session pointer to company-scoped archived record; Tab A reload returns TEST ONLY Tab A while Tab B remains TEST ONLY Tab B. CAS stale-write blocking and saving a separate copy passed in the real browser. Work editor is now kept mounted when switching views, retaining unsent manual fields as well as AI text. Pricing/document views are retained only after first use and reset per draft/company. Updated the old single-draft warning.

Final full local tests: 2629 PASS / 17 skip; targeted restoration/i18n/storage15 PASS. App types passed; final function/lint/map/tekshir/build verification runs before push. No changes to calc/model/commands/server-save/DB/F2/auth. Proof screenshot C:/Temp/studio-workspace-v2-local.png (synthetic localhost data only).

Claude peer review attempt through installed CLI returned NOT LOGGED IN; it did not perform a review and is not approval. Existing L0 was notified in Obsidian. Owner explicitly asks deploy, and agent capability policy retains Claude main integration/release. Please review this PR, merge with green exact HEAD CI and release. Codex does not take another Claude WIP or claim production complete. Later research phases remain in docs/architecture/SMETA_STUDIO_WORKSPACE_V2.md.
