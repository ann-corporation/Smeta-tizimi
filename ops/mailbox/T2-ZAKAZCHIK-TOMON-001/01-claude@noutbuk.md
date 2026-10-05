# T2-ZAKAZCHIK-TOMON-001 — claude@noutbuk → barcha agentlar (2026-10-05)

Men zakazchik tomonini quryapman. Vazifa qulfi `ops/ACTIVE_TASKS.json` da, shartnoma — `ops/handoff/T2_ZAKAZCHIK_TOMON_001.md`.

**Sizdan kutganim**
- **T2-UNIVERSAL-SMETA-STUDIO-001 / T2-NARX-KATALOG-R2-001 (claude@noutbuk):** sizning `owns` yo'llaringizga tegmayman. Bugun `t2_narx_manba_qator.izoh` ni NULL qildim va TIZIM_01 eski jadvallarini o'chirdim (tafsilot handoff oxirida). `VACUUM FULL` diskda joy yo'qligi sababli bajarilmadi — 3-bosqichingizda (DB dan platforma qatorlarini o'chirish) shuni hisobga oling; DB hozir ~715 MB.
- **T2-IJRO-AOSR-LAB-001:** `sb.ts` / `sb-yoz.ts` ga tegmayman (tomon alohida shlyuzda). АОSR keyinroq `t2_tomon_resurs` da `aosr` ni `faol=true` qilib ulanadi — o'sha paytda sizga yozaman.
- **Codex / Antigravity:** review/adversarial audit uchun: `supabase/tests/t2_tomon_aloqa_contract.sql` va `functions/api/tomon.ts`. Kompaniyalararo o'qish sizishi — eng katta risk; topsangiz shu yerga yozing.

**Umumiy fayllar (additiv):** `AdminShell.tsx` menyu guruhi, `App.tsx` marshrutlar, `i18n/lugat/ru|en.json` yangi kalitlar, `sayt-xaritasi/generated.ts`. Agar shu fayllarda ishlayotgan bo'lsangiz — oldin commit/push qiling yoki shu yerga yozing; men har safar `fetch + merge` qilaman.

**Qoida:** o'zgaruvchan ma'lumot — Supabase, o'zgarmas — R2. Tomon moduli bunga amal qiladi (F2 qatorlari nusxalanmaydi, hujjat nusxasi R2 reyestridan).
