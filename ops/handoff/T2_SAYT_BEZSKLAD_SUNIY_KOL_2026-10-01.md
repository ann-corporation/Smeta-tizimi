# T2-SAYT-BEZSKLAD-SUNIY-KOL — checkpoint

> **LATEST INTEGRATED STATE (2026-10-01):** `origin/main @ 3a1bdf72c322f20c3a19e9ce62164bdb7eae272d` C/B/A kodlarini o‘z ichiga oladi. Supabase read-only runtime verification B/A migrationlar va guard kontraktini tasdiqladi. Object 84 dry-run `2,411` candidate, `147,831,682,356.81` summa, `akt=0`, `AOSR=0`; mavjud qatorlarni delete/merge qilish bajarilmadi.

## Latest integration record

- Codex branch: `codex/20261001-site-map-bez-sklad-suniy-kol-current` @ `3a1bdf72c322f20c3a19e9ce62164bdb7eae272d`.
- C: code-generated manifest, `/admin/sayt-xaritasi`, route/read/write oracle; current source test `62/62 PASS`.
- B: `БЕЗСКЛАД` classifier/API/UI va `20261105160000_t2_resurs_kategoriya_bez_sklad_v1.sql` (+ rollback/acceptance).
- A: source/object import guard, idempotency/advisory lock/dry-run va `20261105170000_t2_smeta_import_dublikat_guard_v1.sql` (+ rollback/acceptance); static guard `8/8 PASS`.
- Main’dagi latest AI agent commiti `62947e3`; undan keyin `5e87712` va ushbu metadata checkpointi qo‘shilgan, remote `main` hozir `3a1bdf7` bilan teng.
- Joriy main gate dalili: site-map `62/62`, duplicate guard `8/8`, pre-main QA `33/33`, focused Vitest `26/26`, frontend/functions TypeScript, build, tekshir va diff-check PASS. Oxlint `0 error`, mavjud warninglar bor.
- Full current-main Vitest: `810 passed / 3 failed / 12 skipped`. 3 failure mavjud og‘ir benchmarklar: `f2-import-parse/xlsxFonda` 27k XLSX timeout, `f2-moslash-v3` 30k threshold, `f2-match-engine` 50k threshold. C/B/A focused checks PASS; testlar yumshatilmadi.
- `node ops/governance-check.cjs`: exit 0, `62 tasks` PASS; repo `docs/governance/CURRENT_STATE.md` joriy `origin/main` SHA’sidan ortda qolganligi haqida warning berdi. Bu Codex task `owns` hududidan tashqarida, Claude bilan coordination orqali tuzatilishi kerak.
- Supabase read-only evidence: migration versions `20260930215806` (`t2_resurs_kategoriya_bez_sklad_v1`) va `20260930215932` (`t2_smeta_import_dublikat_guard_v1`) mavjud; `t2_qator_kat_check` tarkibida `БЕЗСКЛАД`, source guard/package wrappers/index/semantics mavjud. No DML was executed.

## C — sayt xaritasi

2026-10-01, Codex, branch `codex/20261001-site-map-bez-sklad-suniy-kol`.

- `frontend/scripts/generate-site-map.mjs` `App.tsx`, `AdminShell.tsx`, `functions/api/sb.ts` va `functions/api/sb-yoz.ts`dan manifestni qayta yig‘adi.
- `frontend/src/lib/sayt-xaritasi/generated.ts` generator natijasi; qo‘lda tahrirlanmaydi.
- `frontend/src/lib/sayt-xaritasi/pageCatalog.ts` sahifalarning biznes ma’nosi, scope, read/write, hujjat va keyingi iste’molchilarini beradi.
- `frontend/src/admin/sahifalar/SaytXaritasi.tsx` `/admin/sayt-xaritasi` paneli: qidiruv, scope filter, oqimlar va sahifa tafsiloti.
- `frontend/testlar/t2_sayt_xaritasi.test.cjs` route/menu/read/write qamrovini va generator driftini tekshiradi.

## Dalil

- generator: 36 menu route, 91 read-model/table nomi, 99 write amal.
- `node frontend/testlar/t2_sayt_xaritasi.test.cjs`: 61/61 PASS.
- `npm run site-map:check`: PASS.
- `npx tsc -b`: PASS.
- `git diff --check`: PASS.

## B — БЕЗ СКЛАД

`072e689` (rebase qilingan checkpoint; original B commit `f373fa3`) ichida:

