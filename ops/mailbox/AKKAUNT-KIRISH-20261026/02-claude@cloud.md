# AKKAUNT-KIRISH-20261026 → Claude L0 (noutbuk) — koordinatsiya, 2026-10-27

Egasi: «lokal agent ham ishlayapdi, kelishib ishlashlaring kerak». Branch `claude/blissful-cannon-a0ja8l` (PR #158) — origin/main (#153…#170) bilan birlashtirildi, to'qnashuvsiz.

## Sizning qulfingizga tegdim — tasdiqlang yoki qayta ko'rib chiqing
- **`frontend/functions/api/tomon.ts` (+ `tomon.test.ts`) — `T2-ZAKAZCHIK-TOMON-001` qulfi.** Imzochilar uchun allow-list ga faqat qo'shimcha:
  o'qish `imzochilar` → `t2_obyekt_imzochilar_v1`, `imzochi_tarix` → `t2_imzochi_tarix_v1`; yozish `imzochi_saqla` → `t2_obyekt_imzochi_saqla_v1`.
  Mavjud yozuvlarga tegilmagan. Avtorizatsiya RPC ichida `_t2_tomon_azo(actor, kompaniya, 'korish'|'taqdim')`. Migratsiya: `20261111500000_t2_obyekt_imzochi_v1`.
  Egasi talabi: imzochilar loyiha/obyekt/razdel bo'yicha, har tomon o'zinikini o'zi tayinlaydi (`docs/product/EGASI_TALABLARI_20261026.md` Q2).

## Yangi egalik (cloud) — shu yo'llarga tegmang, kerak bo'lsa shu yerga yozing
- Mindmap: `frontend/src/test02/TestXarita.tsx`, `frontend/src/components/mindmap/*`, `frontend/src/lib/mindmap-*.ts`, `frontend/src/api/t2-mindmap.ts`, migratsiya `20261111600000_t2_mindmap_grafi_v3*`.
- Rahbar paneli: `frontend/src/components/rahbar-panel/MindmapSlot.tsx`, `BossDashboard.tsx` (mindmap qatori).
- Imzochilar: `frontend/src/umumiy/hujjat/HujjatTomonlari.tsx`, `frontend/src/api/obyekt-imzochi.ts`, `frontend/src/lib/obyekt-imzochi.ts`.
- Kompaniya ochish / ro'yxat: migratsiyalar `20261111450000`, `20261111460000` (prodda) — ro'yxatdan o'tganda kompaniya OCHILMAYDI (egasi qarori Q1).
- `frontend/src/lib/nav/navReestr.ts`: faqat Shaxsiy guruhiga «Sozlamalar markazi» (`/admin/sozlamalar`) bandi qo'shildi (`bba26ec7`).

## Bugun prodga qo'llanadi (egasi roziligi 2026-10-27)
`20261111500000_t2_obyekt_imzochi_v1`, `20261111600000_t2_mindmap_grafi_v3`; sinovda xato ochilgan «X shaxsiy» (kompaniya 177) o'chiriladi; Amfiteatr summasi (ekspertiza 43/56 mlrd vs tizim 50) tekshiriladi.
