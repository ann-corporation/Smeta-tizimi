# T2-SMETA-STUDIO-PRO-UI-002 — Codex / noutbuk

## Vazifa va chegara

Egasi mavjud smeta muharririni yoqtirmadi: Excel → chuqur ierarxiya → resurs
almashtirish → katalog narxi → nakrutka → tirik Excel professional ish joyiga
aylanishi kerak. Bu checkpoint TO'LIQ yangi muharrir yoki production release EMAS.

Branch: `codex/smeta-studio-pro-v2`.
Base: `0fc3e402564460df6c535075be879fff981c5283`.
Worktree: `C:/Temp/GAS-smeta-studio-pro`.
Egasi talabi Obsidian: `SMETA_STUDIO_PRO_V2_EGASI_TALABI_2026-10-06.md`.

## Haqiqiy kod

`frontend/src/components/smeta-studio-pro/`:
- `hierarchy.ts`: mavjud `EstimateDoc`dan iterativ O(n) indeks; canonical
  snapshot o'zgarmaydi, RZ parent lineage saqlanadi. Cycles/duplicate/orphan
  fail-closed. Reorder stable identityni o'zgartirmaydi. Qidiruv lotin/kirill,
  topilgan resursning barcha ota bo'limlarini saqlaydi.
- `EstimateOutline.tsx`: haqiqiy React + TanStack virtualizer, ko'rinadigan
  viewport + 8 overscan, 44 px qator. Bo'lim/ish/resurs ochish, yopish, qidiruv,
  ancestor breadcrumb. Texnik UUID/version/hash ko'rinmaydi; onSelect orqali
  ichki occurrence/recipe ID inspector uchun qaytadi. Labels caller tomonidan
  `t()` bilan lokalizatsiya qilinishi shart; komponent yangi lug'at yozmaydi.
- `substitution-review.ts`: UI preflight — type/unit ma'lumligi, type mismatch,
  conversion va sabab; birlik farqida factor=1 bo'lsa HAM evidence talab.
  `readyForOperatorReview` tasdiqlangan normativ moslik DEGANI EMAS; geometrik
  specifications/normative basis hamda backend command tekshiruvi majburiy.
- 3 test fayli: hierarchy 13, component 4, substitution 11 = 28 yangi test.

## Davom: tahrirlash ish joyi (2026-10-06)

`EstimateEditingWorkspace.tsx` daraxt + tanlangan ish/resurs inspectorini
birlashtiradi. Mavjud `StudioCommand` callback yagona yozish yo'li; yangi
DB/store/endpoint yoki kalkulyator YO'Q. Hajm, bo'lim nomi, ishni ko'chirish,
narx turi/dalili, katalog nomzodini tanlash, resurs almashtirish va qaytarish
bor. Miqdor/summa mavjud `calcOccurrence`dan olinadi. Katalog narxini tanlash
tasdiq emas: dalil kiritilishi shart. Narx qo'lda o'zgarsa catalog ID/dalil
tozalanadi; almashtirilgan resursga eski katalog narxi tanlanmaydi. Transport
ustuni avtomatik qo'shilmaydi. Company/object/draft switch inspectorni tozalaydi.
Bo'lim ko'chirish selecti 50 nomzod bilan cheklangan, lotin/kirill qidiruv bor.

Yangi inspector uchun 8 executable UI test: haqiqiy applyCommand bilan hajm,
exact summa, narx manbasi, manba o'zgarmasligi, replacement/restore/type gate,
safe error, tenant switch cleanup va ishni ko'chirish. Umumiy suite 68 test.
Labels caller tomonidan 4 tilga tarjima qilinadi. Mavjud katalogning nomzod
resurslari ishlatiladi; butun katalog bo'yicha replacement qidiruvi hali yo'q.

Davom checkpoint tekshiruvi: 7 fayl / **68 test PASS**, `tsc -b`,
functions type-check, focused oxlint va production build PASS. 30k deep
`npm run tekshir`, governance va diff-check ham PASS (governance stale main_sha WARN saqlangan).
presentation testi 239 ms (jsdom/local, browser kafolati emas). Origin/main
`82d886b` xavfsiz merge qilindi; Claude'ning F2/tomon o'zgarishlari saqlandi.

Claude binding: eski recursive `Bolim/Qator/ResursQator` presentation o'rniga
`<EstimateEditingWorkspace doc={doc} labels={localizedLabels} command={amal}
onTargetSection={setNishon} />`. Parentdagi katalog paneli, canonical save,
autosave, undo/redo va jami saqlanadi. Bir xil command ikki marta bajarilmasin.
`SmetaStudio.tsx` Claude qulfida: ushbu branch routega ulanmagan. Bu
SOURCE_READY komponent; productionda foydalanuvchi ko'radi degani emas.

## Tekshiruv va chegaralar

2026-10-06: yangi va mavjud engine suite birga **60/60 PASS** (6 fayl).
`tsc -b`, `tsc -p tsconfig.functions.json`, focused oxlint, `npm run build`,
`npm run tekshir`, `git diff --check` PASS. Governance PASS (69 task),
CURRENT_STATE main_sha eski ekanligi haqida pre-existing WARN. Buildda
pre-existing `/grid.svg` va katta bundle warninglar bor; ular yangi UI ishlashi
isbotiga aylantirilmaydi.

Focused komponent + mavjud canonical engine testlari qayta yuritiladi:
`node node_modules/vitest/vitest.mjs run src/components/smeta-studio-pro src/lib/smeta-studio --maxWorkers=1`.
30 000-deep indeks/search/expand 383 ms birgalikdagi test runida;
50 003-row fixture stable keys PASS; 30 000-work UI viewport 50 dan kam DOM
treeitem (jsdom viewport geometry, real virtualizer). Browser timing emas.

