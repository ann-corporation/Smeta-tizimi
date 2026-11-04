# Windows qobig‘i — D6 tayyorgarlik

Codex@noutbuk; branch codex/desktop-tauri-shell; base fc4f0ea.
Accepted ADR: docs/architecture/OBYEKT_PAKET_OFFLINE_DESKTOP_V1.md §4.

## Hozirgi qamrov

Tauri 2 Rust entrypoint, local frontendDist, cheklangan capability/CSP, NSIS currentUser, WebView2 embedBootstrapper. Ikonka existing frontend/public/favicon.svg dan official tauri-cli icon orqali yaratildi. Cargo.lock dependency snapshot saqlanadi. Remote saytga redirect qilinadigan qobiq emas, web dist binarga joylanadi.

Build: `powershell -File frontend/src-tauri/desktop-build.ps1`. CLI 2.12.4. Frontend production build ishlatiladi; Vite dev session stub ishlatilmaydi.

## Ochiq bog‘liqliklar

Hali desktop mahsulot ready emas. D1-D5 offline/delta/commands va D6 auth Bearer/Credential Manager/CORS, Excel-open, updater qoladi. Auth fayllari boshqa agent lane’ida, parallel tahrir qilinmadi. D7/D8 litsenziya va shifrlangan katalog keyingi ishlar. Installer code signing sertifikati yo‘q; signed publisher claim yo‘q.

## Muhit

Rust stable MSVC mavjud. Birinchi cargo check `link.exe not found`: mavjud VS Community2022 ichida C++ Tools/Windows SDK yo‘q. VS Installer orqali NativeDesktop komponentlarini qo‘shish ishga tushirildi; installer holati va keyingi cargo/build natijasi alohida qayd qilinadi. Real biznes/DB yozuvi bajarilmaydi.

## Tekshiruvlar (31.10)

- Frontend `npm run build`: PASS (production, TypeScript app/functions va Vite); mavjud katta chunk warninglari bor.
- `desktop/fetch-shim.test.ts`: 7 PASS; keyingi `tsc -b` va focused oxlint PASS.
- `cargo fmt --check`: PASS.
- `tauri info`: config/React/Vite va WebView2 aniqlangan. Dastlab MSVC/SDK yetishmagan; installer faol holda to‘ldirilmoqda. Rust compile PASS deb belgilanmadi.
- Governance: 4 oldingi AKKAUNT/DIZAYN/C11 flag/lock xatosi; yangi desktop lane boshqa yo‘llarga kesishmaydi.

`fetch-shim.ts` standalone: faqat lokal `/api/` → qat’iy production origin, Bearer sessiya portidan; caller Cookie/Authorization olib tashlanadi; redirect error; tashqi/asset so‘rovlarda token o‘qilmaydi. Bootstrapga ulanmagan: server Bearer/keyring lifecycle keyingi ulash talabidir. Qo‘llanmada auth tayyor yoki offline ishlaydi deb ko‘rsatilmaydi.

## Yangilanish — 22:48

MSVC14.44 + Win11SDK26100 o‘rnatildi; Rust `cargo check --locked` PASS (2m29s). `maxfiy.rs` Windows-native keyring3.6.3 bilan sessiya tokenini faqat fixed service/account uchun saqlash/o‘qish/o‘chirish; serialized mutex, max2400byte, control chars rad; logga token yo‘q. Bu uch command Tauri local invoke_handlerga ulandi. `cargo check` keyring bilan ham PASS (10.28s). Pure validation Rust testi yozilgan, hali cargo test ishlatilmagan. Haqiqiy credential yozilmadi.

Release installer build ishga tushirildi: `C:/Temp/desktop-tauri-installer-build.log`. Yakun natijasi olinmaguncha installer ready emas. Keyring API: https://docs.rs/keyring/3.6.3/keyring/ . Auth token issuance/CORS/bootstrap va ombor key lifecycle ulash ishlari ochiq.

## Yakuniy o‘lchangan checkpoint — 23:03

- Release compile PASS. `.exe` 10,147,328 bytes; local WebView2 oynasi ochildi.
- Microsoft bootstrapper native downloader timeout; official URLdan curl bilan olindi, Authenticode `Valid`, Microsoft Corporation. `desktop-bootstrap.ps1` shu tekshiruvni buildga ulaydi.
- NSIS bundle PASS: `frontend/src-tauri/target/release/bundle/nsis/Smeta Tizimi_0.1.0_x64-setup.exe`, 7,525,872 bytes; SHA256 `104AED091F61FBBA1E465A7584758E023AAB41EAF4F511703152428F8633F1E2`. Runtime source checkpoint `fa6d535`; keyingi o‘zgarishlar test/build-helper/docs.
- `/S /D=C:\Temp\SmetaDesktopSmoke` → exit0; o‘rnatilgan `.exe` va uninstall mavjud. HKCU uninstall entry mavjud. Installed `.exe` SHA256 `437D2CF3343F1F380162BF07CD4BBF7502F127BC58186CD742B58216C56B80A5`.
- O‘rnatilgan `C:/Temp/SmetaDesktopSmoke/smeta-desktop.exe` Windows oynasida `http://tauri.localhost/` lokal landing interfeysi real ochildi. Login yoki canonical biznes amallari sinovdan o‘tmadi, fallback auth yo‘q.
- Rust test2/2 PASS: token validator va alohida synthetic Windows Credential Manager service’da set/get/delete/NoEntry. Real sessiya credentiali o‘zgarmadi.
- NSIS qayta bundle qilganda `__TAURI_BUNDLE_TYPE variable not found` warning chiqdi; updater hali yozilmagan, updater acceptance OPEN. Installer imzosiz (`NotSigned`); sertifikat hali yo‘q.

GOAL ACTIVE. To‘liq vazifa D1–D8 bo‘yicha tugamagan. Keyingi: Claude bilan D1b/session kontrakti, desktop bootstrap/serverBearer/CORS, keyin offline/delta/worker/commands/licensing/catalog acceptance. Shu installer daily-use yoki offline-ready deb tarqatilmaydi.

## 04.11.2026 — проверка файла Windows перед публикацией

`frontend/src-tauri/desktop-release-verify.ps1` принимает путь к EXE, ожидаемый SHA-256 и отпечаток одобренного сертификата. Оба значения поступают из независимой записи релиза L0, а не вычисляются из скачанного файла для проверки самого себя. Успех возвращает JSON; несовпадение хеша, недействительная подпись или чужой сертификат останавливают проверку. Скрипт ничего не публикует.

Контроль: текущий локальный Smeta 0.1.0 отвергнут с неверным SHA и с верным SHA, но без подписи. Подписанный Microsoft bootstrapper использован только как контроль проверки подписи; неверный отпечаток отвергнут. Production installer, реальный login и публичная ссылка остаются открыты. CTA на intro согласуется с владельцем PublicEntry после готовности релиза.

Дальше: Android SDK/NDK и проверка на устройстве; macOS — сборка на Mac и подпись/нотаризация; iOS — Xcode и TestFlight. Повторное использование Tauri/React — предложение на согласование L0. https://v2.tauri.app/start/prerequisites/ и https://v2.tauri.app/distribute/
