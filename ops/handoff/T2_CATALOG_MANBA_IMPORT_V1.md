# T2 CATALOG MANBA IMPORT V1 — handoff

## Holat

**STATUS: SOURCE_READY — PRODUCTIONGA QO‘LLANMAGAN**

- Branch: `codex/t2-catalog-import-v1-source`
- Source checkpoint: `7d6b3d2f56ea2eabc399a943017895422f6ce472`.
- Follow-up implementation commit: `1c8760f1d5cc2b11635b10c9add3a089aded135a`.
- Base: `4221d6dfa508fb9b5c0e7f7c5f013bb0904a1c47`
- Production Supabase migration: qo‘shilmadi va qo‘llanmadi.
- Production Cloudflare/GAS/Drive konfiguratsiyasi: o‘zgartirilmadi.

## Maqsad va canonical chegara

Bu paket material katalogi, ish haqi katalogi va mashina-soat manbalarini operator tasdig‘i bilan tahlil qilib, mavjud `t2_narx_manba` / `t2_narx_manba_qator` modeliga source-only dalil sifatida yozadi.

`t2_narx`, smeta narxi, Fakt yoki tasdiqlangan F2 avtomatik o‘zgarmaydi. Fayl nomi va Excel qator raqami canonical identity emas; `sourceKey` deterministik manba fingerprinti, `manbaQatori` esa faqat audit lokatori.

## Reusable kod

- `frontend/src/lib/catalog-manba-import/types.ts` — typed contractlar: `CatalogTahlil`, `CatalogQator`, `CatalogDavr`, `CatalogManbaTuri`, narx variantlari va period konfliktlari.
- `frontend/src/lib/catalog-manba-import/parse.ts` — `.xls/.xlsx/.xlsm` tahlili; salary/material sheet aniqlash; NDS/base/social narx variantlarini ajratish; `NULL` narxni 0 ga aylantirmaslik; source provenance; mashina-soat text parser.
- `frontend/src/lib/catalog-manba-import/pdf.ts` — mavjud `pdf-parse` adapteri; PDF’ni faqat text-table sifatida o‘qiydi, ishonchli satr topilmasa `PDF_TEXT_TABLE_UNRESOLVED` qaytaradi.
- `frontend/src/lib/catalog-manba-import/index.ts` — public export.
- `frontend/src/admin/sahifalar/KatalogManbaImport.tsx` — `/admin/narxlar` ichidagi multi-file preview → explicit confirmation → chunked source import paneli.
- `frontend/src/admin/sahifalar/NarxlarNative.tsx` — panelni native Narxlar sahifasiga ulaydi.
- `frontend/src/lib/narx-dalil/semantik.ts` — source-row nomzodlarini kod/birlik/kategoriya/token-ildizlari bo‘yicha deterministik topadi; top-5 taklif, moslik foizi va smeta/manba narxi farqini hisoblaydi. Bu faqat taklif, narxni yozmaydi.
- `frontend/src/api/t2-narx-dalil.ts` — canonical source rows, source metadata va dalil holatini o‘qish porti; operator tasdig‘i `sbNarxDalilBogla` orqali yoziladi.

## Operator workflow

1. Bir yoki bir nechta `.xls/.xlsx/.xlsm/.pdf` tanlanadi.
2. Har bir fayl va har bir varaq alohida tahlil qilinadi.
3. Fayl nomi bilan varaq davri farq qilsa `PERIOD_CONFLICT` ko‘rsatiladi va alohida checkbox tasdig‘isiz import bloklanadi.
4. Preview’da turi, davri, varaq soni, qatorlar, narxli qatorlar va warnings ko‘rsatiladi.
5. Operator “Tahlilni tasdiqlash va manbalarni saqlash”ni bosgandagina yozish boshlanadi.
6. Mavjud `narxManbaniYukla` 5 000 qatorlik bo‘laklarda `t2_narx_manba_yoz_v1` ga yuboradi.
7. Shu content hash qayta tanlansa `DUPLICATE_SOURCE` bilan bloklanadi; batch ichidagi takror ham bloklanadi.

