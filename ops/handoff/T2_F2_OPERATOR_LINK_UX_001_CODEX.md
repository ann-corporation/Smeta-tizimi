# T2-F2-OPERATOR-LINK-UX-001 — handoff

Holat: `READY_FOR_REVIEW` — operator Workbench UI va hisob-tahlil qatlami tayyor; 30k importning asosiy oqimda bajariladigan bosqichlari esa alohida F2-IMPORT lane egasida qoladi.

## Branch va scope

- Branch: `codex/f2-link-review-ux-v1`
- Bazaviy `HEAD`: `1c4bfc2fe200794fa1f2b4e545b761a59f8f016d` (`origin/main` fetch qilinganda ham shu SHA edi)
- Production/main o‘zgarishi: yo‘q
- O‘zgartirilgan mahsulot yo‘li: faqat `F2V3Workbench.tsx`; import parser/matcher va API/back-endga tegilmadi.

## Qilingan ish

- F2 va smeta daraxtlari yonma-yon, virtual ro‘yxatda ko‘rsatiladi. UI hamma qator uchun tugun holatini hisoblaydi, lekin DOM faqat virtualizer bergan ekrandagi qatorlarni chizadi.
- Har ikkala daraxtda hammasini ochish/yopish, mavjud har bir sathni alohida ochish/yopish, qator bo‘yicha ochish/yopish bor.
- F2 qatoridan nomzod tanlash, aniq qatorni bog‘lash/uzish va smeta qatoridan bog‘lash/uzish mumkin. Takliflar operator tasdig‘isiz canonical qarorga aylantirilmaydi.
- Filtrlar: tekshirilmagan, bog‘lanmagan, muammoli, barcha qatorlar; qidiruv natijasi 500 qator bilan chegaralangan.
- Nomzod uchun “moslik foizi” dalil qatlamlaridan normallashtirilgan indeks; ehtimollik ham, avtomatik tasdiq threshold’i ham emas. Zaif `hajm`/`tartib` dalillari foizni oshirmaydi; birlik nomuvofiqligi 0 indeks beradi; dalil breakdown bo‘lmasa `—`.
- F2 manba qatorlari yig‘indisi, F2 hujjat footer’i, operator tasdiqlagan summalar, taklif/bog‘lanmagan/chiqarilgan summalar alohida. Ma’lum bo‘lmagan summa `0` deb ko‘rsatilmaydi; to‘liq bo‘lmagan manbadan tafovut/qamrov foizi chiqarilmaydi.
- F2 tasdiqlangan summa smeta bazaviy qiymatidan alohida taqqoslanadi; bu taqqoslash F2 manba qiymatini mutatsiya qilmaydi.
- Ko‘p qator yig‘indisida Kahan kompensatsiyali yig‘indi ishlatiladi.

## Qayta ishlatiladigan kod

- `frontend/src/lib/f2-link-review/tree.ts` — preorder, ancestor-preserving flatten; sathni ochish/yopish helperlari.
- `frontend/src/lib/f2-link-review/compatibility.ts` — dalillarga asoslangan 0–100 indeks; ehtimollik emas.
- `frontend/src/lib/f2-link-review/reconciliation.ts` — NULL-safe F2 summa/qamrov/taqqoslash modeli.
- `frontend/src/admin/sahifalar/F2V3Workbench.tsx` — real `/admin/f2` V3 Workbench ko‘rinishi.

## Legacy T1 tekshiruvi va aniqlangan xavf

- Ko‘rilgan manbalar: `Smeta tizimi/35_F2Moslash.js`, `Smeta tizimi/Panel.html` (`f2Imp*` oqimi), `docs/architecture/F2_IMPORT_V3.md`.
- Foydali operator patternlari: razdel/doira doirasida qidirish; kod/kanon → nom+birlik → qat’iy fuzzy; birlik va marka qalqoni; noaniq nomzodni operatorga qoldirish; F2 va LRVni ikki oynada ko‘rsatish; har qatorda bog‘lash/uzish va qoldiqni ko‘rsatish. Fuzzy threshold va T1 Sheets/GAS yozuv mexanizmi canonical qoida sifatida ko‘chirilmagan.
- **F2-IMPORT lane P0 tekshiruvi:** `frontend/src/lib/f2-moslash-v3/index.ts` dagi ekvivalent “egizak” nomzodlar shoxi `usul: 'tartib'` bilan eng birinchi bo‘sh smeta qatorini `holat: 'aniq'` qilib yozadi. Bu `docs/architecture/F2_IMPORT_V3.md` §2 dagi “aniq faqat yagona nomzodda; teng nomzodlar taklif bo‘lib qoladi” shartiga zid ko‘rinadi. F2-IMPORT-V3-001 egasi buni reorder/duplicate golden test bilan hal qilmaguncha noaniq duplicate qatorlarda auto-confirmed linking’ni xavfsiz deb bo‘lmaydi. Ushbu branch matcher fayliga tegmagan.

## 30k qator: isbot va chegarasi

