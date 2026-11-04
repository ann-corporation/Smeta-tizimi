# Desktop M2 — блок загрузки Windows

Основа main 9a6d4ec1. Новый компонент подключён одним mount в Hero PublicEntry; другие блоки не изменялись. Без корректного публичного манифеста загрузка скрыта. Шаблон содержит версию, размер, SHA-256, копирование, предупреждение NotSigned и ссылку на русскую инструкцию. Все новые строки имеют uz/ru/en.

Генерация после размещения файла L0 (из frontend):

```powershell
node scripts/generate-desktop-release.mjs C:/Temp/smeta-release-0.1.0/installer-manifest.json
```

Выход — public/desktop-release.json. Скрипт отказывается перезаписывать существующий файл. Устаревший манифест заменяется только осознанным релизным действием L0. Сначала разместить проверенные EXE/INSTALL_RU.md на origin сайта по /windows/<version>/<sha256>/, затем публиковать манифест. Сам R2 upload не создаёт same-origin маршрут. Текущий PR не включает публичный манифест: доступного релизного маршрута ещё нет.

Проверки: generator 1PASS, компонент и i18n 21PASS до rebase; tsc -b и lint после rebase PASS (lint с существующими предупреждениями), общий Node gate PASS. Полная Vitest выявила сбой SmetaStudio.test.tsx: ранее скрытый pricing view; полного зелёного результата нет. Build запущен, результат уточняется отдельно.

Для воспроизводимой проверки узкой колонки: npm run dev, открыть /testlar/desktop-download-mobile.html. Это синтетический манифест, ссылки не ведут на реальный installer. Колонка 320px с CSS PublicEntry и настоящим компонентом; DOM-тест не доказывает геометрию браузера. Browser Use не смог подключить локальный WebView (timeout), поэтому визуальная мобильная приёмка не подтверждена. Компонент использует min-width:0 и overflow-wrap:anywhere для длинного хеша.