## Aniqlash qoidalari

### Ish haqi

`Регионы`, ishchi nomi, `чел.-ч` va narx ustunlari bo‘yicha aniqlanadi. `ОСНОВНАЯ ЗАРПЛАТА`, `Социальные ... 12%`, `25%` kabi variantlar alohida source rows bo‘ladi. Bo‘sh yoki `-` narx `NULL`; u 0 deb talqin qilinmaydi. Fayl nomidagi kvartal emas, varaq/header davri row provenance uchun ustun.

### Material katalogi

Nom/kod/birlik va narx sarlavhalari asosida aniqlanadi. NDS bilan va NDSsiz narxlar bitta qiymatga ezilmaydi; alohida `narxVarianti` sifatida saqlanadi. Narxsiz qator warning bilan qoladi, o‘chirib yuborilmaydi.

### Mashina-soat PDF

`МАШ.-Ч`, nom va narx patternlari bo‘yicha text-table parser ishlaydi. Sahifa raqami provenance sifatida qayd qilinadi. PDF’ning (2), (3), (4) fayllari bir xil SHA-256 bo‘lib, takror manba sifatida qayd etilishi kerak.

## Real fayl audit dalillari

- `Иш хаки 2-кв 2026 йил.xls`: 4 varaq, 120 qator, 90 narxli; `asosiy` + `ijtimoiy_12`; filename Q2 bo‘lsa ham varaq davrlarida konfliktlar bor — yashirilmaydi.
- `Иш хаки 2025 йил 4 квртал.xls`: 4 varaq, 120 qator, 120 narxli; `ijtimoiy_25` + `ijtimoiy_12`; filename va varaqlar o‘rtasidagi farqlar warning.
- `Иш хаки 2023 йил.xls`: 4 varaq, 112 qator, 70 narxli.
- `Иш хаки 2022 4кв.xls`: 16 varaq, 446 qator, 446 narxli; tarixiy varaq davrlari bor.
- `Иш хаки 2023 4кв.xls`: 20 varaq, 566 qator, 566 narxli; `asosiy`, `ijtimoiy_12`, `ijtimoiy_25` variantlari bor.
- `цена маш.час на 01.01.2026.pdf`: 31 sahifa; parser 654 qatorni topdi, 654 tasi narxli.
- `(2)`, `(3)`, `(4)` machine-hour fayllari: `F128854FC416CBD1AC36374ADAA3F3CB383A0132162397A701350D52957C7780` — bir xil nusxalar.
- `Машин и механизмов на 01.01.2025г..pdf`, `маш-час каталок 2023.pdf`, forecast PDF: parser uchun alohida source candidates; avtomatik biznes qiymatiga aylantirilmaydi.

## Test va gate dalillari

- Focused: `npm exec vitest run src/lib/catalog-manba-import/parse.test.ts src/lib/catalog-ingest` — **2 fayl, 9 test PASS**.
- `npm exec tsc -- -p tsconfig.app.json --noEmit` — **PASS**.
- `npm run build` — **PASS**; frontend va `tsconfig.functions.json` typecheck ham ishladi. Build’da mavjud `/grid.svg` va katta chunk warninglari bor.
- `npm run lint` — exit 0; repository bo‘yicha mavjud warninglar bor.
- `npm run tekshir` — **PASS**, barcha statik guardlar o‘tdi.
- `node ops/governance-check.cjs` — **PASS**; faqat CURRENT_STATE’dagi main SHA eski ekanligi warning.
- `git diff --check` — **PASS**.
- Full Vitest: **125 passed, 5 failed, 6 skipped** test files; **816 passed, 5 failed, 12 skipped** tests. Yiqilganlar katalog parseridan emas: uchta eksport testi timeout, 50k matching benchmark 15s limitdan oshdi, 30k matching benchmark 20s limitdan oshdi.

## Integrator uchun ochiq ishlar