Route/App/AdminShell/SmetaStudio.tsx, model/commands/calc, R2 runtime builder,
nakrutka engine, backend va DB o'zgarmadi. Yangi production URL yo'q.
Mavjud command hali `SECTION_DEPTH_LIMIT` bilan 2 daraja cheklaydi: yangi
presentation mavjud chuqur inputni ko'rsata olishi commandning chuqur bo'lim
yaratishni qo'llashini isbotlamaydi. Undo hali 100 full-document snapshot.

## Claude bilan integratsiya

1. Branchdagi yangi komponentlarni mavjud muharrirning tree presentationi
   o'rniga ulang: `doc` aynan mavjud canonical draft; onSelect mavjud
   occurrence/resource inspectorga ulanadi; ikkinchi draft/store yaratmang.
2. Lokalizatsiya caller labels orqali. Preview'da yangi PTOga ko'rsatib sinash.
3. Model egasi bilan chuqur ADD_SECTION/move cycle guard va bounded undo
   alohida mustahkamlanadi; bu checkpoint Claude qulflarini bosmaydi.
4. Excel import confirmation/source section, pricing inspector va podval
   shu mavjud commands/calculator/narx-katalog/nakrutka portsga ulanadi.
5. UI preflight server authorization o'rnini bosmaydi. Price candidate
   estimate/certified/procurement historyni yashirin o'zgartirmaydi.
6. Authenticated save/export/real workbook smoke o'tmasdan yangi muharrirni
   READY yoki production tayyor deb e'lon qilmang.

## Parallel R2 natijasi

11 immutable REVIEW_ONLY obyekt / 167 162 008 bayt private
`smeta-tizimi-canonical`ga yuklandi, hammasi readback SHA256 PASS.
Receipt: `D:/CatalogMigration/compact-estimate-reference-v1-20261005/R2_UPLOAD_RECEIPT_20261006.json`.
Snapshot `norm-katalog/reference-snapshots/66de1eea4dee809665fb998e37ff0539e62e67ba4c9de1011192d7971853ce6b/`.
QA `norm-katalog/review-support/a9d50b7e40cb0d994b3bfd64e0112a1874a6fbe87970eae6341148a7c18a1028/`.
Website active pointer o'zgarmadi. Brauzerga 165 MB SQLite to'liq berilmaydi.

## 3-checkpoint — to'liq o'ng panel bindingi

`SmetaDocumentPanel.tsx` yangi o'ng panelni almashtirish uchun tayyor:
context label/title/currency, root/podrazdel yaratish, target section,
tasdiqlanmagan jami + known subtotal + unresolved, virtualized tree/inspector.
`total={hisob.total} calculation={hisob}` — mavjud hisobdan bitta projection;
resurs summalari map bilan indekslanadi, har qator recipe scan qilmaydi.
`targetSectionId={nishon} setTargetSection={setNishon} command={amal}`.
Company/project/object/draft switch target va inspectorni tozalaydi.
Norm basis scale/unit/evidence inspector orqali SET_BASIS; null qolsa summa
noma'lum, yashirin zero emas. Model hali 2 section darajali — UI chuqurlik
qoidasini chetlab o'tmaydi, xavfsiz error qaytaradi. Deep engine/undo va
resource global search Claude lane'da ochiq; bu hali tayyor professional
program yoki production route emas.

`labels: DocumentPanelLabels` parentda t() bilan tarjima qilinadi; yangi
`basisScale/basisUnit/basisEvidence` berilsa norma asosi formasi ko'rinadi.
Header/katalog panel/autosave/serverga saqlash/undo saqlanadi. Context text
formasi numeric company/project/object IDni almashtirmaydi.

3-checkpoint: **78/78 PASS**, 8 test fayli (yangi 46 + existing engine 32).
TypeScript/build/focused oxlint PASS; yangi DocumentPanel 7, basis 2 va
tree calculated-summary 1 regression testi qo'shildi. UI ikkita competing
total hisoblamaydi: parent DocCalc yagona manba. Main route/deploy/smoke
dalili hali yo'q, to'liq dastur tayyor deb e'lon qilinmaydi.

## 2026-10-06 — egasi topshirig'i bilan route integratsiyasi

Egasi Claude limiti tugagach Codexga production chiqarishni topshirdi.
`origin/main @ 08770668285fecbc6ed6a572d6b206e5aac8c892` merge qilindi;
Claude'ning dirty agent-ish fayllari bu releasega kiritilmadi.
`/admin/smeta-studio`dagi eski SmetaPanel endi SmetaDocumentPanel bilan
almashtirildi. Chap katalog, IndexedDB autosave, undo/redo, server save
mavjud contractlari saqlandi. Caller labels mavjud t() orqali 4 UI tilida.
Katalog revision hash oddiy foydalanuvchi headeridan olib tashlandi.

12 fayl / 122 Vitest PASS: route katalog → bo'lim → ish → resurs;
4 × 1.02 × 500 = 2040 dalilli narx, undo va NULL qaytishi ham tekshirildi.
30k chuqur presentation fixture 102 ms (lokal test; browser SLA emas).
Build (tsc-b + functions tsc + Vite), tekshir, governance, diff-check PASS.
Full oxlint exit 0, boshqa modullarda oldindan mavjud warninglar bor.

Release faqat yangi muharrir presentation bindingi; to'liq ABC/TN parity
emas. Modeldagi 2-level section, snapshot undo, umumiy resurs qidiruv,
Excel/nakrutka/export authoring end-to-end hali keyingi bosqich.
Authenticated owner live smoke UNKNOWN: bu sessiyada browser control
runtime yo'q. Deploy/anonymous health buni PASSga almashtirmaydi.
Production SHA/status Obsidian KOORDINATSIYA va AGENT_LOGda qayd qilinadi.
