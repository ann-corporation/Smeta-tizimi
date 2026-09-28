# F2-IMPORT-ROBUSTNESS-001

## Vazifa

Tizim1 F2 importerining isbotlangan operator skeletini saqlab, TIZIM_02 uchun
katta (30 000+ qator), ko‘p formatli F2 ↔ LRV importini tez, tushunarli va
moliyaviy jihatdan fail-closed qilish. Product Owner 2026-09-29 da Codex’ga
ushbu importer yo‘llarini qayta ishlash vakolatini berdi.

## Baza va ishchi ref

- Repo: `SQLI-DUMPER-CRACK-Link-1/Smeta-tizimi`
- Base: `origin/main` / `b36c552e0b8de22bb398f04ab851449a3e68b87f`
- Branch: `codex/f2-import-robustness-v1`
- Latest source-code checkpoint: `bbd128d7723c66f0e1f67fe0c8b00f71bf98cb45` on `codex/f2-import-robustness-v1`
- Checkpoint commits: `49119fb` (parser/matcher/30k), `749004d` (initial evidence), `ee931c9` (memory type/scope guard), `bbd128d` (RZ fallback with row evidence, explicit source-read review, technical specification conflict guards, truthful match-state counts, worker-side Blob read). Handoff itself is being updated after `bbd128d`; read branch tip from Git before integration.
- Worktree: `C:\Temp\f2-import-robustness-v1`
- Asosiy `G:\Другие компьютеры\Компьютер\GAS` papkasidagi dirty/human fayllar o‘zgartirilmaydi.

## T1’dan ko‘chiriladigan skelet

- F2 va LRV daraxtlarini yonma-yon to‘liq ko‘rsatish;
- har F2 qatori uchun aniq bog‘lash/bekor qilish va nomzodlar ro‘yxati;
- avval RZ/razdel doirasi, so‘ng kod-kanon, nom+birlik, resurs tarkibi dalillari;
- yagona dalilli nomzodgina avtomatik tasdiq; noaniq nomzod taklif bo‘lib qoladi;
- F2 jami ↔ qatorlar ↔ bog‘langan summa va qamrov foizi bo‘yicha ochiq nazorat;
- qo‘shimcha/zamena operator qarori bilan, eski canonical qatorni o‘zgartirmasdan.

T1 GAS, row number identity, Drive/Sheets truth, 6 daqiqalik timeout va
ishonchsiz “birinchi nomzodni ol” xulqi ko‘chirilmaydi.

## Joriy dalil va aniqlangan P0

- Main’da `F2V3Workbench` default `filtr='hal'`: allaqachon moslangan F2 qatorlari
  birinchi ko‘rinishda yashirinadi. Owner ko‘rgan “qator yo‘q” holatining kamida
  bir qismi shu UX sababli; default ko‘rinishni barcha qatorlar qilish yoki
  yashirishni aniq tushuntiradigan, ko‘rinadigan filtr holati talab qilinadi.
- 30k uchun parser va matcher Web Worker’dan chaqiriladi; bu asosiy threadni
  bo‘shatadi, lekin worker ichidagi algoritm murakkabligi, xotira va amaliy
  kechikish alohida o‘lchanishi shart.
- 2026-09-29 ko‘rilgan Fast Food importida manba summasi 239 200 683,38; faqat
  6 495 554,72 (2,72%) tasdiqlangan bog‘lanishda. 34 topilmagan, 4 taklif.
  Bu fayl qoralamasini tasdiqlashga yaroqli emas.
- Fast Food workbook’da ko‘rinadigan obyekt `КАРТИНГ`, boshqa texnik maydonda
  `Fast food 1этаж`: ziddiyat jim qabul qilinmay, review sifatida ko‘rsatilishi kerak.
- Manba F2’larda varaq nomi turini kafolatlamaydi: “искусственное озера”dagi
  akt `тротуар (3)` varag‘ida; Amfiteатр faylida LRV, NARXLAR va boshqa varaq bor.
- T1 matching manbasi: `Smeta tizimi/35_F2Moslash.js`, UI: `Panel.html` `f2Imp*`.
  T2 adapterlarining parent-RZ, takroriy qator, resurs child va confidence
  holatlari korpusda sinovdan o‘tkazilsin.

## Majburiy qabul mezonlari

1. Har workbook/varaq roli mazmunli dalillar bilan aniqlanadi; ko‘p akt varaqlari
   bo‘lsa operator tanlaydi, hech biri jim tashlanmaydi.
