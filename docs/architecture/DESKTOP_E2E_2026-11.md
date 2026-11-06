# Desktop M5 — текущая native-приёмка Windows

Статус 06.11.2026: **нативный сценарий cold offline → reconnect/304 пройден на сборке с исправлением #286**. Ниже приведены текущие результаты и исторический прогон.

## 06.11.2026. Cold offline и восстановление связи

Сборка `e16f2820518c26f767514a0966b9b3c3f91ad038` основана на `2ed66b869493f258cf508685c03e05e985061d07` после merge #278 и #279. Исправление в ней соответствует PR #286 (`75a72749`). [Манифест установленной сборки](DESKTOP_E2E_assets/native-ipc-fixed-install-20261106.json).

1. На сборке без #286 после входа зависало чтение дерева объекта 101. Tauri IPC вызывает глобальный fetch, а обёртка ошибочно запускала повторный IPC из сохранения маршрута. На сборке с #286 дерево и состояние загрузились по штатному пути Smeta/Fakt.
2. Переключил только локальный стенд в режим TCP abort, закрыл приложение и запустил снова. Восстановился маршрут `/admin/holat/101`, на экране появился раздел сметы и режим чтения. Счётчики чтений дерева и состояния на сервере остались 5/5. Число оборванных запросов выросло с 2 до 24.
3. Перевёл стенд online и нажал «Yangilash». Счётчик HTTP 304 вырос с 1 до 2, чтения дерева и состояния выросли до 9/9. Исходный 304 относится к HTTP smoke, приращение относится к Windows-приложению. Объект остался открыт.
4. Офлайн меню документов показало блокировку Excel из-за недоступных признаков дополнений/замен. Подсказка PTO об офлайн-источнике сохранилась после reconnect. Проверка отсутствующих финансовых полей и F2 footer выполнена в синтетическом HTTP smoke. Полная проверка экспорта, общего флага serverTasdiq и операций записи в UI остаётся открытой.

[Этапы и счётчики](DESKTOP_E2E_assets/native-ipc-fixed-stats-20261106.json) · [Выписки из интерфейса](DESKTOP_E2E_assets/native-ipc-fixed-ax-20261106.txt).

## Исторический прогон 05.11.2026

Base main `0027062d4fde6a81b54c91208eae3e8336ef24b4`, source `59ec8f49c8ca3026223a63afb3c6709768d0c42a`. В этой сборке cold offline restart остался на PublicEntry.

## Стенд и границы

Новый NSIS, identifier `uz.anncorp.smeta.e2e`, отдельный keychain service, feature desktop-e2e, loopback127.0.0.1:5216. Реальные Desktop issue/lease/gateway, middleware, session/company/sb/packet handlers и миграция20261202000000; PGlite и бизнес-данные синтетические. Пароль — **authstub**, не production login. Исходящий HTTP стенда запрещён; сеть ноутбука не отключалась. Private keys/cookies/Bearer не сохранялись. Production/main/R2/DB не изменялись.

Installer SHA256 `14B8FA6ACAA89783D8DA25C0A26A43F87713B5BDAA7ADEA9DBB8FB9E9D3C200F`; installed EXE SHA256 `94440E3E84EAEBC014102E37E3D6DB6D78328E3AFCC91E9388342DE7C835E6F7`, NotSigned. Silent install exit0, фактический каталог C:/Users/anvar/AppData/Local/Smeta M5 CURRENT MAIN. [Манифест установки](DESKTOP_E2E_assets/native-current-install-20261105.json).

## Проверено Computer Use в установленном приложении

