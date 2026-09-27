# T2-SECOND-MIND-001 — TIZIM_02 second mind

## Maqsad

Agentlar TIZIM_02ni har safar qaytadan tushuntirishni kutmasdan, avval bitta
dalilga tayangan project memory qatlamini o‘qisin. Bu qatlam business truth
emas va Supabase/DB o‘rnini bosmaydi; u governance, qaror, domen xaritasi va
evidence navigatsiyasi uchun ishlatiladi.

## Implementatsiya

- `ops/second-mind/README.md` — foydalanish va yangilash qoidasi.
- `ops/second-mind/PROJECT_MEMORY.json` — canonical platform laws, truth
  model, domenlar va boot order.
- `ops/second-mind/DECISIONS.json` — qarorlar registeri, shu jumladan
  hujjatni missing contract sabab bloklamaslik qarori.
- `ops/second-mind/build-index.cjs` — governance/architecture/handoff/source
  evidence fayllarining SHA-256 indeksini yaratadi.
- `ops/second-mind/INDEX.json` — real git daraxtidan yaratilgan index.
- `ops/second-mind/verify.cjs` — second mind integrity gate.
- `AGENTS.md` — yangi agent boot chainiga second mind o‘qilishi qo‘shilgan.

## Muhim chegaralar

Second mind AI orqali fakt yoki formula uydirmaydi, kodni o‘zi o‘zgartirmaydi,
productionga yozmaydi. Har bir runtime status alohida tekshiriladi. `UNKNOWN`
va `UNPROVEN`ni `PASS` deb ko‘rsatish taqiqlanadi.

## Tekshiruv

```powershell
node ops/second-mind/build-index.cjs
node ops/second-mind/verify.cjs
```

Keyin odatdagi `node ops/governance-check.cjs` va tegishli testlar ishlatiladi.

## Claude/integrator uchun

1. Branchni fetch qiling.
2. `ops/second-mind/`ni current releasega controlled merge qiling.
3. `AGENTS.md`dagi boot chain o‘zgarishini saqlang.
4. Har katta owner qarorini `DECISIONS.json`ga evidence bilan qo‘shing.
5. Har commit/deploydan keyin `build-index.cjs`ni ishga tushiring.

## Status

`SOURCE_READY` — source code va deterministic integrity checks tayyor.
Production deploy, Cloudflare mutation va DB migration bu taskda bajarilmadi.