2. BL/RS/MAT/OB va ichma-ich RZ qatorlari source location bilan saqlanadi;
   formula cache yo‘qligi `0`ga aylantirilmaydi.
3. Matchlar company/project/object scope ichida; RZ, kod-kanon, birlik, marka,
   nom va resurs tarkibi alohida dalil. Confidence foizi inson qarori o‘rnini
   bosmaydi. Duplicate/egizaklar avtomatik tasdiqlanmaydi.
4. Har bir import qatori bog‘lash/bekor qilish/qo‘shimcha/zamena holatini ko‘radi;
   harakatdan keyin `operation_id`, stable source UID va qoralama tiklanadi.
5. Qator count, quantity, certified amount, document footer, confirmed,
   suggested, unbound, excluded alohida va o‘zaro reconcile qilinadi; NULL≠0.
6. Ikki daraxtda barcha qavatlarni ochish/yopish, barcha/hal qilinmagan/
   bog‘lanmagan/muammoli filter, qidiruv va virtualizatsiya ishlaydi; qaysi
   filter faol ekani doim ko‘rinadi.
7. 30k/50k synthetic benchmark: xotira/time o‘lchanadi, main thread bloklanmaydi,
   O(n²) taqqoslash yo‘q; cancel/resume/retry duplicate write qilmaydi.
8. Uchta owner fayli real read-only corpus sifatida tekshiriladi, fayllar repoga
   qo‘shilmaydi. Kutilgan formatlar va jamilarga qarshi JSON/fixture oracle bor.
9. Vitest, TypeScript, build, lint, `tekshir`, governance va diff-check natijalari
   qayd qilinadi. Production DB, real F2 import, `main` va production deploy bu
   vazifada o‘zgartirilmaydi.

## Fayl egaligi

`ops/ACTIVE_TASKS.json`da `F2-IMPORT-V3-001` superseded qilib,
`F2-IMPORT-ROBUSTNESS-001` Codex ownership/owns bilan qayd etildi. Faqat yangi
task owns yo‘llariga edit qilinadi. Tashqi auth/Cloudflare/Supabase production
write yo‘q.

## 2026-09-29 — izolyatsiyalangan F2 importer tekshiruvi

### Kod natijasi

- `smeta-anatomiya` T1 LRV_PLUS eksportidagi aniq `RZ/BL/RS/MAT/OB` markerini
  case-insensitive o‘qiydi. Markerli `MAT/OB` BL ishiga yutilmaydi; mustaqil
  material/uskunalar qatori saqlanadi. `RS` joriy BL ostida qoladi; egasiz RS
  yo‘qolmay, operator ko‘radigan review holatiga tushadi. Marker bo‘lmagan
  fayllarda mavjud sarlavha/raqam heuristikasi saqlangan.
- F2 daraxtida ichma-ich RZ va mustaqil resurslar manbadagi tartibda ko‘rsatiladi;
  miqdor/narx/summa manba qiymatlari qayta hisoblanmaydi va summalar bir marta
  yig‘iladi.
- Moslashtirishda aniq markerli qator turi canonical qator turiga mos bo‘lishi
  shart. `BL` markerli qator `MAT/OB`ga, `RS` esa `MAT`ga avtomatik ulanmaydi.
  Marker bo‘lmagan tarixiy qatorlarda eski leaf nomzodlari operatorga taklif
  bo‘lishi mumkin, ammo bu o‘zi avtomatik tasdiq mezoni emas.
- Oldingi davrning saqlangan match xotirasi ham joriy qator turi va operator
  tanlagan razdel chegarasini chetlab o‘ta olmaydi. Noto‘g‘ri tur yoki boshqa
  razdelga ishora qilgan xotira rad etilib, joriy dalillardan match qayta
  hisoblanadi.
- F2 Workbench boshlang‘ich filtri `Barcha qatorlar`; PTO avvaldan moslangan
  qatorlarni “ko‘rinmay qoldi” deb o‘ylamaydi. Ikkala daraxtning virtual
  renderi saqlangan, qator turining o‘zbekcha yorliqlari ko‘rsatiladi.

### Real fayllar — faqat lokal, read-only parse

Fayllar gitga qo‘shilmadi, tizimga yoki Supabase’ga import qilinmadi.