1. Fixture login через штатную форму; компания и роль PTO отображаются. Первоначальный fixture без `context_kompaniyalar.faol` исправлен и защищён assertion. Это не дефект production company context.
2. Через sidebar открыт `/admin/holat`, обычным списком выбран M5 SYNTHETIC OBJECT(101). Загружена существующая страница «Smeta va bajarilish», не отдельное offline-приложение.
3. Online прочитаны реальные `/sb` projections t2_daraxt/t2_qator_holat; пакет/lease получены native transport. Дополнительные отсутствующие источники показывают ошибки, а не успешные заглушки.
4. Control abort закрыл TCP только loopback-стенда. На той же странице нажато Yangilash: данные остались доступны, появился баннер «Oflayn rejimda faqat oʻqish mumkin».
5. Офлайн Hammasini yoyish раскрыл section/work/material: исходные объёмы10/20, факт2, F2объём2. Это чтение строк, не подтверждение всех финансовых итогов или UI-запрета каждой кнопки записи.
6. Приложение закрыто и открыто при TCP abort: PublicEntry `/`, сохранённый объект штатным потоком не восстановлен. Cold offline acceptance НЕ пройдена; потеря keychain/token этим не доказана.
7. Стенд возвращён online. Reconnect/304 проверены HTTP smoke; native восстановление того же объекта после cold restart не подтверждено.

![Существующая страница объекта online](DESKTOP_E2E_assets/native-current-object-online-20261105.png)
![Та же страница, TCP abort, раскрытые cached строки](DESKTOP_E2E_assets/native-current-offline-expanded-20261105.png)
![Cold offline restart остался на PublicEntry](DESKTOP_E2E_assets/native-current-cold-offline-20261105.png)

## Проверки исходников и HTTP

На текущем main baseline app/functions TypeScript, scoped lint,106focused PASS. Desktop Vite/Rust release/NSIS build PASS (после смены signing pair пересобрано). Rust/runtime код M5 не менялся; прежние23native теста не выдаются за повторный текущий прогон.

После исправления active-company fixture HTTP smoke PASS: issue/check/revoke; company; decoder-backed tree/holat; NULL price/F2 и footer в пакете; tenant/permission403;304; Ed25519/tamper; migration quota30/31→429;503; TCP abort/recovery; DELETE self-revoke→401. Это синтетические серверные проверки, не native UI acceptance всех состояний.

[Статистика после native-прогона](DESKTOP_E2E_assets/native-current-stats-20261105.json) содержит unimplementedDb>0: shared PTO запрашивает дополнительные RPC/таблицы, ещё отсутствующие в fixture. Нулевые счётчики раннего HTTP smoke не переносятся на native-прогон. adapterErrors пуст, но это не означает полного покрытия.

Root governance FAIL: прежний TRANSPORT missing base_sha и C11/TENDER/TRANSPORT/STUDIO ownership overlaps. Чужие locks не исправлялись.

## Открытые задачи L0

- **Cold bootstrap/route:** WebView стартует `/`; App.tsx направляет в KirishSahifa, desktop entry импортирует main без восстановления разрешённого маршрута. Нужен согласованный переход в существующую страницу после проверки native session/lease; без нового интерфейса и обхода expiry/revoke.
- **Home:** `/api/ish-joyi?bolim=joylarim` отсутствует в native PATH и BFF dispatch; HTTP smoke фиксирует TARGET_INVALID400. PTO с активной компанией стартует в /admin/obyektlar, но личный home остаётся отдельной интеграцией.
- **Fixture coverage:** ProjectNavigator требует shartnoma_liniya_v1, PTO periods/source/markup — дополнительные источники. Их отсутствие в стенде не доказывает production DB дефект. Расширить синтетический DB adapter без подмены реальных handlers успешными ответами.
- **Shared semantics:** NULL финансовые итоги, serverTasdiq/export, offline-кнопки записи и F2/footer native UI ещё требуют приёмки. Ввод/редактирование через видимые кнопки не выполнялись.
- После согласованного bootstrap повторить cold start→тот же объект→TCP abort→native reconnect304, затем logout/expiry/revoke. Live owner acceptance и release signing отдельно у L0.

Скриншоты20261104 в assets исторические; в текущем результате не используются. M5 не завершён, PR остаётся draft. Main/prod и shared UI не менялись.
