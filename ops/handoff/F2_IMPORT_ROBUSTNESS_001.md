# F2-IMPORT-ROBUSTNESS-001

## Vazifa

Tizim1 F2 importerining isbotlangan operator skeletini saqlab, TIZIM_02 uchun
katta (30 000+ qator), ko‘p formatli F2 ↔ LRV importini tez, tushunarli va
moliyaviy jihatdan fail-closed qilish. Product Owner 2026-09-29 da Codex’ga
ushbu importer yo‘llarini qayta ishlash vakolatini berdi.

## Baza va ishchi ref

- Repo: `SQLI-DUMPER-CRACK-Link-1/Smeta-tizimi`
- Dastlabki task base: `origin/main` / `b36c552e0b8de22bb398f04ab851449a3e68b87f`
- Yangilangan main baseline: `origin/main` / `6f1d7e870ec702f8beb54efe32ce07400e18681b`; branchga `81f5af2` merge checkpointida qo‘shildi.
- Branch: `codex/f2-import-robustness-v1`
- Kod auditining oldingi checkpointi: `bbd128d7723c66f0e1f67fe0c8b00f71bf98cb45`; lokal read-only workbook audit checkpointi: `fb64871856956217a1ff4210088dda3348dd7917`.
- Checkpoint commits: `49119fb` (parser/matcher/30k), `749004d` (initial evidence), `ee931c9` (memory type/scope guard), `bbd128d` (RZ fallback with row evidence, explicit source-read review, technical specification conflict guards, truthful match-state counts, worker-side Blob read), `81f5af2` (latest main merge), `44764a7` (owner workbook parser/matcher/UI corrections and final verification evidence). Final handoff update follows on the same branch.
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

### 2026-09-29 — Fast Food real F2 anatomiyasi va T1 skeletiga asoslangan tuzatish

Bu tekshiruvdagi owner fayllari faqat lokal o‘qildi; UI orqali upload/import,
Supabase write yoki Preview login bo‘lmadi.

- Tizim1 `35_F2Moslash.js` va `Panel.html`dagi foydali operator skeleti
  (yonma-yon ikki daraxt, RZ scope, har qator uchun Bog‘lash/Zamena/Qo‘shimcha,
  noaniq qatorni operatorga berish) ko‘rildi. T1 ning eski heuristik/fuzzy
  natijalari canonical deb olinmadi; u yerda ham noto‘g‘ri qamrov, duplicate va
  spec mismatch holatlari uchun himoyalar tarixan o‘zgartirilgan.
- T2 LRV_PLUS eksporti avval `ТИП` ustunini rol deb tanimagan va
  `ҲАЖМ (ед)`, `НАРХ` ustunlarini map qilmagan. Endi aynan `ТИП` sarlavhasi va
  BL+RZ/resurs marker qiymatlari birgalikda tekshiriladi; o‘zbek kirill
  ustunlari map qilinadi. Random “ТИП” ustuni bilan rol taxmin qilinmaydi.
- Real legacy F2’da resursning № п/п katagi bo‘sh, kod ustunida `1`, `2264` yoki
  materiallar uchun umumiy `С`, ammo alohida `Кат.` ustunida `ЧЕЛ/МАШ/МАТ` bor.
  Endi faqat aktiv BL ostida, kategoriya sarlavhasi tasdiqlangan, nom/birlik va
  kamida bitta sonli hajm/narx/summa dalili bo‘lgan qator resurs sifatida
  biriktiriladi. Qator tartibi identity emas. F2 podvalidagi “Прямые затраты”,
  “НДС”, “Коэффициент к оплате” kabi satrlar ish/resurs tree’ga kiritilmaydi,
  lekin `f2_podval_qatori` sifatida manzil bilan qayd etilib, UI’da alohida
  ma’lumot ko‘rinishida chiqadi.
- Shu sabab workbench “F2 faylida N ta qator qo‘lda tekshirilishi kerak” soniga
  tanilgan podval satrlarini qo‘shmaydi. Haqiqiy parse noaniqlari esa warningda
  alohida qoladi. F2 declared total va qatorlar total reconciliation alohida.

#### Real local dry-run natijalari

| Read-only workbook | Parser / matching | Natija va ochiq shart |
|---|---|---|
| `Fast Food 1-etaj_АКТ_Ф-2_2026-07.xlsx` | 42 ish, 353 resurs, 16 tanilgan F2 podval satri | Parser leaf jami `241 983 934,9563564`; hujjat `ИТОГО ПРЯМЫЕ` `241 983 934,95635635`; farq faqat floating-point `0,00000006` atrofida. Bu faylning UI’dagi manba revisioni/hash’i mosligi hali isbotlanmagan. |
| `Fast Food 1-etaj_LRV_PLUS_2026-09-28.xlsx` | 136 ish, 1 033 ichki RS, 229 mustaqil MAT/OB; 8 noaniq, 6 jami-katak qiymati yo‘q | Explicit F2 direct total yo‘q (`NULL`); parser `742 939 194,396537` summa oldi, lekin bu declared subtotal bilan reconcile qilingan deb aytilmaydi. |
| July F2 → September LRV, lokal matcher dry-run | 395 source leaves; 1 442 synthetic LRV rows; IDlar faqat test surrogate | 367 aniq, 1 operator taklifi, 27 topilmadi. 27 satr asosan armatura/metall/material qatorlari, manbada umumiy `С` kodi; avtomatik “qo‘shimcha” yoki “zamena” qilinmadi. Operator ularni tekshirishi shart. |
| `Fast food 1этаж_LRV_PLUS (2).xlsx` | 6 ish, 59 ichki resurs, 7 mustaqil resurs; 10 noaniq source qatori | Leaf jami `239 200 683,38279882`, explicit jami `239 200 683,38279885`; farq `0,00000003` atrofida. Bu workbookning hash/revisioni July F2 va Preview’dagi faylga tengligi tasdiqlanmagan. |
| `amfiteatr raschet.xlsx` | 50 ish, 450 ichki RS, 76 mustaqil MAT/OB | Parser `3 004 484 761,41`; declared subtotal `2 877 416 258,71`; `+127 068 502,71` tafovut — qo‘lda kiritish/auto-confirm bloklanishi kerak. |
| `искусственное озера (2).xlsx` | 62 ish, 492 ichki RS, 62 mustaqil resurs | Parser `6 962 663 411,71`; declared subtotal `6 962 670 402,59`; `−6 990,88` tafovut — operator ko‘rigi kerak. |

