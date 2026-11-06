# Desktop M5 — изолированный стенд

Только loopback127.0.0.1:5216, PGlite и синтетические бизнес-данные; реальные Desktop handlers и миграции. Пароль — authstub, не production login. Никаких live credentials или исходящего HTTP.
Prerequisites: frontend/node_modules, MSVC developer shell, PGlite (PGLITE_DIR либо C:/Temp/hr-pglite/node_modules/@electric-sql/pglite).
Из repo: `node frontend/src-tauri/e2e/server.mjs`; дождаться ready:true. Из другого терминала: `node frontend/src-tauri/e2e/smoke.mjs` (один свежий прогон перед GUI; он отзывает собственное устройство).
Сервер пишет только публичные build settings в C:/Temp/GAS-M5-current-public.ps1. Из frontend загрузить `. C:/Temp/GAS-M5-current-public.ps1`, затем `npx --yes @tauri-apps/cli@2.12.4 build --target x86_64-pc-windows-msvc --features desktop-e2e --config src-tauri/e2e/tauri.e2e.json --bundles nsis`.
Повторный запуск сервера меняет signing pair: installer нужно пересобрать. Feature требует отдельный identifier/keychain uz.anncorp.smeta.e2e; тестовый installer не публиковать как релиз. TS/lint/focused gates обязательны перед первой сборкой конкретного source SHA.
Fixture login: m5-synthetic / M5-synthetic-only!; company1, object101; чужой202. Войти штатной формой и выбрать объект через существующую Smeta/Fakt страницу.
`& frontend/src-tauri/e2e/control.ps1 abort` закрывает только тестовые TCP; `online` восстанавливает; `offline` возвращает503 (это другой тест); `stats` показывает обезличенные счётчики.
Сценарий: online object→abort→refresh→cold restart→тот же объект→online→refresh/304. Никакого отдельного offline UI. Записывать exact SHA/installer hash/screenshots; HTTP smoke и native acceptance различать.
Неизвестные RPC/таблицы/маршруты регистрируются в stats. /api/ish-joyi принимает только GET с точным ?bolim=joylarim; список рабочих мест не входит в этот fixture. /api/hujjat-royxat вне BFF allowlist.
Протокол и текущие пределы приёмки: docs/architecture/DESKTOP_E2E_2026-11.md (отдельная evidence-поставка). Никаких Bearer/cookie/private key/реальных сумм в артефактах.