| Fayl | Parser kuzatuvi | Ehtiyot sharti |
|---|---|---|
| `Fast food 1этаж_LRV_PLUS (2).xlsx` | 6 BL, 59 RS, 7 MAT, 8 manbada aniq belgilangan RZ, 66 summali leaf; parser summasi 239 200 683,38; 10 manba-qatori/sarlavha review’da | Preview’da ilgari ko‘ringan 241 983 934,96 bilan farq bor. Workbook hash va serverdagi hujjat revisioni tengligi isbotlanmaguncha tafovut unresolved; qoralama tasdiqlanmasin. |
| `amfiteatr raschet.xlsx` | 50 BL, 450 RS, 56 MAT + 20 OB mustaqil resurs, 19 manbada belgilangan RZ; 526 summali leaf; parser summasi 3 004 484 761,41; 9 review bandi + 1 ko‘p-ustun sarlavha; 7 manfiy miqdor ogohlantirishi | Xom markerlarda 445 RS bo‘lgan: parser yana 5 RSni heuristik aniqlagan. Daraxt, qo‘shimcha qatorlar va jami operator ko‘rigini talab qiladi. |
| `искусственное озера (2).xlsx` | 62 BL, 492 RS, 28 MAT + 34 OB mustaqil resurs, 30 manbada belgilangan RZ; 554 summali leaf; parser summasi 6 962 663 411,71; 9 review bandi + 1 ko‘p-ustun sarlavha; 3 manfiy miqdor ogohlantirishi | 30 ta RZ markerining hammasida qisqa “ПОЛ” kabi nomlar ham saqlandi. Bu mazmuniy hierarchy tasdig‘i emas; daraxt va jami operator ko‘rigini talab qiladi. |

Bu natijalar parserning marker bilan ko‘rsatilgan RZ sarlavhalarini saqlashi,
mustaqil resurs/BL turini ajratishi va o‘qishda shubhali qolgan qatorlarni
operatorga chiqarishini tekshiradi; biznes tasdig‘i, canonical DB importi yoki
to‘liq RZ semantikasi isbotlangan degani emas. Avvalgi online kuzatuvdagi 6 495 554,72
tasdiqlangan summa yangi parserning read-only 239 200 683,38 summasi bilan ayni
tasdiq emas; Preview va lokal source hash/revision tenglashtirilmaguncha bu
tafovut unresolved va F2 qoralamasini tasdiqlashga asos bo‘lmaydi.

### 2026-09-29 — davomiy tekshiruv: T1 skeleti va qator-o‘qish halolligi

- Tizim1 `30_Panel.js`dagi markerli LRV_PLUS qatori uchun “nom ustuni bo‘sh
  bo‘lsa, data qismidagi nomzod sarlavhani izlash” skeleti tekshirildi. T2’da
  faqat aniq `rz` markerli qatorda, marker ustunidan chapda qo‘llanadi; raqamli
  kodlar, jami/imzo va sarlavha zonalari chiqariladi. Tizim1 parseri yoki uning
  flat hierarchy cheklovi ko‘chirilmagan; T2 hierarchy builder saqlangan.
- Real hujjatlarda bo‘sh tanlangan nom ustunidagi RZ matni, jumladan qisqa
  `ПОЛ`, endi yo‘qolmaydi. Manba qatorlari `review` ro‘yxatida qoladi; ularni
  jim ravishda “tekshirildi” deb belgilash mumkin emas.
- Workbench match holatini uchga ajratadi: tizim topgan, oldingi qarordan
  qayta ishlatilgan, operator tasdiqlagan. Source parsing review’i match
  hisobidan mustaqil, alohida ogohlantirish panelida ko‘rsatiladi; 20 tadan
  ortiq band scrollable ko‘rinishda kesiladi va qolgan son ochiq aytiladi.
- Texnik spesifikatsiya qalqoni beton klassi, armatura klass/markasi, diametr
  (1–4 raqam, jumladan 8 mm), W/F va beton markasi farqlarini ochiq nomzod
  ziddiyati sifatida ushlaydi. Bir xil shifr spetsifikatsiya ziddiyatini
  bekor qilmaydi. Bu qurilish standartlari katalogi emas: faqat matnda ikkala
  tomonda mavjud tanilgan belgi turlari solishtiriladi; noma’lum formatlar
  operator review’ida qolishi kerak.
- F2 workbook fayli asosiy threaddagi `arrayBuffer()`ga aylantirilmasdan
  Worker’ga Blob/File sifatida uzatiladi. Worker ichida o‘qiladi; Worker yo‘q
  fallback eski o‘qish yo‘lini ishlatadi.

### Davomiy tekshiruv natijalari

