# PTO zanjiri: checkpoint 1

## Checkpoint 2 — narx reestri

Egasi real oferta uchun dalilli reestrni ustuvor qildi. To‘liq talab: `D:/Obsidian/Anvar_Brain/20_PROJECTS/Smeta-tizimi/NARXLAR_REESTRI_EGASI_MAQSADI_V1.md`.
`narxTaklifMuammosi` explicit unit/price guard qo‘shildi; kod teng bo‘lsa ham noto‘g‘ri birlik tavsiya qilinmaydi. NFKC/nuqta/probel normalizatsiya — conversion emas. 12 narx-dalil testi PASS. Bu semantic matching, oferta integration yoki to‘liq production registry tayyor degani emas. UI rejected reasons va as-of currency/tax/technical specification gates qolgan.

Branch: `codex/pto-chain-integrity-implementation`. Base: `15b689a2f4a540ec4cca265250b377334bb72d34`.

Amaliy tuzatishlar:
- Explicit object-contract evidence yo‘qligi endi validatorni chetlab o‘tmaydi.
- Calendar month 01..12 va source canonical IDs pul/hajm yo‘llarida tekshiriladi.
- Approved change NULL nolga almashtirilmaydi.
- Hisobot oyida F2 bo‘lmasa ham oy ustuni qoladi; eski akt joriy oyga ko‘chmaydi.

Chegara: bu barcha PTO arxitekturasi yakunlandi degani emas. Monthly missing amount hali zero bo‘lishi mumkin; UI/export bilan birga keyingi coherent unitda tuzatiladi. Contract selection va multi-object F3 alohida davom etadi. Production yozilmadi.

Obsidian: `PTO_ZANJIR_AMALIY_NAVBAT.md` — davomiy talab/navbat; `TIZIM_02_BOG_LANISHLAR_KONTRAKTI.md` — arxitektura dalillari.

Tekshiruv: 71 focused test PASS (5 fayl); frontend/functions TypeScript PASS, build PASS, lint exit 0 (warnings), tekshir PASS, governance PASS (stale CURRENT_STATE warning), diff-check PASS. Build ogohlantirishlari: grid.svg resolve va katta chunks. Authenticated runtime hali tekshirilmagan.
