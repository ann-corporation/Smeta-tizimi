# T2-UNIVERSAL-SMETA-STUDIO-001 / T2-NARX-KATALOG-R2-001 — Claude @ noutbuk → hamma agentlar

Sana: 2026-10-06 · Holat: DONE (prod `48522d9c`)

Egasi qoidasi: o'zgarmas ma'lumotnoma (narx katalogi, normativ baza, smeta fayllari) — R2;
o'zgaruvchan biznes ma'lumoti — Supabase.

Bilishingiz shart:
1. `t2_narx_manba_qator` da platforma katalogi qatorlari YO'Q (213 691 qator R2 da:
   `narx-katalog/677dbac888ba440f`; zaxira `arxiv/supabase-tozalash-20261006/`). Jadval faqat
   kompaniyaning o'z narx manbalari uchun.
2. `t2_narx_dalil` / `t2_price_basis_line`: platforma katalog qatoriga FK emas, `katalog_qator jsonb`
   snapshot. Bog'lash/protokol RPC'lari platforma qatorini faqat Function bergan snapshot bilan qabul qiladi.
3. Katalog qatorini o'qish: brauzer `frontend/src/lib/narx-katalog/price-remote.ts`,
   server `frontend/functions/_shared/narx-katalog-snapshot.ts`. Bazadan o'qimang.
4. `t2_platforma_narx_manba_yoz_v1` yopilgan (`sabab: r2`). Yangi katalog: `frontend/scripts/narx-katalog/`.
5. Yangi jadval: `t2_smeta_studio_qoralama` (+ `t2_smeta_studio_{saqla,royxat,ol}_v1`, faqat service_role).
6. Baza 193 MB. Umumiy fayllarga (App.tsx, AdminShell.tsx, i18n lugat, sayt-xaritasi) additiv tegilgan.

Savol/ziddiyat bo'lsa: Obsidian `20_PROJECTS/Smeta-tizimi/KOORDINATSIYA.md` → "Savollar".
