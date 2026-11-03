# PR217 D3a — итог ограниченного дополнения, 03.11.2026

База дополнения: e156ba13064c8b507255dadd9621b9470f12022a. Новый отдельный commit, без amend предыдущего. Передача родителю для merge в D3b; push не выполняется. Запись Obsidian делает родитель.

## Изменения

- В paket.test.ts исправлено только доказанное значение f2_mumkin_summa: null вместо 0 для строки 12 с неизвестной суммой факта. Названия проверок теперь описывают текущий канонический контракт ядра, а не полную эквивалентность старому SQL-view.
- В api/t2-daraxt-ustunlar.ts изменена только одна строка комментария: поле f2_summa_yoq принимается пакетом опционально до расширения SQL. Типы и константы не изменены.
- В holat.ts доступный ОБЪЁМ считается отдельным знаковым помощником без денежного округления: 0.003 − 0.001 = 0.002; отрицательный вариант сохраняет −0.002. Денежные операции остаются в существующих помощниках ядра; korinish.ts не изменён.
- Если F2-объём ненулевой, F2-сумма равна 0, а f2_summa_yoq отсутствует либо null, производная доступная СУММА равна null. Явный признак 0 допускает настоящую нулевую цену; положительный признак сохраняет предусмотренную ядром оценку по сумме факта. Исходные суммы/объёмы F2 и факта не переписываются.
- Расширена только запись задачи DESKTOP-D3-WORKER-20261031; чужие записи сохранены.

## Доказательство точности объёмов и границы паритета

Выполнен read-only запрос к живой схеме Smet-01: t2_qator.hajm/norma, t2_akt_qator.hajm/certified_quantity и объёмы t2_qator_holat имеют тип numeric без ограничения scale. Проверка SQL greatest(0.003::numeric − 0.001::numeric, 0::numeric) вернула 0.002. В живом view доступны прежние выражения GREATEST(e.fakt_hajm − d.f2_hajm, 0) и GREATEST(e.fakt_summa − d.f2_summa_malum, 0). Миграция 20261117400000 также оставляет остаток суммы без округления.

Это НОВАЯ каноническая производная UI/ядра: знаковые значения, сохранение неизвестного, каноническое денежное округление. Это НЕ полная паритетность с сырым SQL-view: старый view использует GREATEST и сырую сумму факта; денежный остаток не округляет. JS number не даёт произвольной десятичной точности PostgreSQL numeric; здесь устранена именно потеря мелкого объёма из-за округления до 2 знаков, без выдуманного ограничения в 6 знаков. Сервер и SQL не менялись; расхождение передаётся L0.

## Оставшиеся зависимости родителя

- PR2 SQL: передать настоящий h.f2_summa_yoq из t2_qator_holat в CTE и выровненный массив JSON пакета; не подменять его f2_summa_nomalum. Согласовать инвалидирование старого кеша/ETag с D2. Подробные привязки файлов — в историческом отчёте ниже.
- Метаданных собственного F2-подвала в пакете нет. Оценка документной наценки/НДС из пакета НЕ ПОДДЕРЖИВАЕТСЯ; подвал сметы не используется как выдуманная замена, исходные F2-суммы сохраняются.
- Полный набор тестов, финальные D3b/perf/session/browser проверки выполняет родитель после merge. Показатели браузера 39–85 мс не доказывают общий предел 50 мс. Полный набор тестов и build в этом дополнении не запускались.

## Проверки дополнения

Финальный прогон: 4 файла / 35 тестов PASS, включая paket.test.ts, holat.paritet.test.ts, hisob-worker.test.ts и hisob-yadro.guard.test.ts. Команда из frontend: npx vitest run src/ombor/paket.test.ts src/lib/hisob-yadro/holat.paritet.test.ts src/ombor/hisob-worker.test.ts src/lib/hisob-yadro/hisob-yadro.guard.test.ts --maxWorkers=1 --no-file-parallelism.

Целевая проверка TypeScript изменённого ядра PASS: npx tsc --ignoreConfig --noEmit --skipLibCheck --target ES2023 --module ESNext --moduleResolution bundler src/lib/hisob-yadro/holat.ts. Это не повторная проверка всего приложения; её предыдущий результат относится к базе e156ba13. git diff --check PASS. Governance по-прежнему FAIL из-за чужого пересечения C11-WAREHOUSE-LEDGER / C11-WAREHOUSE-CONTRACT; также предупреждение устаревшего CURRENT_STATE. Сравнение всех чужих записей ACTIVE_TASKS с e156ba13 PASS: они не изменены.

