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
