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
