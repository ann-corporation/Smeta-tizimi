---
agent: codex
mashina: noutbuk-jarvis-continuation
sana: 2026-10-18
branch: codex/jarvis-studio-context-20261018
source_sha: 05d9dd0191640f9dbf0dfd46be553276f9f706e5
---

# SOURCE READY / TESTED / BRANCH PUSHED — live smoke ochiq

Egasi Claude limitidan keyin davom ettirishni bevosita topshirdi. Base origin/main90a36f53; tugagan price-index, auto-pricing va multi-local-smeta ishlari qayta yozilmadi. Alohida clean worktree ishlatildi, barcha dirty boshqa worktree’lar saqlandi.

Studio → Jarvis read-only context ishladi: explicit share tugmasi (unassigned draft company attribution jim emas), memory-only/lazy current snapshot, 6000char, current company/page/draft lifecycle, ready DocCalc qiymatlari NULL/0 va exact decimal bilan. Backend rol + DB smeta_pul category + tenant + DTO limitini tekshiradi; untrusted draft canonical F2 emas, action takliflari serverda ham bloklanadi. T2_AGENT_PLATFORM_V1.md saqlangan, yangi migration yo‘q.

Stop/company/draft/route/unmount/duplicate-submit regressiyalari; katalog NULL/blank/boolean narxi 0 emas, numeric0 saqlanadi. Modelga texnik draft UUID/companyId yuborilmaydi. AI label yuklanayotganda ham explicit draft yo‘qolmaydi, server authority saqlanadi.

Full2131PASS17skip; so‘nggi minor fixlar final106focusedPASS/9file. App/functionsTS/build, oxlint exit0(baseline warnings), tekshir, governance va diff PASS. No paid provider invocation, secret read/rotation yoki production data mutation. 30k synthetic context/truncation test PASS; real530sheet audit oldingi Claude reported natijasi, bu yerda qayta bajarilmadi.

Preview: https://codex-jarvis-studio-context.smeta-tizimi.pages.dev/admin/smeta-studio . Exact source SHA Preview deploy tasdig‘i Obsidian receipt’da yangilanadi. open_in_codex faqat queued qaytardi, ko‘rildi deb aytilmaydi. Browser-control vositasi bu sessiyada yo‘q: real owner login/model answer vertical smoke UNKNOWN, main/prodga chiqarilmadi.

Acceptance: kompaniya → Studio qoralama → «Qoralamani Jarvis bilan muhokama qilish» → shu qoralama haqida savol → qoralamani edit → qayta savol → boshqa kompaniya/sahifa → eski kontekst yo‘q. Jarvis readonly; tahrir Studio/Smetachi AI command oqimida qoladi. Providerga ketib bo‘lgan requestni browser Stop to‘lovsiz qiladi degan va’da yo‘q.

E8-2-1-1 qorishma va real OpenRouter usage/billing auditi alohida OPEN. Claude logida kalit chiqqani user orqali REPORTED; sirni qayta chiqarmang. Key rotation — owner bilan alohida, bu continuationda bajarilmadi. To‘liq shartnoma: ops/handoff/T2_AI_ISHCHILAR_001.md continuation bo‘limi.
