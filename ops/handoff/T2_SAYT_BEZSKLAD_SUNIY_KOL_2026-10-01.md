# T2-SAYT-BEZSKLAD-SUNIY-KOL — checkpoint

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