1. Bu source rows’larni canonical binary fayl bilan bog‘lash uchun original XLS/PDF fayllarni private R2/document registry orqali saqlash adapteri kerak. Hozir hash/provenance metadata yoziladi; fayl binary archive’iga claim qilinmaydi.
2. Production Supabase’da mavjud `t2_narx_manba_yoz_v1` migratsiya/acceptance holati alohida tekshirilib, kerak bo‘lsa owner approval bilan qo‘llanadi. Ushbu branch migration qo‘shmadi.
3. Narx markazi ichidagi yangi panelni release preview’da login bilan tekshirish kerak: varaq konflikt checkbox’i, duplicate hash, PDF preview, 5 000-row chunking, source-only yozuvlar, topilmagan resurslar uchun semantik katalog takliflari, moslik foizi va smeta/manba narxi farqi.
4. `mashina_soat` source type mavjud DB enum/domain mapping bilan mosligi production acceptance’da tasdiqlansin.
5. Narx source’larini keyin smeta/F2 narxiga qo‘llash faqat alohida approved price-basis workflow orqali bo‘lsin; importning o‘zi buni qilmasin.

## Narx topilmagan resurslar uchun yangi taklif qatlami

Oldingi native ekran faqat exact `t2_narx_taklif` ko‘rinishiga tayanganligi sababli nomi biroz farq qilgan, lekin katalogda mavjud resurs “topilmadi” bo‘lib qolishi mumkin edi. Follow-up qatlam:

- `t2_narx_manba_qator` source rows va faol manba metama’lumotini kompaniya chegarasida o‘qiydi.
- `narxSemantikNomzodlari` `kod` bo‘lsa exact matchni ustun qo‘yadi; aks holda birlik mosligi, kategoriya/manba turi va nom tokenlari bo‘yicha top-5 nomzod beradi.
- Ruscha ko‘plik/kelishik (`экскаваторы`/`экскаватор`, `гусеничном`/`гусеничный`) konservativ token ildizi bilan qamrab olinadi; umumiy token posting listlari 3 000 ta bilan cheklanib, brauzerga O(n²) yuk berilmaydi.
- UI har nomzodda manba narxi, smeta narxi, `+/- farq %`, moslik foizi va manba turini ko‘rsatadi.
- `Dalilni bog‘lash` operator harakatidir. U `t2_narx_dalil_holat`ga dalil bog‘laydi, smeta/Fakt/F2 narxini yashirin o‘zgartirmaydi. Shuning uchun narx hali yo‘q qator “topilmagan” ro‘yxatida qolishi mumkin, lekin “Dalil bog‘langan” statusini ko‘rsatadi.
- Birlik mos kelmasa yoki nomzod mazmunan yetarli bo‘lmasa taklif chiqmaydi; operator qo‘lda narx tanlashi kerak. Bu tizimni noto‘g‘ri narxni avtomatik yozishdan himoya qiladi.

## Follow-up regression evidence

- `frontend/src/lib/narx-dalil/semantik.test.ts`: renamed machine resource, unit normalization, above-estimate price variance and unrelated/unit-mismatch rejection — **3/3 PASS**.
- `frontend/src/lib/f2-import-parse/xlsxFonda.test.ts`: legacy BIFF8 `.xls` worker `postMessage` stack overflow regression; old `.xls` main-thread fallback — PASS.
- Combined focused run (`semantik`, `xlsxFonda`, catalog parser): **3 test files, 10/10 tests PASS**.
- `tsc -p tsconfig.app.json --noEmit`: PASS.
- `npm run build`: PASS (frontend + Functions TSC; existing `/grid.svg` and large-chunk warnings only).
- `npm run lint`: exit 0; repository-wide pre-existing warnings only.
- `npm run tekshir`: **62 checks passed, 0 failed**.
- `git diff --check`: PASS. Production DB/R2/GAS deploy remains NOT APPLIED.

## Obsidian / parallel agent eslatmasi

Claude yoki boshqa agent bu branchni integration base bilan cherry-pick qilganda faqat `7d6b3d2` checkpoint va ushbu handoffdagi 5 ta source/UI yo‘lini ko‘rsin. Dirty `G:\\Другие компьютеры\\Компьютер\\GAS` worktree’ga tegilmagan. Production deploy va production DB write bajarilmagan.
