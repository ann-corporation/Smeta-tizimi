# Локальная приёмка Desktop M5

Только изолированный стенд: loopback127.0.0.1:5216 (или `SMETA_M5_PORT`), in-memory PGlite, реальные Desktop handlers и миграция20261202000000. Канонические actor/объект/пакет — синтетические SQL fixtures. Проверка пароля /api/kirish — authstub: это не проверка production login. Исходящий HTTP, кроме синтетической DB, заблокирован.

## Запуск

Нужны установленные frontend зависимости и @electric-sql/pglite в отдельном тестовом каталоге. При необходимости задайте PGLITE_DIR абсолютным путём к пакету. На проверенном ноутбуке пакет расположен C:/Temp/hr-pglite/node_modules/@electric-sql/pglite. Production credentials не нужны и не читаются.

```powershell
$env:SMETA_M5_PORT='5216'; node frontend/src-tauri/e2e/server.mjs
```

Дождитесь ready:true. Сервер создаёт временные signing secrets только в памяти и сохраняет ТОЛЬКО публичные настройки в C:/Temp/GAS-M5-current-public.ps1.

В другом терминале из frontend:

```powershell
$env:SMETA_M5_PORT='5216'; . C:/Temp/GAS-M5-current-public.ps1
npx --yes @tauri-apps/cli@2.12.4 build --target x86_64-pc-windows-msvc --features desktop-e2e --config src-tauri/e2e/tauri.e2e.json --bundles nsis
```

Featuredesktop-e2e требует отдельный identifier uz.anncorp.smeta.e2e и отдельный keychain service. Только эта сборка допускает HTTP loopback. Её нельзя публиковать как обычный релиз. Перезапуск сервера меняет signing pair: после него старый installer не принимает новые lease, необходимо пересобрать с новым public file.

Fixture login: m5-synthetic / M5-synthetic-only!; company1, object101, чужой объект202. Это не существующая учётная запись пользователя.

## Проверки и управление

```powershell
node frontend/src-tauri/e2e/smoke.mjs
& frontend/src-tauri/e2e/control.ps1 stats
& frontend/src-tauri/e2e/control.ps1 abort
& frontend/src-tauri/e2e/control.ps1 online
```

smoke.mjs проверяет реальные Desktop issue/gateway/lease, migration quota (30 разрешено, 31-й запрос даёт 429), company, sb, packet/304, границы компании, Ed25519 и DELETE self-revoke/401. `/api/ish-joyi` остаётся за пределом BFF allowlist и фиксируется как `400 TARGET_INVALID`; smoke не имитирует этот маршрут.

abort закрывает тестовые TCP запросы: native получает реальную сетевую ошибку; интернет ноутбука не отключается. Команда offline возвращает503 и используется отдельно: отказ сервера не выдаётся за физическое отключение сети.

UI: установить новый NSIS в отдельный каталог и войти fixture; открыть существующий список объектов `/admin/obyektlar`, выбрать синтетический объект 101 и открыть его обычную smeta/daraxt sahifasi (`/admin/test/daraxt`). Abort кезінде sahifani yangilang yoki mavjud obyekt sahifalari orasida o‘ting; ilovani yoping va qayta ochib, saqlangan obyekt paketini tekshiring; `online` holatiga qaytgach yangilang (304). Self-revoke va keyingi 401 alohida HTTP smoke’da tekshiriladi, boshqaruv panelida global revoke amali yo‘q. Faqat lokal sintetik obyektlardan foydalaning; Bearer/cookie/private key’larni saqlamang. Live owner acceptance L0 doirasida alohida qoladi.

Перед первой сборкой конкретного исходного SHA обязательны app/functions TypeScript, lint и focused tests. В e2e config повторный beforeBuildCommand выполняет только Vite: при смене временного public key неизменённый TypeScript не проверяется повторно. Основной tauri.conf.json сохраняет полный TS gate; CI не отключается.

