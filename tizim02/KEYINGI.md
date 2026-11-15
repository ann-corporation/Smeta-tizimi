# TIZIM_02 — KEYINGI ISHLAR NAVBATI

> ⚠️ **BU FAYL AVTOMAT YASALADI.** Qo'lda tahrirlamang —
> `node tizim02/registr.gen.cjs` uni qayta yozadi.
> Tasnifni o'zgartirish uchun `tizim02/tasnif.json` ni tahrirlang.

Umumiy holat: **90%** — 136 tayyor · 8 qisman · 11 boshlanmagan (ko'chiriladigan 155 tadan). 107 ta GASda qoladi, 10 ta umuman kerakmas — ular foizga KIRMAYDI.

## Domenlar — qiymat tartibida

| # | Domen | Egasi | Qatlam | Holat | Tayyor | Qisman | Qoldi |
|---|---|---|---|---|---|---|---|
| 1 | **smeta** | 🔵 claude | SUPABASE | 100% | 17 | 0 | 0 |
| 2 | **f2** | 🔵 claude ⏳ | SUPABASE | 88% | 11 | 1 | 1 |
| 3 | **hujjat** | 🔵 claude | GAS | 96% | 11 | 1 | 0 |
| 4 | **shartnoma** | 🔵 claude | SUPABASE | 90% | 12 | 3 | 0 |
| 5 | **buxgalteriya** | 🔵 claude | SUPABASE | 100% | 9 | 0 | 0 |
| 6 | **sklad** | 🟢 antigravity | SUPABASE | 100% | 3 | 0 | 0 |
| 7 | **faktura** | 🟢 antigravity | SUPABASE | 91% | 13 | 3 | 0 |
| 8 | **spravochnik** | 🟢 antigravity | SUPABASE | 100% | 6 | 0 | 0 |
| 9 | **erp** | 🟢 antigravity | SUPABASE | 100% | 17 | 0 | 0 |
| 10 | **grafik** | 🟢 antigravity ⏳ | SUPABASE | 100% | 4 | 0 | 0 |
| 11 | **hisobot** | 🟢 antigravity | SUPABASE | 100% | 6 | 0 | 0 |
| 12 | **kuzatuv** | 🟢 antigravity | SUPABASE | 100% | 1 | 0 | 0 |
| 13 | **sozlama** | 🟢 antigravity | SUPABASE | 100% | 18 | 0 | 0 |
| 14 | **kirish** | 🟢 antigravity | SUPABASE | 100% | 1 | 0 | 0 |
| 15 | **tizim** | 🟢 antigravity | SUPABASE | 100% | 7 | 0 | 0 |
| 16 | **kopruk** | ⚪ codex ⏳ | GAS | 0% | 0 | 0 | 10 |

## 🔵 claude — keyingi ish: `f2` (SUPABASE, 88%)

- `apiF2Bosliqlar` — `38_F2Nazorat.js:663`
- `apiF2Undo` — `39_F2Reestr.js:292` *(qisman: t2_akt_bekor (butun hujjat) yoki tuzatuvchi akt (manfiy hajm))*

## 🟢 antigravity — keyingi ish: `faktura` (SUPABASE, 91%)

- `apiFakturaAiParse` — `89_FakturalarNew.js:180` *(qisman: /api/ai-parse (bor, lekin faktura maxsus prompt hali yo'q))*
- `apiFakturaFaylYoz` — `89_FakturalarNew.js:108` *(qisman: /api/upload (R2) - sbFakturaFaylYoz hozircha mock)*
- `apiFakturaOCR` — `89_FakturalarNew.js:146` *(qisman: kutilmoqda)*

## Ko'chirilmaydiganlar

| Domen | Nechta | Qatlam | Nega |
|---|---|---|---|
| `ai` | 28 | GAS | Drive/Sheets/Excel ga bog'langani uchun GASda QOLADI. Ko'chirilmaydi — qayta yozish yo'qotish demak. |
| `fayl` | 8 | GAS | Drive/Sheets/Excel ga bog'langani uchun GASda QOLADI. Ko'chirilmaydi — qayta yozish yo'qotish demak. |
| `kesh` | 5 | YOQ | Ko'chirilmaydi: Sheets keshi, diagnostika yoki Tizim_02 da keraksiz bo'lgan narsa. |
| `dvigatel` | 11 | GAS | Drive/Sheets/Excel ga bog'langani uchun GASda QOLADI. Ko'chirilmaydi — qayta yozish yo'qotish demak. |
| `navbat` | 7 | GAS | Drive/Sheets/Excel ga bog'langani uchun GASda QOLADI. Ko'chirilmaydi — qayta yozish yo'qotish demak. |
| `tashxis` | 3 | YOQ | Ko'chirilmaydi: Sheets keshi, diagnostika yoki Tizim_02 da keraksiz bo'lgan narsa. |

