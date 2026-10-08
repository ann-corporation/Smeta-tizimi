# T2-PTO-NULL-ADVERSARIAL-20261008

## TASK ID / OWNER / OBJECTIVE
Codex, noutbuk, alohida PTO NULL QA sessiyasi. Claude boshqaradigan PTO PRO V1
1-raundidagi F2 `UNKNOWN ≠ 0` fixiga mustaqil negativ test va review tayyorlash.
Bu reja/ACK paketi; executable testlar hali yozilmagan va PASS da'vosi yo'q.

## REPO / BASE REF/SHA / WORK BRANCH
- Repo: ann-corporation/Smeta-tizimi.
- Base: origin/main `1ef3e6d4b8b282fda8e534196c7d55d1918f135f`.
- Branch: `codex/pto-null-adversarial-20261008`.
- Clean worktree: `C:/Temp/GAS-pto-null-review`.
- Dirty G:/GAS fayllari saqlanadi; bu task ularni tahrirlamaydi.

## REQUIRED READING
Governance boot zanjiri; Obsidian `AGENT_START_HERE`, `CURRENT_STATE`,
`PRODUCT_ROADMAP`, `ROLE_TRUST_MODEL`, `CODEMAP`, `KOORDINATSIYA`,
`PTO_PRO_V1_DIREKTIVA`. Eski agent jadvali real faollik isboti emas.

## OWNED PATHS — TAKLIF, REGISTRY ACK KUTILADI
- `frontend/testlar/pto-null-adversarial/`
- `ops/handoff/T2_PTO_NULL_ADVERSARIAL_20261008.md`
- `ops/mailbox/T2-PTO-NULL-ADVERSARIAL-20261008/`

`ops/ACTIVE_TASKS.json` boshqa aktiv task owns ichida. Claude/band task egasi
yangi rowni qo'shishi so'raldi; registry lockni bosish yoki yumshatish yo'q.
Lock ajratilmaguncha mahsulot/test implementatsiyasi boshlanmaydi.

## DO-NOT-TOUCH / IMPLEMENTATION BOUNDARY
Claude F2 hisoblash/DB/UI fixi; Studio, AI platforma, tomon/ijro fayllari;
boshqa Codex katalog/PTO-UZ auditlari. Yangi backend yoki parallel calculation
truth yo'q. Faqat haqiqiy mavjud kodga ulanadigan testlar; o'z oracle
hisoblagichini sinash mahsulot isboti hisoblanmaydi.

## ARCHITECTURAL INVARIANTS / TESTS / ACCEPTANCE
1. Explicit `0` qiymati 0; missing `certified_amount` NULL, fake zero emas.
2. Missing price/amount baseline yoki procurement narxidan tiklanmaydi.
3. `price_intentionally_absent` resurslari va pul rollupiga kirmaydigan
   strukturaviy RZ/BL qatorlari alohida kontrakt bilan sinaladi: hammasiga
   bir xil NULL qoidasini ko'r-ko'rona qo'llamaslik.
4. Ma'lum + noma'lum barglar yig'indisi to'liq jami deb ko'rsatilmaydi;
   ma'lum subtotal ko'rsatilsa incomplete dalili bilan ajratiladi.
5. Source amount qty × current price bilan almashtirilmaydi; certified tarix
   oldin/keyin snapshotda exact bir xil, draft cumulative tarixga kirmaydi.
6. LRV, Nakopitelniy, F3, F2 export va dashboard bir source snapshotda
   qator va jami darajasida mos; decimal sentlar, NULL va 0 alohida sinaladi.
7. Qo'shni obyekt/davr va tenant ma'lumoti aralashmaydi.
8. Direktivadagi 264/258 sonlar Claude reported baseline. Mustaqil DB
   acceptance read-only yoki disposable/rollback; production mutation yo'q.

## INTEGRATSIYA TARTIBI
Claude candidate branch + exact SHA va NULL rollup kontraktini beradi.
Codex test-only commitni o'z branchida saqlab, SHA/command/natija bilan
Obsidian + repo mailboxga yozadi. Claude testlarni candidate'ga olib kiradi;
Codex aynan shu SHA ustida qayta tekshiradi. Full gate va authenticated
vertical smoke alohida dalil: source test PASS production PASS emas.
Har yangi bosqichda origin/main fetch, oxirgi log va KOORDINATSIYA javoblari
o'qiladi. Boshqa agent lock o'zgarishi faqat kelishuv bilan.

## FORBIDDEN ACTIONS / EXPECTED FINAL OUTPUT
Main merge/push, prod deploy/DB write, boshqa agent ishini takeover qilish
yo'q. Natija: exact candidate/test SHA, bajarilgan testlar, topilgan regressiya,
UNRESOLVED va Claude uchun integratsiya ko'rsatmasi. Hozirgi holat: PLAN/ACK.