**Isbotlangan:** Workbench renderer’ining 30,000 ta F2 bargi + 30,000 ta smeta bargidan tashkil topgan stress testi bor; mock viewport har daraxtdan faqat 24 virtual qator beradi va komponent shu chegaradan oshiq qatorni DOM’ga mount qilmasligi tekshiriladi. Pure tree helper uchun 50k flat-row test ham bor. Bu daraxt ko‘rsatish qatlamining xotira/DOM hajmini chegaralaydi.

**Hali kafolatlanmagan:** 30k import butunlay muzlamasligini ushbu UI branchi isbotlamaydi.

- `frontend/src/lib/f2-import-parse/xlsxFonda.ts` XLSX o‘qishni Worker’da bajaradi; mavjud perf testi 27k qatorni 764ms o‘qiganini va `f2AktlarniOqi` anatomiya bosqichi 334ms olganini qayd etadi (test muhiti, production browser SLA emas).
- `frontend/src/admin/sahifalar/F2ImportV3.tsx` ichida `f2AktlarniOqi(...)`, `f2Indeks(...)`, `smetaIndeks(...)`, `smetaQatorlari(...)` va `f2MoslashV3(...)` main thread’da bajariladi. Ayniqsa `malumotYukla` matcher’ni chaqiradi, Worker/progress/cancel/checkpoint yo‘q.
- Mavjud matcher benchmarki ~52,800 barg qator uchun Vitest/Node’da 1,260ms qayd etgan. Bu brauzerda shu vaqtni vaqti-vaqti bilan boshqariladigan tasklarga bo‘lish yoki Worker’da bajarish zarurligini bartaraf qilmaydi.
- Fayl oqimi `file.arrayBuffer()` bilan butun XLSX’ni xotiraga oladi; `readXlsxFonda` uzatishdan oldin buffer nusxasini oladi. Upload max fayl chegarasi 50 MiB. 30k qator uchun real xotira/xlsx hajmiga bog‘liq sinov va resumable checkpoint bu scope’da yo‘q.

Shu sabab aniq status: **30k daraxt UI — PASS; 30k end-to-end import resilient/no-freeze — PARTIAL, review/development required.** Keyingi egasi import parsing/anatomiya/index/matcher pipeline’ini Dedicated Worker yoki resumable chunked worker job’ga ko‘chirishi, progress/cancel/error/retry holatlarini qo‘shishi, Worker yo‘q paytda katta faylni yashirincha main thread’da ishlatmasligi va real 30k synthetic XLSX/browser testini kiritishi kerak. Bu `F2-IMPORT-V3-001` owns fayllarida amalga oshiriladi.

## Verifikatsiya

- Fokuslangan Workbench + pure suite: **4 test file, 18 test PASS**.
- To‘liq Vitest: **115 file PASS, 6 skipped; 725 test PASS, 12 skipped**. Shu suite ichidagi mavjud perf dalillar: F2 matcher ~52.8k/1,260ms; XLSX reader ~27k/764ms + anatomiya/parse ~334ms.
- `node node_modules/typescript/bin/tsc -b --pretty false`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS; buildda mavjud `/grid.svg`, katta bundle va ineffective dynamic import ogohlantirishlari qoldi.
- `npm run tekshir`: PASS (`Barcha tekshiruvlar o'tdi`; ayrim suite’lar o‘zining 38/61/20 check natijalarini ham ko‘rsatdi).
- `node ops/governance-check.cjs`: PASS; checker `CURRENT_STATE.md` dagi main SHA yozuvi stale ekanini ogohlantirdi (`d7b9bba` qayd etilgan, tekshirilgan `origin/main` `1c4bfc2`).
- `git diff --check`: PASS.
- Authenticated real XLSX/browser smoke: **NOT RUN**. Production deploy: **NOT APPLIED**.

## Fayllar

- `frontend/src/admin/sahifalar/F2V3Workbench.tsx`
- `frontend/src/admin/sahifalar/F2V3Workbench.operator.test.tsx`
- `frontend/src/lib/f2-link-review/compatibility.ts` (+ test)
- `frontend/src/lib/f2-link-review/reconciliation.ts` (+ test)
- `frontend/src/lib/f2-link-review/tree.ts` (+ test)
- `ops/ACTIVE_TASKS.json`
- `ops/handoff/T2_F2_OPERATOR_LINK_UX_001_CODEX.md`

## Integratsiya tartibi

1. Avval F2-IMPORT-V3-001 egasi duplicate/order auto-confirm branchini architecture sharti bilan moslab, noaniq duplicate/reorder golden testlarni yashil qilsin.
2. Import orchestration Worker/resumable job yo‘li bilan main-thread parse/index/match muzlashini bartaraf etsin va 30k synthetic XLSX browser smoke bersin.
3. So‘ng bu Workbench UI diff’ini yangi canonical import contractiga moslab integratsiya qiling; bu branchning hisob/taklif modeli matcher’ni avtomatik tasdiqlamaydi.
4. Owner bilan authenticated Preview smoke: real 30k qatorli Smeta + F2, qidiruv/virtual scroll, qavat toggle, bog‘lash/uzish, noaniq duplicate, to‘liq summa taqqoslash.
