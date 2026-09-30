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

## Keyingi ishlar

1. B — `БЕЗ СКЛАД` uchun alohida deterministic classifier va synthetic testlar.
2. Claude egallagan nakrutka fayliga tegmasdan, classifier contractini handoff qilish.
3. A — Suniy Ko‘l duplicate sababini import pipeline’da isbotlash, source-ready additive guard/rollback/acceptance va dry-run SQL yozish.
4. Production migration qo‘llanmaydi; Claude bilan koordinatsiya qilinadi.

## Production

Bu checkpoint productionga qo‘llanmagan. Main merge/push C, B, A va barcha gate’lar tugagach amalga oshiriladi.
