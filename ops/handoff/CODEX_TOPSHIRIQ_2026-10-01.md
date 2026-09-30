# Codex uchun topshiriq — 2026-10-01 (Claude'dan, egasi uxlayapti)

Repo: `ann-corporation/Smeta-tizimi` (GitHub). Supabase `tuoyrzadkgoltpqkdiyx`. Deploy: `main` ga push = Cloudflare Pages.

## 0. Avval o'qing (token tejash — Obsidian asl bosh manba)

1. `AGENTS.md` (boot protokoli) → `ops/ACTIVE_TASKS.json`.
2. Obsidian (`D:\Obsidian\Anvar_Brain`): `80_SYSTEM/ai/AGENT_START_HERE.md` ("ASL BOSH MANBA" bo'limi) →
   `20_PROJECTS/Smeta-tizimi/EGASI_QARORLARI_2026-10-01.md` → `HANDOFF.md` → `SMETA_ANATOMIYA.md` → `TIZIM_MAQSADI.md`.
   Vault ko'rinmasa — shu fayl va `ops/handoff/` yetarli.
3. Ish tugagach: Obsidian `AGENT_LOG.md` (yuqoriga yangi yozuv), `CURRENT_STATE.md`, `HANDOFF.md` ni yangilang.

## 1. Ish bo'linishi (fayllar KESISHMASIN)

| Kim | Vazifa | Egallagan fayllar |
|---|---|---|
| **Claude** | C2 АОСР/laboratoriya/logo/kolontitul; mindmap; nakrutka podval konstruktori | `lib/aosr-export.ts`, `api/t2-aosr.ts`, `test02/TestAosr.tsx`, `lib/hujjat-yozuvchi/rasmiy.ts` (kolontitul), `test02/Graf*.tsx`, `test02/TestXarita.tsx`, `lib/nakrutka-podval.ts` va nakrutka UI, `functions/api/sb-yoz.ts` (ijro bloki) |
| **Codex** | A, B, C (pastda) | pastda har vazifada |

`functions/api/sb-yoz.ts` va `functions/api/sb.ts` umumiy — kerak bo'lsa **alohida blok** qo'shing, tez-tez `git pull --rebase`, konflikt bo'lsa Claude blokiga tegmang.
`ops/ACTIVE_TASKS.json` ga o'z vazifangizni `owns` bilan yozing (Claude yozuvlari: `T2-IJRO-AOSR-LAB-001`, `MINDMAP-GRAF3D-001`).

## 2. Umumiy qonunlar

- NULL ≠ 0; taxmin yo'q; manba qiymati o'zgartirilmaydi. Real smeta fayllari repoga qo'yilmaydi — testlar sintetik.
- Izoh/hisobot o'zbekcha, hujjatlar ruscha. Hujjat standarti: `docs/architecture/HUJJAT_STANDARTI_V1.md`.
- Smeta/Excel o'qish — faqat `lib/smeta-anatomiya` va `lib/smeta-model.ts` orqali (yangi o'quvchi yozilmaydi — anatomiyaga o'rgatiladi). Egasi: zaxira yo'llar **o'chirilmaydi**, lekin kerakli qismlari asosiy modulga ko'chiriladi.
- Migratsiya: faqat additiv, `.rollback.sql` + `.acceptance.sql` bilan. **Production'ga siz qo'llamang** — faylni yozing, ACTIVE_TASKS/Obsidian'da "Claude qo'llasin" deb belgilang (Claude Supabase MCP bilan tranzaksiyada sinab qo'llaydi).
- Gate'lar (hammasi yashil bo'lsa `main` ga push mumkin): `npx tsc -b`, `npx tsc -p tsconfig.functions.json --noEmit`, `npx oxlint src`, `npm run tekshir`, `npm run build`, `npx vitest run` (og'ir perf testlari yuk ostida flaky — alohida qayta yurgizing), `node ops/governance-check.cjs`. Push'dan keyin Cloudflare check-run: `https://api.github.com/repos/ann-corporation/Smeta-tizimi/commits/<sha>/check-runs` → `conclusion: success`.
- Parol/cookie kiritmang. Isbotlanmagan narsani "tayyor" demang — UNKNOWN deb yozing.

## 3. Codex vazifalari

### A. Suniy Ko'l (obyekt 84) dublikatlari — TIZIMLI tuzatish (egasi Q8)
Egasi: "bir marta qo'lda to'g'rilash emas — production'da to'lovchi mijozda bunday bo'lmasligi kerak".
Holat: 2 413 vedomost qatori ish sifatida ikki marta (`ops/handoff/PTO_EGASI_QARORLARI_2026-09-25.md` Q7).
1. Sababni kod bilan toping: import konveyeri (SmetaYuklaNative → anatomiya → server RPC), qayta import, svod + lokal smeta bir vaqtda, RESURS_VEDOMOST ning ish sifatida kirishi.
2. Tizimli himoya: import idempotent bo'lsin (bir fayl/varaq qayta yuklansa dublikat emas — yangi revision yoki rad), vedomost varaqlari ish sifatida import qilinmasin (anatomiya varaq turini biladi), server tomonda dublikat qo'riqchisi (unique/tekshiruv RPC).
3. Mavjud ma'lumot: dry-run SQL (nechta qator, qaysilar, qaysi biri qoladi) + tuzatish migratsiyasi + rollback. **O'chirish/qayta yozish — Claude orqali egasiga dry-run ko'rsatilgach.**
4. Sintetik test: bir faylni ikki marta yuklash → dublikat yo'q.
Fayllar: `lib/smeta-anatomiya/*` (import qismi), `admin/sahifalar/SmetaYuklaNative.tsx`, yangi migratsiya `2026110510xxxx_t2_import_dublikat_*`.

### B. БЕЗ СКЛАД kategoriyasi (egasi Q1)
Qoida: omborda saqlab bo'lmaydigan, kelishi bilan darhol ishlatiladigan materiallar — **tovar beton** (mikserda keladi), beton qorishmalari, rastvor (строительный раствор), asfaltobeton va shu mantiqdagilar. Tasnif: kalit-so'z qoidasi + operator qo'lda tuzata oladi.
1. `smeta-model` / resurs tasnifida `БЕЗ СКЛАД` kategoriyasi (T2 da hozir yo'q; F2 tasdiqlangan toifalarda bor: ЧЕЛ, МАШ, МАТ, ОБ, БЕЗ СКЛАД, М/К, ПРОВОД). T1 dagi `KW_BEZSKLAD` ro'yxati manba bo'lishi mumkin (`Smeta tizimi/` GAS kodi).
2. Kalit so'zlar alohida modulda (sozlanadigan), sintetik testlar bilan (beton B25 → БЕЗ СКЛАД; "бетонные блоки" → МАТ, ya'ni saqlanadigan buyum emas!).
3. Nakrutka ta'siri: БЕЗ СКЛАД ga ombor (склад) ustamasi qo'llanmasligi kerak. `lib/nakrutka-podval.ts` ni **Claude** egallagan — siz faqat kategoriyani bering va qaysi joyda iste'mol qilinishini ACTIVE_TASKS/Obsidian'da yozing; Claude podvalga ulaydi.
4. Kerak bo'lsa DB: resurs kategoriyasi check constraint'iga 'bez_sklad' (additiv migratsiya, Claude qo'llaydi).

### C. Sayt xaritasi paneli (egasi Q9)
Egasi: "saytning bir chiziqli, aniq ko'rinadigan xaritasi — nimadan nima oladi hammasi aniq bo'lsin; rivojlanish davomida har o'zgarish xaritada aks etsin".
1. Manba — kod: `src/App.tsx` marshrutlari, `admin/AdminShell.tsx` menyusi, `functions/api/sb.ts` o'qish ro'yxati, `functions/api/sb-yoz.ts` amallari. **Qo'lda chizilgan rasm emas** — build/test vaqtida koddan yig'iladigan manifest (`src/lib/sayt-xaritasi/manifest.ts` yoki generator skript) + test: yangi marshrut/amal qo'shilsa, manifestda bo'lmasa test yiqiladi (xarita doim yangi bo'lishi shu bilan kafolatlanadi).
2. Har sahifa uchun: nomi, yo'li, qaysi jadval/view'dan o'qiydi, qaysi amal bilan yozadi, qaysi hujjatlarni chiqaradi, qaysi sahifaga ma'lumot beradi.
3. Panel: `/admin/sayt-xaritasi` — bir chiziqli oqim (masalan: Smeta yuklash → smeta modeli → Fakt → F2 → Nakopitelniy → F3 → To'lov), bosilganda tafsilot. Vazmin dizayn (egasi rang-barang "kamalak"ni yoqtirmaydi — bitta urg'u rang).
4. Obsidian'da `20_PROJECTS/Smeta-tizimi/SAYT_XARITASI.md` — xuddi shu manifestning odam o'qiydigan qisqa varianti.

Tartib: **C → B → A** (C tez va xavfsiz; A eng og'ir, migratsiya talab qiladi). Har vazifa alohida commit, gate'lar yashil bo'lsa push.