- Fokuslangan Vitest: 5 fayl, 38 test PASS.
- F2/smeta bilan bog‘liq kengaytirilgan to‘plam: 38 fayldan 31 PASS, 6 SKIP,
  1 faylda 2 ta perf assertion FAIL; 224 test PASS va 12 SKIP. Ikki mavjud
  10k/50k perf assertion parallel
  test yuklamasida limitdan oshdi; threshold o‘zgartirilmadi. Xuddi shu ikki
  benchmark alohida tinch run’da PASS bo‘ldi: 10k ~1,490 ms; 50k ~4,970 ms.
- T2 F2 V3 30k matcher benchmarki alohida: PASS, 9,672 ms (test ceiling
  20,000 ms). Bu XLSX parsing, brauzer RAM yoki butun import SLA’si emas.
- `npx tsc -b --pretty false`: PASS.
- `npm run build`: PASS (Functions type-check ham ichida). Vite’da oldindan
  mavjud `/grid.svg`, katta bundle va dynamic import ogohlantirishlari bor.
- `npm run lint`: PASS, repo bo‘ylab warninglar mavjud; davomiy fixdan
  kiritilgan unused-variable, ternary side-effect va unnecessary-escape
  warninglari tuzatildi.
- `npm run tekshir`: PASS, barcha tekshiruvlar o‘tdi; Functions gate ham PASS.
- 30k/50k natija haqiqiy Excel parse + brauzer xotirasi + UI + import job’ni
  birgalikda qamramaydi.

### Hajm va tekshiruv

- 30 000 synthetic canonical Smeta row matcher sinovi: 29 500 leaf/work
  bog‘lanishi, 500 RZ sarlavhasi; unresolved qator yo‘q. Windows muhitida
  7,351 ms; test chegarasi 20,000 ms. Bu matcher benchmarki — XLSX parse, browser
  xotirasi va barcha import bosqichlarining 30k SLA’si emas.
- Focused Vitest: 5 test fayli, 27 test PASS (shu jumladan 30k benchmark).
- Xotira trust-boundary uchun qo‘shimcha adversarial testlar: explicit BL→MAT
  signature collision va tanlangan razdel tashqarisidagi eski match; ikkalasi
  ham rad etiladi.
- `npx tsc -b --pretty false`: PASS.
- `npm run lint`: exit 0; repo bo‘ylab oldindan mavjud ogohlantirishlar bor.
- `node ops/governance-check.cjs`: PASS, 4 artifact / 50 task; `CURRENT_STATE.md`
  dagi main SHA `origin/main`dan eskiligi haqida governance ogohlantirishi bor.
- `npm run tekshir`: PASS, jumladan T2 F2/static guardlar, Functions TS gate,
  navigation, PTO-visible identity guardlar.
- `npm run build`: PASS; Vite/Rolldown’da mavjud dynamic-import va katta chunk
  ogohlantirishlari bor, lekin build muvaffaqiyatli tugadi.
- `git diff --check`: PASS.

### 2026-09-29 — xotira bog‘lanishiga qarshi adversarial tekshiruv

- F2 importer/matcher/parser/operator UI qamrovi: 14 test fayli, 82 PASS,
  12 SKIP, 0 FAIL.
- 30k matcher performance testi alohida jarayonda: 1 PASS. Uni katta Vitest
  to‘plami va TypeScript bilan bir vaqtda yugurtirganda Windows muhitidagi
  resurs raqobati sabab 23,556 ms bo‘lib, 20,000 ms guard yiqildi. Threshold
  yumshatilmadi; yakka qayta ishga tushirish PASS bo‘ldi. Bu natija bir vaqtda
  ko‘p og‘ir vazifa ishlatishdagi vaqt o‘zgaruvchanligini ko‘rsatadi.
- `npx tsc -b --pretty false`: PASS.

### Hali isbotlanmagan / integratsiya gate’lari

- Authenticated Preview’da source XLSXni haqiqiy import qilish, operator review,
  qoralama saqlash va keyin F2→Nakopitelniy/F3 raqamlarini kuzatish bajarilmadi.
- 30k to‘liq browser XLSX parsing/matching memory benchmarki va duplicate-heavy
  korpus hali yo‘q.
- Ichma-ich RZ daraxti real uchta faylda to‘liq operator ko‘rigi bilan
  tasdiqlanmagan; amfiteatr va sun’iy ko‘l review flaglari mavjud.
- Shu sabab bu checkpoint source/test readiness; Preview, main yoki production
  readiness emas. Production write, main merge va deploy bajarilmagan.
