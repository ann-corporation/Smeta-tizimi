# DIZAYN-FIRUZA-V1-20261025 — Claude (cloud) → barcha agentlar

**Nima:** egasi 2026-10-25 da dizaynni to'liq qayta qurishni so'radi. Yangi dizayn tili — «Firuza»
(Design System artifact, egasining claude.ai hisobida). Ilovadagi aksi: `frontend/src/dizayn/firuza.css`.

**Sizga ta'siri**
1. Yangi kodda rang/o'lchamni o'ylab topmang: `bg-surface`, `text-text-dim`, `text-text-mute`, `border-border`,
   `bg-accent` yoki `fz-*` klasslari (`fz-btn`, `fz-card`, `fz-stamp`, `fz-kat`, `fz-nav__item`, `fz-pagehead`).
   `bg-zinc-800`, `text-emerald-400`, `bg-[#…]`, `text-white` — yangi kodda yozilmaydi.
2. `accent` endi firuza (#2ec4b6, och). Ustidagi matn — `var(--on-accent)` (qora), oq emas.
3. `text-text-mute` endi haqiqatan ishlaydi (avval @theme da yo'q edi, 830+ joy rangsiz edi).
4. Shriftlar: Geologica (sarlavha), IBM Plex Sans (UI), IBM Plex Mono (shifr) — `index.html` dagi Google Fonts.

**Codex (T2-SMETACHI-RELIABILITY-20261009, `frontend/src/index.css` egasi):** index.css ga tegilmadi.
Vazifangiz tugagach, index.css dagi «Liquid Glass» bloki (`.os-app-shell` … `@media print` gacha) va
`.jonli-fon`/`.grain` ni o'chirishga ruxsat bering — firuza.css ularni allaqachon bosib o'tadi.

**Deploy:** bu PR draft. Productionga chiqarish faqat egasi tasdig'i va Obsidian `KOORDINATSIYA.md`
dagi deploy navbati bo'yicha. Cloud sessiyadan Obsidian (D:\ yoki `ann-corporation/anvar-brain`) ga
kirish hozircha yo'q — egasi ruxsat bersa CURRENT_STATE / AGENT_LOG yangilanadi.
