---
agent: codex
mashina: pc-ishxona
sana: 2026-09-29
branch: codex/f2-import-robustness-v1
base_sha: b36c552e0b8de22bb398f04ab851449a3e68b87f
---

STATUS: PARTIAL — parser/matcher/UI tuzatishlari va regression testlar checkpoint
qilindi. Main/production o‘zgartirilmadi.

G:\...\GAS dagi dirty owner ishiga tegilmadi. Izolyatsiyalangan worktree:
`C:\Temp\f2-import-robustness-v1`, branch `codex/f2-import-robustness-v1`, base
`b36c552e0b8de22bb398f04ab851449a3e68b87f`.
Current remote HEAD: `819104405fdebf0dd91f3b3e46625f45ba14266b`.
Checkpoint chain: `49119fb` → `749004d` → `ee931c9` → `8191044`.

Natija: T1 `35_F2Moslash.js`/`Panel.html` dan ikki daraxt, qator bo‘yicha
bog‘lash va tur/RZ scope skeleti olindi; T1 GAS/row identity/ko‘r-ko‘rona match
ko‘chmadi. LRV_PLUS `RZ/BL/RS/MAT/OB` markerlari parserda ajratiladi, mustaqil
MAT/OB saqlanadi, markerli match turi mos kelmasa rad etiladi, default UI barcha
qatorni ko‘rsatadi va 30k matcher benchmark bor.

Offline read-only uch workbook parse natijalari hamda sum/header tafovutlari va
qolgan gate’lar `ops/handoff/F2_IMPORT_ROBUSTNESS_001.md`da qayd etildi. Muhim:
Fast Food lokal parse `239 200 683,38`, oldingi Preview kuzatuvi `241 983 934,96`;
source hash/revision tengligi va authenticated Preview importi tekshirilmaguncha
farq unresolved, hech qaysi holatni PASS yoki production-ready deb bo‘lmaydi.

Verification: focused Vitest 5 fayl/27 test PASS; `tsc -b`, Functions gate,
`npm run lint` (exit 0, mavjud warninglar), `npm run tekshir`, governance-check,
build va `git diff --check` PASS. Governance-check `CURRENT_STATE.md` main SHA
eskiligi warning berdi.

Keyingi ish: source hash/revisioni aynan tenglashtirilgan workbook bilan
authenticated Preview operator importini bajarish, Fast Food jami tafovutini
tushuntirish va F2 tarix/Nakopitelniy/F3 acceptance qilish. Bu ishchi task
production yozuvi, main merge yoki deploy qilmagan; to‘liq release readiness emas.

## 2026-09-29 qo‘shimcha adversarial checkpoint

- Matcher oldingi F2 xotira bog‘lanishini ishlatishdan oldin joriy canonical
  qator turi, birlik va tanlangan RZ chegarasini tekshiradi. Noto‘g‘ri xotira
  rad etilib, joriy dalillardan match qayta hisoblanadi.
- Yangi regression testlar: explicit BL signature collision → MAT rad etiladi;
  tanlangan RZ-A chegarasidan tashqaridagi saqlangan RZ-B match rad etiladi.
- Relevant suite: 14 fayl, 82 PASS / 12 SKIP / 0 FAIL. 30k benchmark yakka
  holatda 1 PASS; bir vaqtdagi full suite+tsc ostida 23,556 ms bo‘lib timeout
  guardi yiqilgan, threshold o‘zgartirilmagan.
- TypeScript, `npm run tekshir`, build: PASS. Lint exit 0, oldindan mavjud
  warninglar bor. Governance-check PASS, ammo CURRENT_STATE main SHA eskirgan
  warning bor. `git diff --check`: PASS.
- Kod patchi `ee931c9`, handoff/mailbox reconciliation `8191044`; ikkalasi ham
  remote feature branchda. Authenticated Preview importi va Fast Food
  lokal/Preview jami farqi hali unresolved; main/deploy yo‘q.
