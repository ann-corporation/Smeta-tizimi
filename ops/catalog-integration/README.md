# Katalog integratsiyasi: manba → runtime sifat gate'i

Bu yangi smeta dvigateli yoki canonical DB emas. Claude'ning mavjud coefficient builder'i uchun **offline release tekshiruvi**; mahsulot UI yoki hisobi almashtirilmaydi. Original arxiv/R2/DB yozilmaydi. Qoida sonlarini oldingi paketdan taxmin qilmay, JSONL to'liq stream o'qiladi, manifest count va SHA tekshiriladi.

## Ishga tushirish

```powershell
node --test ops/catalog-integration/*.test.mjs
$env:CATALOG_SUGGESTION_PACK='D:/CatalogMigration/outputs/norm-suggestion-support-v1'
node --test ops/catalog-hierarchy/suggestion-pack.test.mjs ops/catalog-hierarchy/suggestions.test.mjs
node ops/catalog-integration/audit-local.mjs --root D:/CatalogMigration --runtime C:/Temp/t2-studio-kat/koef/c88db57f5fc07828.json --report D:/CatalogMigration/outputs/studio-integration-audit-20261015/receipt-next.json
```

Node24+; npm paket talab qilinmaydi. `--runtime` har yangi builder chiqargan JSONga almashtiriladi. Faqat `root/outputs/` ichiga yangi report+to'liq issues.jsonl yaratiladi; `wx` existing faylni bosmaydi. Takrorlashda yangi report nomi tanlang. Private/local dataset reporti repoga commit qilinmaydi.

Exit0 = structural blocker topilmadi, **normativ approval/deploy PASS emas**. Exit2 = review/mapping zarur, avtomatik publication bloklansin. Exit1 = source/schema/hash/argument/IO xatosi; valid report yo'q. Interrupted ledger final report va `complete:true` bo'lmasa yakunlangan receipt emas.

## Claude builder'ga ulash

1. Mavjud builder immutable candidate JSON yaratadi.
2. Shu candidate bilan CLI ishlaydi. Exit2/1 bo'lsa `koef-katalog/CURRENT.json` pointerini avtomatik yangilamang. Oldingi ishlaydigan reviziyani qoldiring. Builder o'zi integrator lane'da: bu branch unga parallel tahrir kiritmadi.
3. Per-rule review/quarantine ishlating: noaniq qoida ma'lumoti o'chmasin, lekin avtomatik hisobga kiritilmasin. **Bu gate foydalanuvchining smeta/hujjat eksportini bloklash uchun emas.**
4. `коэффициент` har doim MULTIPLY degani emas. ADD_TO_BASE/PER_UNIT_INCREMENT/EXCLUDE va0 ma'nosi source tekshiruv bilan ajratiladi. Gate ularni o'zi1.005/1.04ga aylantirmaydi, rasmiy norma yaratmaydi.
5. Tasdiqlangan operator qarori, hisob usuli, scope, manba/nashr va stacking semantikasi reviewed contract bilan sizning builder/modelingizga kiritilgach shu gate kengaytiriladi; muammoni yashirish uchun regex/fixture yumshatilmaydi.

## Chegara va murakkablik

- Barcha source rule/link o'qiladi, duplicate ID va dangling pointer saqlanadi. Memory O(rule+unique link IDs+table associations); qayta-qayta full scan/per-row fetch yo'q, network0.
- TN Ш-… ↔ ABC П-… — **faqat code-key candidate**, nashr/ma'no tengligi emas. E work table crosswalk xolos. Ц/М/... source oilalari alohida sanaladi; ularni E ga collapse qilish yo'q.
- Source-link fields+rule pointer mavjudligi real normativ scope tasdig'i emas. Eski manifestning94,771resolved work scopes soni bilan bizdagi rule-reference count bir xil metrika emas.
- E source tabledan tashqariga kengayish = `RUNTIME_TABLE_WITHOUT_LEGACY_EVIDENCE`, avtomatik runtime xato isboti emas; edition va original00-amen tekshiruvi kerak.
- UI report samples100gacha, har turdan10gacha, blockerlar oldin. **Barcha** findings alohida SHA-backed `.issues.jsonl`da; hech biri samples sabab tashlab yuborilmaydi.
- Inventory faqat local manifest mavjud/hash dalili; runtime binding yoki live R2 isboti sifatida ko'rsatilmaydi.

## 2026-10-15 real receipt

`D:/CatalogMigration/outputs/studio-integration-audit-20261015/receipt-v3.json` va `.issues.jsonl`.
Source1438rules/95704links, runtime1703rules/5259table keys. Source rule pointer+scope fields present95698; E crosswalk38718; non-E crosswalk scope tashqarisi56980;6rule reference unresolved. E bo'lmagan yozuvlar yo'qolmagan.
83additive review,22zero review,11duplicate runtime associations.710legacy family runtime code-key candidate topilmadi;5375table associations eski E source dalilida yo'q — **normativ yo'qotish deb avtomatik hukm qilinmaydi**.1259runtime rulega eski E code-key candidate yo'q — bu ham xato isboti emas. Nashr/version farqi bilan source review.
Source va runtime SHA reportda. Natija BLOCKED, CLI exit2 **kutilgan natija**.19new tests+13existing actual pack/suggestion tests PASS. Data archive o'zgarmagan; hech qanday original bo'shliq fuzzy bilan to'ldirilmagan.