Полный набор тестов, build и perf не запускались. Проверки SQL были только read-only: каталог типов, определение view и синтетическое выражение с объёмами.

## Предыдущий отчёт — история до дополнения

# PR217 D3a — exact-main alignment, 2026-11-03

Branch: codex/desktop-d3-worker. Exact merged main: fc65e64582c4b1fa792d556c2a073540f6ad1ebc. Local review delivery only; no push, main mutation, production writes, build or full-suite run in this update. Parent owns D3b integration and final acceptance.

## Current implementation

- holat.ts delegates amount arithmetic to current hisob-yadro/korinish helpers: qoldiq, faktSummaF2Narxda, f2MumkinIshorali. No duplicated price/podval formula. Signed negative availability stays negative; unknown Fakt amount/availability stays null.
- Packet fakt_summa already comes from t2_qator_holat; it and frozen f2_hajm/f2_summa pass through unchanged. Pricing is used only to derive availability, never to rewrite source values.
- h.f2_summa_yoq is an optional numeric/null column with the existing presence bitmap. It passes through decoded packet, holat derivation and Worker result. Absent remains omitted/undefined (actual main optional helper behavior), explicit null stays null and explicit 0 stays 0. It is NOT inferred from f2_summa_nomalum: the latter excludes BL/RZ and machine-operator rows whereas the new count does not.
- Legacy optional-field behavior cannot prove that a zero F2 aggregate means a real zero amount. The SQL extension below is required for complete missing-amount protection; no claim of complete old-packet equivalence.
- Main has no holat.ts conflict to resolve; its old inline packet derivation was replaced with the shared core call. Only merge conflict: ACTIVE_TASKS. Every foreign task record was compared against exact main and is unchanged and in original order. Only the D3a task was added.

## Unsupported F2 document markup — parent dependency

The current packet lacks t2_akt_podval metadata / per-act-per-block own nk and attributable category cuts. D3a does NOT call f2Baholash with smeta metadata to invent F2 markup. Exact source F2 amounts and document totals stay intact. F2 own-podval/QQS/markup evaluation from this packet is UNSUPPORTED until an explicit authoritative document-metadata contract is supplied. D3a produces row state, not a document monetary total.

## Exact PR2 SQL / contract work for parent

1. Extend the existing t2_obyekt_paket_v1 source CTE to select h.f2_summa_yoq from t2_qator_holat, and h JSON with f2_summa_yoq = array_agg(f2_summa_yoq ORDER BY tartib,id), empty [] (same column alignment as other h arrays). Current file anchors: supabase/migrations/20261116400000_t2_obyekt_paket_v1.sql source SELECT line 38 and h JSON near line 86. Use a new parent migration plus rollback/acceptance; D3a edits no SQL.
2. Keep the exact view count, including BL/RZ and signed nonzero quantities. Do not derive it from the filtered f2_summa_nomalum and do not default missing transport to 0.
3. Coordinate packet format/ETag salt/cache invalidation with D2; old cached packet bodies lack this guard. Extend packet acceptance and shadow comparison to check new column values, including null/zero/count and BL/RZ cases. This lane does not edit D2.
4. Update the now-stale comment in api/t2-daraxt-ustunlar.ts stating the packet never carries the field (it is optional here). Existing base-column shape remains unchanged for legacy packets; extended packets include f2_summa_yoq.
5. Parent must define F2 document podval metadata separately before worker document-valuation support; row source amounts alone are insufficient. No fallback to smeta podval asserted here.

## Validation for this update

- Focused final run: 3 files / 22 tests PASS. Command from frontend: npx vitest run src/lib/hisob-yadro/holat.paritet.test.ts src/ombor/hisob-worker.test.ts src/lib/hisob-yadro/hisob-yadro.guard.test.ts --maxWorkers=1 --no-file-parallelism.
- Broader focused packet compatibility probe: paket.test.ts has 5 PASS / 2 FAIL, both stale zero expectations for an unknown material amount. Failures at materializer assertion line 87 and tree assertion line 93; fixture qator_id 12 uses fakt_summa:null but expects f2_mumkin_summa:0. Actual value is now null per owner contract. Unowned packet.test.ts intentionally not edited. Parent should replace that expected zero with null and reconcile its exact legacy-SQL-parity wording with canonical signed/null behavior. All other tested packet cases passed.
- Governance FAIL: pre-existing C11-WAREHOUSE-LEDGER vs C11-WAREHOUSE-CONTRACT path overlap; stale CURRENT_STATE warning. Foreign records were not changed to bypass it.
- TypeScript: npx tsc -p tsconfig.app.json --noEmit PASS (exit 0). D3a-only whitespace diff vs exact main PASS. Whole staged merge whitespace check flagged three pre-existing imported main files: journal-window.config.ts:11, journal-window.test.tsx:168, ui-harness/fixtures.ts:146 under frontend/testlar/pto-integration-20261026 (blank line at EOF); left unchanged. Full suite, application/Worker build, perf/session/browser/SQL/live differential acceptance remain parent-owned and were not run in this update.

