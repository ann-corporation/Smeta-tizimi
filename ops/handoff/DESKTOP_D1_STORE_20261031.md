# D1a — mijoz ombori poydevori

TASK: DESKTOP-D1-STORE-20261031 · Codex@noutbuk
BASE: fc4f0eab8bba5e24d9752f5e1d27618742999ee7
BRANCH: codex/desktop-d1-store

Egasi topshirig‘i: `CODEX_DESKTOP_DASTUR_PROMPT.md`, D1/PR2.
Bu kichik PR D1ning saqlash qismidir. Sahifa hooklari, auth lifecycle va eksportga ulash keyingi PR; hozir runtime xatti-harakati o‘zgarmaydi.

- `saqlash.ts`: Tauri uchun ham almashtiriladigan storage port, musbat numeric actor/company scope.
- `ombor-idb.ts`: mavjud idb-keyval, alohida t2-ombor/v1; gzip va AES-GCM; AAD ichida company/user/object kaliti. CryptoKey callerga tegishli, diskka yozilmaydi.
- `obyekt-ombor.ts`: server snapshot, stable getSnapshot/subscribe; xotira 3, disk 30 obyekt. Xotira insertion/access tartibi; disk hozir bounded eviction, to‘liq persisted LRU D1bda. Keshdan ochish tasdiqsiz. Serverdan snapshot kelgandagina serverTasdiq=true. Yopish davom etayotgan yozuvdan keyin o‘z scope diskini o‘chiradi; boshqa foydalanuvchi kalitlariga tegmaydi. Kech disk javobi yangi server snapshotini bosmaydi.
- Formula qo‘shilmagan, mavjud paketDekod ishlatiladi. DB migratsiya va real biznes data yo‘q.

## Keyingi PR — D1b, hali bajarilmagan

`bayroq.ts`, `useObyekt.ts` va mavjud `useT2Daraxt`ga integratsiya. Hookni feature flagga qarab shartli chaqirish React hook tartibini buzishi mumkin: adapter tanlovini hooklar sonini o‘zgartirmasdan qilish kerak.
`f2.read`/`narx.read` yetmasa eski reader ishlaydi; scope/current authority tekshirilgach kesh ko‘rsatiladi. `403/401`da persisted paketni ko‘rsatish to‘xtatiladi. CryptoKey sessiya lifecycle, logout/access revoke tozalashiga ulanadi. Eksportning amaldagi serverTasdiq/qoshimchaTayyor gate’lari saqlanadi. 26k ikkinchi ochilish <300ms hali o‘lchanmagan; Tauri installer hali yo‘q.

## Review

Independent Claude reviewdan keyin merge. Production DBga yozish yo‘q. Bu PRning o‘zi offline app yoki desktop installer ready degani emas.

## Gate natijalari

- Focused Vitest: 2 fayl / 13 test PASS (31.10.2026).
- `npx tsc -b`: PASS (erasableSyntaxOnly constructor xatosi tuzatilib qayta tekshirildi).
- `npx tsc -p tsconfig.functions.json`: xatosiz; functions o‘zgarmadi.
- `npm run lint`: PASS, mavjud warninglar bor; yangi ombor fayllari focused oxlint xatosiz.
- `git diff --check`: PASS.
- To‘liq `npx vitest run --maxWorkers=4` (`a25c5dc`): 583 fayl PASS / 12 skip; 4258 test PASS / 25 skip, 522.50s. Lokal log: `C:/Temp/desktop-d1-vitest.log`.
- `node ops/governance-check.cjs`: FAIL — avvalgi 4 xato: AKKAUNT production flag, AKKAUNT/DIZAYN kirish va public-entry overlaps, C11 contract/ledger overlap. Yangi D1 owns boshqa tasklar bilan kesishmaydi.

Qabul: saqlash mantiqi focused testda tekshirildi; real IndexedDB browser smoke, auth/logout ulanishi, 26k performance, D1b va independent review hali kerak. Umumiy release READY emas.

## Davomi — o‘qish adapteri

`oqish.ts`: portlar bilan tekshiriladigan o‘qish oqimi. Flag yoki paket ruxsati o‘chiq — avvalgi reader. Kesh hech qachon serverTasdiq bermaydi; 403 → ombor yopilib, eski API o‘z ruxsatini tekshiradi; 401 yopiladi va fallback yo‘q. Javobdagi company/object tekshiriladi, epoch bilan eski javoblar chiqmaydi. Kesh o‘qish/yozish xatosi yoki osilib qolishi server javobini to‘xtatmaydi. `bayroq.ts`: `t2.ombor=1`, sukut o‘chiq. Runtime hook HALI ulanmagan; shu sabab flagni yoqish hozir saytni tezlashtirmaydi.

Davom tekshiruvi: 3 fayl/24 focused test PASS; `tsc -b` PASS; ombor focused oxlint PASS; diff-check PASS. Oldingi full suite natijasi yuqorida o‘z SHA doirasida qayd etildi; yangi loader suite alohida o‘tdi.

Claude bilan kelishiladigan ulash: session CryptoKey lifecycle (refresh/offline va logout) hamda `useT2Daraxt.ts` uchun owns. Bu fayllarga parallel tahrir qilinmadi. D1ning qolgan qabul mezonlari ochiq.
