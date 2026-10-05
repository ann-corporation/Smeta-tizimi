# T2-UNIVERSAL-SMETA-STUDIO-001 — Smeta studiyasi (davom ettirish xaritasi)

Agent: Claude (noutbuk). Branch: `claude/t2-smeta-studio-v1` (C:\t2dev\wt worktree).
Base: Codex `aab72560` (= main `a0cf0bf8` + 4 Codex commit, fast-forward olindi).
Oldingi tarix: `ops/handoff/T2_CATALOG_EXTRACTION_INTEGRATION_001.md` (Codex 1–4 bosqich).

## DONE (ishlaydi, test qilingan)

| Qism | Fayl | Holat |
|---|---|---|
| Platforma normativ katalogi — revisiyali shardlar | `frontend/src/lib/catalog-extraction/norm-shards.ts`, `scripts/catalog-extraction/build-norm-shards.ts` | R2'da faol: `norm-katalog/567137e5ebdf076c/` |
| BOOK nomli daraxt | `reconcileBookTree` — kalit (TipBook, KodA, KodTab) | 8 823 jadvaldan 7 625 nomli, 1 128 topilmadi, 70 noaniq (alohida kod tarmog'ida); 45 960 ish nomli |
| KodI birlik lug'ati | `deriveUnitDictionary` + `D:\CatalogMigration\unit-observations-20261005.json` | 54 kod, 7 112 kuzatuv, ziddiyat 0 (real import qilingan smetalardan) |
| Katalog o'qish endpointi | `frontend/functions/api/norm-katalog.ts` | sessiya talab, whitelist, R2 gzip stream, immutable kesh; preview'da 401 tekshirildi |
| Brauzer klienti | `norm-remote.ts` | sha256 tekshiruvi, shard talab bo'yicha; ochilish ~1.2 s, qidiruv 17–28 ms, shard 10–30 ms |
| Smeta domen modeli + yagona reducer | `frontend/src/lib/smeta-studio/{model,commands,calc,catalog-bridge}.ts` | occurrence + retsept snapshot, override'lar dalil bilan, undo/redo, NULL tarqaladi |
| Smeta studiyasi sahifasi | `frontend/src/admin/sahifalar/SmetaStudio.tsx`, route `/admin/smeta-studio`, menyu PTO | ikki panel, nomli daraxt, ko'p so'zli lotin/kirill qidiruv, bo'lim/podrazdel, hajm/narx joyida, ko'chirish, noaniq nomzod tanlash, IndexedDB tiklash |
| Chat → buyruq ko'prigi | `conversation-commands.ts` | PER_ITEM/TOTAL tasdig'i, CREATE_ESTIMATE ≠ REGISTER_FACT, operator tanlovi majburiy |

Real korpus: retsept exact 528 210 / missing 709 / ambiguous 43 (SQLite oracle bilan aynan).

## SOURCE_READY (kod tayyor, faollashtirilmagan)

- Server qoralama saqlash: `functions/api/smeta-studio.ts` + migratsiya
  `supabase/migrations/20261106100000_t2_smeta_studio_qoralama_v1{,.rollback,.acceptance}.sql`.
  **Qo'llanmagan**: Supabase MCP hozir read-only (`transaction_read_only=on`). UI faollashmaguncha
  "Server saqlash hali faollashtirilmagan" deydi, qoralama brauzerda saqlanadi.
  Faollashtirish: MCP yozish rejimi yoki SQL editor'da avval `BEGIN; <migratsiya tanasi>; <acceptance>; ROLLBACK;`
  (oxirida `ACCEPTANCE_PASS_ALL_CHECKS` exception kutiladi — bu PASS belgisi), keyin migratsiyani qo'llash.

## PARTIAL / YO'Q (bor deb aytilmasin)

- To'liq resurs almashtirish (butun material katalogi bo'yicha qidiruv) — hozir faqat manbadagi noaniq nomzodlar.
- POPRAV/POPRAVBASE koeffitsient bajarish — yo'q (PRAV eval qilinmaydi).
- Nakrutka podvali va rasmiy tirik Excel — yo'q.
- Qoralamani obyekt smetasiga (t2_qator) aylantirish buyrug'i — yo'q.
- Chat UI / ASR / LLM extractor — yo'q (faqat dalil va buyruq fundamenti).
- Autentifikatsiyali egasi smoke — o'tkazilmagan (login egasi tomonidan).

## Muhim ogohlantirish

Supabase loyiha **free** rejada va baza **552 MB** (free limit 500 MB). Shu sabab 1M qatorli katalog Postgres'ga emas,
R2'ga joylandi. Bazaning o'sishi read-only rejimga olib kelishi mumkin — egasi qarori kerak.

## Keyingi aniq qadam

1. Migratsiyani shadow acceptance bilan qo'llash (yuqoridagi tartib) → Studio'da "Serverga saqlash" smoke.
2. Material katalogi bo'yicha resurs almashtirish (shardga resurs indeksi qo'shish, `NORM_BUILD_FORMAT` oshirish).
3. Studio qoralamasidan tirik Excel (mavjud F2 Excel yozuvchi uslubida) va nakrutka podvali.

## Buyruqlar

```powershell
# frontend cwd (C:\t2dev\wt\frontend)
node --max-old-space-size=8192 scripts/catalog-extraction/run-ts.mjs scripts/catalog-extraction/build-norm-shards.ts D:/CatalogMigration/paradox-open-20261005-145050 D:/CatalogMigration/tizim2-full-review-packet-v1.json C:/t2dev/norm-shards-vN D:/CatalogMigration/unit-observations-20261005.json
node scripts/catalog-extraction/upload-norm-shards.mjs C:/t2dev/norm-shards-vN --activate
node node_modules/vitest/vitest.mjs run src/lib/catalog-extraction src/lib/smeta-studio src/admin/sahifalar/SmetaStudio.test.tsx functions/api/norm-katalog.test.ts functions/api/smeta-studio.test.ts
```