## Historical evidence (2026-10-31, not current validation)

# D3a — Worker o‘qish modeli poydevori

## 2026-11-02 — D3b retained hisob davomi

Branch `codex/desktop-d3-retained`, D3a `c785517` ustidan. Source commit `33b8a435`; current main `bf96ca7d796b5d94dda136ec23aa691c36f154f8` ishchi branchga `dabaa60a` bilan merge qilindi. Main/prod yozuvi yo‘q.

- Yadro `daraxt-yigish.ts`: serverdagi amaldagi `t2_qator_tahrir` norma kaskadi va `t2_rollup` tartibi; numeric ROUND2 qilinmaydi. `decimal.js@10.6.0` mustaqil100digit clone bilan ishlatiladi. Dependency avval transitive/dev edi, endi direct pinned; boshqa lock churn kiritilmadi. RZ display subtotal canonical RZ summa bilan aralashtirilmaydi;30k chuqurlik rekursiyasiz, sikl/yo‘q ota rad.
- Worker snapshotni bir marta ochadi; keyin IDli kichik tahrir va≤500qatorlik o‘qish. Revision CAS, epoch, takror INIT/eski close rad; FIFO klient, close/logout navbati rad. Katta kaskad faqat summary+invalidatsiya qaytaradi,26k qator main-threadga qayta ko‘chmaydi. Approved F2 snapshotiga yozish buyrug‘i yo‘q; son/summa manbadan saqlanadi. Har lokal hisob `taxminiy:true`; server version oshirilmaydi, exportga serverTasdiq bermaydi.
- Fokus31test PASS (D3b16 + oldpacket/Worker15). `desktop-hisob-parity.mjs`: haqiqiy repo SQL funksiyalari disposable PGlite ichida,241solishtiruv/240mutatsiya PASS. Production ulanish yo‘q. Scope faqat faol fixturelar; triggerli version/audit yoki barcha historical-version parity isboti emas. Server rollup tarixiy versiyalarni ham o‘qishi mumkin, paket faqat faol — bu farq keng runtime acceptance’da ochiq.
- Production bundle alohida Node threadda26k fixture: INIT139.58ms; oddiy tahrir0.59–1.98ms; hamma26k normani kaskadlash23.48ms (Worker21.40ms),257byte javob. Avval shu kaskad78ms edi. Natija takroriy norma/narxli sintetik datasetga tegishli; har qanday real26k yoki browser-render50ms degan claim emas. Boshqa yuklamada100ms ham kuzatilgan, vaqt kafolati yashirilmaydi.
- Keng variant: `$env:VARIED='1'; node src/ombor/hisob-retained-smoke.mjs` —97norma×31narx,26kqator, jami va frozenF2PASS. INIT199.87ms, oddiytahrir0.79–2.13ms, to‘liqkaskad68.18ms/261byte. Demak50ms barcha datasetda hali PASS emas.
- Brauzer sinov HTML: `/src/ombor/hisob-browser-smoke.html`, lokal Vite127.0.0.1:5179. IAB ochish timeout; Computer Use Chrome URLni ishonchli aniqlay olmagani uchun shu turnda blokladi. Brauzer/desktop GUI acceptance UNKNOWN, cheklov chetlab o‘tilmadi. Lokal web business ma’lumoti ishlatilmadi.
- Full Vitest jarayoni: exec51698, log `C:/Temp/desktop-d3b-vitest.log`. TS/functionsTS/lint/tekshir/build jarayoni exec70855 (loglar `C:/Temp/desktop-d3b-*`). Terminal holatni tekshirmasdan qayta boshlamang. Governance avvalgi4 policy/owns FAIL; yangi lane konflikti yo‘q. Yakuniy gate natijalari hali pending.
- AppTS/FunctionsTS/lint/tekshir/Vitebuild exit0 (70855 tugadi); build14.96s. Fullsuite’da `SmetaStudio.test.tsx:84`1619ms FAIL ko‘rindi; detail va terminal kutilmoqda. Alohida aynan shu test exec53445 bilan tekshirilmoqda, Studio source/test o‘zgarmagan. Hozircha fullsuitePASS deb aytilmaydi.