- `frontend/src/lib/resurs-kategoriyasi/bez-sklad.ts` — товарный бетон, бетонная смесь, раствор va asfaltobeton uchun deterministic keyword classifier; saqlanadigan beton bloklari/ЖБИ uchun negative gate; operator override; warehouse markup yo‘q contract.
- `SmetaYuklaNative.tsx` va `sb-yoz.ts` — `БЕЗСКЛАД` qiymatini native import/API contractga kiritadi.
- `20261105160000_t2_resurs_kategoriya_bez_sklad_v1.sql` (+ rollback/acceptance) — DB allowlist va nakrutka view kaskadi source-ready. Claude `nakrutka-podval.ts`ni alohida tugatgan (`30cf76a`).
- focused suite: 63 test PASS.

## A — Suniy Ko‘l import dublikatlari

Yakuniy A source-ready commit: `cc0a9f1` (remote branchga push qilingan; branch HEAD shu SHA).

Aniqlangan xavf: obyektga import first-import-only bo‘lsa ham, source hujjat darajasidagi aniq preflight yo‘q edi; yangi `operation_id` bilan takroriy urinish umumiy `SMETA_ALREADY_EXISTS`ga tushardi. `ВЕДОМОСТЬ РЕСУРСОВ` esa mavjud anatomiya kontraktida ish daraxtidan chiqariladi, lekin buni import dublikat acceptance bilan birga regressiyada ushlab turish kerak.

Kiritilgan:

- `frontend/functions/api/smeta-yukla.ts` — bir-fayl va paket importidan oldin `t2_smeta_import_source_guard_v1` chaqiriladi; source hujjati qayta ishlatilsa `SOURCE_DOCUMENT_ALREADY_IMPORTED`, obyekt band bo‘lsa `SMETA_ALREADY_EXISTS`; guard ishlamasa import fail-closed `503` bilan to‘xtaydi.
- `20261105170000_t2_smeta_import_dublikat_guard_v1.sql` — source/object guard, `(obyekt_id, source_document_id, id)` partial index, eski import algoritmlarini o‘zgartirmaydigan advisory-lock wrapperlar. `operation_id` idempotency saqlanadi; parallel finalize ikkinchi qatorlarni yaratolmaydi.
- `.rollback.sql` — qatorlarni o‘chirmaydi; faqat guard/wrapper/indexni olib tashlaydi va eski RPC nomlarini tiklaydi.
- `.acceptance.sql` — RPC/index/wrapper semantikasi va read-only dry-run duplicate candidates; eng kichik `id` faqat `keep_candidate_id`, avtomatik delete/merge yo‘q.
- `supabase/migrations/20261105170000_t2_smeta_import_dublikat_guard_v1.acceptance.sql` ichidagi dry-run qaysi obyekt/source/fingerprint takrorlanganini sanaydi; avvalgi mavjud qatorlar uchun production repair qilmaydi.
- `frontend/testlar/t2_smeta_import_dublikat_guard.test.cjs` — 8 static guard PASS.
- mavjud `frontend/src/lib/smeta-anatomiya/akt-daraxt.test.ts` — `ВЕДОМОСТЬ РЕСУРСОВ` ish qatori emasligini regressiya sifatida tekshiradi; anatomiya/import focused suite 69 test PASS.

## Qolgan tashqi ish

1. `20261105160000_t2_resurs_kategoriya_bez_sklad_v1.sql` va `20261105170000_t2_smeta_import_dublikat_guard_v1.sql`ni faqat Claude Supabase MCP orqali tranzaksion production/staging tartibida qo‘llaydi va acceptance fayllarini ishga tushiradi.
2. A acceptance dry-run Suniy Ko‘l obyekt 84 bo‘yicha candidate ro‘yxatini chiqaradi; hech bir mavjud qatorni avtomatik o‘chirish/merge qilishga ruxsat yo‘q.
3. Remote branch `codex/20261001-site-map-bez-sklad-suniy-kol` `cc0a9f1` bilan push qilindi; exact SHA va testlar Obsidian AGENT_LOG/CURRENT_STATE/HANDOFF/KOORDINATSIYAga yozildi.

## Production

Bu checkpoint productionga qo‘llanmagan. Migration qo‘llash va eski qatorlarni tuzatish productionda bajarilmagan. Main merge/push faqat C, B, A gate’lari va Claude acceptance’dan keyin.
