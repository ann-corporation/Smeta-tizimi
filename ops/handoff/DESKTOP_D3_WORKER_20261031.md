# D3a — Worker o‘qish modeli poydevori

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
