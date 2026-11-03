# L0 (lokal Claude) ↔ Claude@cloud — ishlash kelishuvi

**Sana:** 2026-10-28 · **Holat:** KELISHILGAN (L0: PR #183 izohi 2026-10-28 18:09 UTC; cloud: PR #183/#188 izohlari).
**Sabab (egasi):** «lokal va san o'rtangda ko'p ishlarda nomutanosiblik bor … keyingi agent ishi oldingisidan bexabar, bir-birini ustidan bosib oldingi ishni yo'q qilayapti» → «lokal agent bilan aniq to'xtam va rejaga kelishing».

Har yangi agent sessiyasi (L0, cloud, Codex) ish boshlashdan oldin shu faylni o'qiydi.

## 1. Yo'llar (kim qaysi fayllarga egalik qiladi)
| Agent | Egalik | Tegmaydi |
|---|---|---|
| **L0 (Claude, egasining noutbuki)** | F2 import / F2 tarix / F2 portfel (oylik hisobot, texnadzor bosqichi), F3, to'lov/sverka, moliya, nakrutka, Nakopitelniy hisob mantiqi, smeta import (`smeta-anatomiya`, `SmetaYuklaNative`, `nakrutka*`, `res-kategoriya`); migratsiyalarni prodga qo'llash; Obsidian; `AGENTS.md` | — |
| **Claude@cloud** | mindmap (A2 bog'lash → A3 holat/qatlamlar → B2 real vaqt), tizim xaritasi, QQS ko'rinishi (`QiymatUchlik`/`SummaJuft` ko'rinish qatlami), jadval filtrlari (`umumiy/jadval-filtr`), ekran/joylashuv, umumiy dizayn | `admin/sahifalar/F2*`, `f2-import-parse/*`, sverka, moliya, L0 ning ochiq ishidagi smeta import fayllari |
| **Codex** | faqat `warehouse` / `ombor` (C11) | qolgan hammasi |

## 2. Umumiy fayllar — faqat qulf bilan
`lib/nav/navReestr.ts`, `lib/nav/navFiltr.ts`, `functions/api/sb.ts`, `functions/api/sb-yoz.ts`, `admin/AdminShell.tsx`, `dizayn/firuza.css`, `index.css`, `umumiy/ui/SummaJuft.tsx`, `umumiy/ui/QiymatUchlik.tsx`, `public/yangiliklar.json`, `lib/sayt-xaritasi/generated.ts`, `ops/mailbox/INBOX.md`, `ops/ACTIVE_TASKS.json`.
- Tegishdan oldin: `ops/ACTIVE_TASKS.json` da qulf (`owns`) + `INBOX.md` da bir qator.
- Qulf boshqada bo'lsa — kutiladi yoki egasi bilan kelishiladi.
- `generated.ts` — faqat `npm run site-map:generate` bilan (qo'lda emas).
- `yangiliklar.json` — har PR o'z yozuvini qo'shadi; id to'qnashsa merge qiluvchi (L0) tuzatadi.

## 3. Bir vaqtda
- Har agentda **≤ 2 ochiq PR**; umumiy fayllarga tegadigani — bittadan.
- Yangi ish — oldingi PR merge bo'lgandan keyingi **eng yangi main**'dan, yangi branch'da.
- Ochiq PR'lar bir xil fayllarga tegsa — oldindan **zanjir** (har biri oldingisi ustida, base = oldingi branch) qilinadi, to'qnashuvlar ikkala tomonni saqlab hal qilinadi.

## 4. Ish boshlashdan oldin (majburiy)
1. Ochiq PR'lar ro'yxati.
2. `ops/ACTIVE_TASKS.json` va `ops/mailbox/INBOX.md`.
3. `git log origin/main -10`.
4. Shu fayl.

## 5. Merge
- Merge qiluvchi — **L0**. Usul — **merge commit** (squash emas), shunda zanjirdagi keyingi PR'lar to'qnashuvsiz qoladi.
- Har merge'dan keyin keyingi PR base'i `main` ga o'zgartiriladi; CI yashil bo'lsa merge.
- PR tayyor bo'lgach muallif PR izohida qisqa test natijasini yozadi va draft'dan chiqaradi.

## 6. Migratsiyalar
- Muallif: fayl + `.rollback.sql` + `.acceptance.sql` (sintetik, `BEGIN … ROLLBACK`).
- **Faqat L0** prodda sinaydi, qo'llaydi, `schema_migrations` ga yozadi. Qo'lda (SQL Editor) qo'llash yo'q.

## 7. Egasi talablari — yagona manba
- Kanonik: Obsidian (L0 yuritadi).
- Cloud'da `anvar-brain` ruxsati yo'q: cloud yangi talab/qarorlarni `docs/product/EGASI_TALABLARI_*.md` ga yozadi, L0 shu kunning o'zida Obsidian'ga ko'chiradi.
- Egasi cloud'ga `anvar-brain` ruxsatini bersa — cloud to'g'ridan-to'g'ri yozadi.

## 8. Javob muddati
- L0 cloud'ning PR izohlariga **shu kunning o'zida** javob beradi. Javob kechiksa, cloud egasiga yozadi.
- Cloud L0 izohlariga keyingi uyg'onishda (PR hodisasi) javob beradi.

## 9. Xavfsizlik va maxfiylik
- PR, izoh, commit'larga haqiqiy summa, INN, kontragent nomi yozilmaydi; testlarda faqat sintetik raqamlar.
- Egasining doimiy qoidalari: NULL ≠ 0; rasmiy hujjatlar rus tilida; **obyekt qiymati QQS bilan — asosiy** (2026-10-27; `AGENTS.md` §2b ni L0 #183 merge'dan keyin yangilaydi).

## 10. Joriy navbat (2026-10-28)
1. L0 zanjirni merge qiladi: **#183 → #185 → #187 → #186 → #188** (#188 migratsiyasi avval prodga).
2. Zanjir yopilgach cloud: mindmap **A2** (tugunlarni bog'lash) → **A3** → **B2**.
