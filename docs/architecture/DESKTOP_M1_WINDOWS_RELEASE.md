# Windows x64 — выпуск 0.1.0

Из корня репозитория на Windows с Node.js, Rust MSVC и Windows SDK:

```powershell
.\frontend\src-tauri\desktop-build.ps1 -ReleaseDir C:\Temp\smeta-release-0.1.0
.\frontend\src-tauri\desktop-release-r2.ps1 -ReleaseDir C:\Temp\smeta-release-0.1.0
```

Каталог выпуска должен быть новым. Скрипт собирает x64 NSIS, сохраняет INSTALL_RU.md и UTF-8 installer-manifest.json: версия, архитектура, имя файла, байты, SHA-256, UTC-дата и статус подписи. NotSigned — разрешённый владельцем вариант без подписи.

Для подписи передайте -SignerThumbprint сертификата текущего пользователя. SignTool должен быть в PATH; SMETA_SIGN_TIMESTAMP_URL — утверждённый HTTPS RFC 3161 endpoint. Манифест создаётся после подписи и проверки. При загрузке подписанного выпуска также нужен -ApprovedSignerThumbprint.

R2-скрипт по умолчанию выполняет только локальную проверку, без сети и учётных данных. Публикует только L0: устанавливает AWS CLI, задаёт R2_ACCOUNT_ID, R2_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY в окружении и добавляет -Upload. Префикс: windows/<version>/<sha256>/. EXE и инструкция идут раньше манифеста. Codex загрузку не выполнял.

## Проверенный локальный артефакт

Исходный build до переноса ветки на main 9a6d4ec1: npm ci завершён; TypeScript, Vite и Rust release x64 завершены. Каталог C:/Temp/Smeta-M1-new-1104, журнал C:/Temp/Smeta-M1-build-1104.log. Размер EXE: 7632695 байт; SHA-256: 9b8379e389f7119857644b380034bb684ec3fa15e25ad249db50fed453224f2f; Authenticode NotSigned. Повторная проверка манифеста и R2 dry-run прошла. Это не installer нового main: перед выпуском L0 пересобирает точный принятый SHA и повторяет проверку. cargo test/clippy, полная Vitest и установка этого артефакта пока не подтверждены.

Для M2 генератор читает этот манифест и формирует desktop-release.json. Прежде чем включать CTA, L0 должен разместить файлы по тем же путям /windows/... на origin сайта; наличие объектов R2 само по себе этот маршрут не создаёт.
