# PTO zanjiri: checkpoint 1

Branch: `codex/pto-chain-integrity-implementation`. Base: `15b689a2f4a540ec4cca265250b377334bb72d34`.

Amaliy tuzatishlar:
- Explicit object-contract evidence yo‘qligi endi validatorni chetlab o‘tmaydi.
- Calendar month 01..12 va source canonical IDs pul/hajm yo‘llarida tekshiriladi.
- Approved change NULL nolga almashtirilmaydi.
- Hisobot oyida F2 bo‘lmasa ham oy ustuni qoladi; eski akt joriy oyga ko‘chmaydi.

Chegara: bu barcha PTO arxitekturasi yakunlandi degani emas. Monthly missing amount hali zero bo‘lishi mumkin; UI/export bilan birga keyingi coherent unitda tuzatiladi. Contract selection va multi-object F3 alohida davom etadi. Production yozilmadi.

Obsidian: `PTO_ZANJIR_AMALIY_NAVBAT.md` — davomiy talab/navbat; `TIZIM_02_BOG_LANISHLAR_KONTRAKTI.md` — arxitektura dalillari.

Tekshiruv: 71 focused test PASS (5 fayl); frontend/functions TypeScript PASS, build PASS, lint exit 0 (warnings), tekshir PASS, governance PASS (stale CURRENT_STATE warning), diff-check PASS. Build ogohlantirishlari: grid.svg resolve va katta chunks. Authenticated runtime hali tekshirilmagan.