Bu natijalar desktop file’dagi parser/matcher dry-run; production yoki Preview’da
authenticated acceptance emas. 27 topilmadi satrga qo‘lda Bog‘lash/Zamena/
Qo‘shimcha qarori va F2 importni final tasdiqlash bajarilmadi.

#### Shu davomda bajarilgan testlar

- `varaq.test.ts` + `f2.test.ts` + `F2V3Workbench.operator.test.tsx`: 23 PASS.
- T2 matcher 30k benchmark, yakka run: PASS, 6 423 ms (test ichidagi 20 000 ms limit).
- Real local workbook parser summary: Vitest harness ichida 1 PASS; bu repo CI uchun emas, faqat owner workstationidagi read-only evidence.
- Keyingi yakuniy `tsc`, build, lint, tekshir, governance va diff-check natijalari commit oldidan qo‘shiladi.

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

### 2026-09-29 — yakuniy davomiy tekshiruv

- Main baseline `6f1d7e870ec702f8beb54efe32ce07400e18681b` xavfsiz merge qilindi;
  merge commit `81f5af2`. Ish `codex/f2-import-robustness-v1` izolyatsiyalangan
  worktree’da qoldi.
- F2/parser/matcher to‘plami, bitta worker: 33 fayl, 185 PASS, 12 SKIP, 0 FAIL.
  27k XLSX o‘qish testi: 856 ms o‘qish + 764 ms anatomiya; 5 394 ish qatori.
  F2 matcher 10k/50k benchmarklari: 1 068 ms / 3 858 ms. Alohida nested F2
  matcher 30k: 6 399 ms, PASS (20 000 ms guard o‘zgartirilmadi).
- XLSX eksport/reconciliation to‘plami (LRV_PLUS, Ostatka, PTO workbook):
  4 fayl, 53 PASS, 0 FAIL.
- `npm run build`: PASS; mavjud `/grid.svg` va katta chunk/dynamic import
  ogohlantirishlari bor. `npx tsc -b --pretty false`: PASS.
  `npm run typecheck:functions -- --pretty false`: PASS.
  `npm run lint`: exit 0; repo bo‘ylab ogohlantirishlar bor.
  `npm run tekshir`: PASS, barcha tekshiruvlar o‘tdi.
  `node ops/governance-check.cjs`: PASS (4 artifact, 50 task), lekin
  `CURRENT_STATE.md` main SHA `d7b9bba...` eskirgan degan WARN qaytardi; bu
  governance fayl task owns scope’ida emasligi sababli o‘zgartirilmadi.
  `git diff --check`: PASS.
- Butun frontend `npm test -- --reporter=dot`: 127 fayldan 113 PASS, 6 SKIP,
  8 FAIL; 794 testdan 773 PASS, 12 SKIP, 9 FAIL. Fail’lar: 5 ta XLSX/export/parser
  timeout va 3 ta matcher perf guard parallel full-suite yukida oshgani;
  F2 30k testi full-suite’da 41 993 ms bo‘lib yiqildi, ammo shu test alohida
  6 399 ms PASS. Muammoli 4 eksport fayli yakka-worker run’da 53 PASS bo‘ldi;
  27k XLSX parser va eski 10k/50k matcherlar ham F2 bir-worker run’da PASS.
  Qolgan 1 ta Resurs Vedomost testining full-suite’dagi muvaffaqiyatsizligi
  izolyatsiyada 3/3 PASS bo‘ldi. Threshold yoki testlar yumshatilmadi.
- `npm run korpus`: 6 fayl / 12 test SKIP; repoda faollashtirilgan golden
  workbook korpusi bu run’da bajarilmadi.
- Owner’ning haqiqiy workbook’lari lokalda faqat o‘qildi. July Fast Food F2:
  42 ish + 353 resurs; leaf total manbadagi `ИТОГО ПРЯМЫЕ` bilan taxminan
  `0,00000006` so‘m farq. Lokal matcher 367 aniq, 1 taklif, 27 yechilmagan;
  shu sabab operator ko‘rigi bo‘lmasdan “to‘liq mos” yoki import-ready deyilmaydi.
  Amfiteatr va sun’iy ko‘l summalarida mos ravishda `+127 068 502,71` va
  `−6 990,88` manba tafovutlari saqlanib, auto-confirm qilinmadi.
- Authenticated Preview’ga kirish, UI’da haqiqiy faylni yuborish/saqlash va
  F2→Nakopitelniy→F3 oqimini ko‘rish bajarilmadi. Branch build/test tayyor,
  ammo bu sababli main/production release tayyor deb e’lon qilinmaydi.
