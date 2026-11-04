# Локальная приёмка Desktop M5

Только изолированный стенд: loopback127.0.0.1:5214, in-memory PGlite, реальные новые Desktop handlers и миграция20261202000000. Канонические actor/объект/пакет — синтетические SQL fixtures. Проверка пароля /api/kirish — authstub: это не проверка production login. Исходящий HTTP, кроме синтетической DB, заблокирован.

## Запуск

Нужны установленные frontend зависимости и @electric-sql/pglite в отдельном тестовом каталоге. При необходимости задайте PGLITE_DIR абсолютным путём к пакету. На проверенном ноутбуке пакет расположен C:/Temp/hr-pglite/node_modules/@electric-sql/pglite. Production credentials не нужны и не читаются.

```powershell
node frontend/src-tauri/e2e/server.mjs
```

Дождитесь ready:true. Сервер создаёт временные signing secrets только в памяти и сохраняет ТОЛЬКО публичные настройки в C:/Temp/GAS-M5-local-public.ps1.

В другом терминале из frontend:

```powershell
. C:/Temp/GAS-M5-local-public.ps1
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
& frontend/src-tauri/e2e/control.ps1 revoke -Actor 1
```

smoke.mjs проверяет реальные Desktop issue/gateway/lease, company, sb, packet,304, границы компании, Ed25519 и отзыв401. Он отзывает устройства fixture actor1: не запускайте одновременно с UI-приёмкой.

abort закрывает тестовые TCP запросы: native получает реальную сетевую ошибку; интернет ноутбука не отключается. Команда offline возвращает503 и используется отдельно: отказ сервера не выдаётся за физическое отключение сети.

UI: установить новый NSIS в отдельный каталог, войти fixture, открыть «Oflayn obyektlar» → объект101; abort → открыть сохранённый пакет; закрыть/запустить приложение без сети и повторить; online → обновить (304); revoke → обновить (401), данные должны исчезнуть. Сохранить скриншоты и обезличенный stats. Не сохранять raw Bearer/cookie/private key. Live owner acceptance остаётся отдельным действием L0.

Перед первой сборкой конкретного исходного SHA обязательны app/functions TypeScript, lint и focused tests. В e2e config повторный beforeBuildCommand выполняет только Vite: при смене временного public key неизменённый TypeScript не проверяется повторно. Основной tauri.conf.json сохраняет полный TS gate; CI не отключается.