Qolgan ish: real browser/runtime hook; Fakt-derived/almashtirilgan qiymatlari, server bilan keng differential parity, tarixiy versiya muammosi; encrypted session key/auth wiring; D4delta/D5offline buyruqlar; licensing/catalog/updater. Butun D3 yoki Windows mahsulot READY emas.

Run: `frontend`dan `node src/ombor/hisob-retained-smoke.mjs`; rootdan `$env:PGLITE_DIR='.../@electric-sql/pglite'; node supabase/tests/desktop-hisob-parity.mjs`. Decimal docs: https://mikemcl.github.io/decimal.js/ .

Codex@noutbuk; base `fc4f0eab8bba5e24d9752f5e1d27618742999ee7`; `codex/desktop-d3-worker`.

## Nima o‘zgardi

- `ombor/paket.ts`dagi mavjud hosila ifodalar aynan `lib/hisob-yadro/holat.ts`ga ko‘chirildi. Eski decoder ham shu funksiyani chaqiradi; yangi narx/pul formulasi yo‘q. Source F2 amount qayta hisoblanmaydi. PostgreSQL GREATEST(NULL,0)ning mavjud semantikasi saqlangan.
- `ombor/hisob.worker.ts` production module Worker, typed message protocol va toza handler. Mavjud dekoder/reader ishlatiladi. Xato paketda yarim natija yoki xom diagnostika qaytmaydi.
- `hisob-mijoz.ts`: request/epoch/revision, oldingi so‘rovni bekor qilish, kech A javobini Bga qo‘llamaslik, close/crash/messageerror/timeout cleanup. Worker serverTasdiqni bermaydi. Mijoz logout/obyekt almashishda yopilishi shart.
- Runtime hook yoki feature flagning eski yo‘li o‘zgartirilmadi. Bu modul hali sahifaga ulanmagan.

## Tekshiruv

Focused20 PASS: existing paket parity, core guard, synthetic hosila oracle, Worker request/close/race/timeout/error,30k fixture. AppTS/FunctionsTS/lint PASS; tekshir PASS; Vite app build PASS; Worker alohida Vite production build PASS (6.09kB). Lintdagi mavjud warninglar saqlangan. Governance4oldingi owns/policy FAIL; bu lane yangi conflict kiritmadi.

Full Vitest:584fayl/4262test PASS,12fayl/25test skip,471.77s (`C:/Temp/desktop-d3-vitest.log`). TypeScript va Functions alohida exit0; `git diff --check` PASS. Ruxsatli branch push/PR bor, main integratsiyasi yo‘q.

`node src/ombor/hisob-thread-smoke.mjs` (`frontend`dan) production Worker bundle’ni alohida Node thread’da WebWorker port adapteri orqali ishlatadi.26k synthetic qator, exact F2 saqlanishi PASS. O‘lchov: compute cold47.15ms, warm17.75/14.17/10.20ms; to‘liq message roundtrip121.59/92.27/93.71/79.88ms. Bu haqiqiy thread, lekin browser render/login yoki server parity acceptance emas. Vaqt mashina/yuklamaga bog‘liq.

## D3 hali tugamagan

To‘liq D3 tahrir→jami≤50ms mezoni PASS emas. Har safar katta paket/resultni structured-clone qilishning o‘zi ortiqcha vaqt oladi. Keyingi D3b: Worker ichida obyekt snapshotini ushlash; faqat canonical IDli o‘zgarish yuborish; iterativ daraxt/rollup va norma kaskadini aynan server manbasi bilan isbotlash; kichik o‘zgargan-natija qaytarish. RZ/BL rollup va norma mutatsiyalari bu PRda yo‘q. Real server differential/shadow parity, actual browser Worker roundtrip va UI ulanishi ochiq. Snapshotlar bir-biriga qo‘shilmaydi; approved F2ni lokal tahrirlash eshigi yo‘q.

Main/prod o‘zgarmadi, migratsiya yo‘q. Claude independent reviewdan keyin integratsiya qiladi. Goal ACTIVE.
