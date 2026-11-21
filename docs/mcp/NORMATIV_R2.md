# Нормативный поиск существующего MCP

## Исправленное расхождение

Сайт использует `functions/_shared/normativ-read.ts`: основной источник — R2,
SQL включается только явным `NORMATIV_DB_FALLBACK=1`. Ранее `normativ_qidir`
существующего MCP обращался только к SQL и терял цитату и SHA при проекции.

Теперь удалённый MCP вызывает тот же `readNormativ` через callback `Muhit`.
Используется существующий `SNAPSHOT_R2` (`smeta-tizimi-canonical`), стандартный
префикс `normativ/shnk/v1/` или серверный `NORMATIV_R2_PREFIX`.
Нового сервера, индекса, парсера или базы нет. Общие изменения reader — только типы.

## Границы и результат

- Объект проверяется существующим SQL tool; соединение освобождается до R2.
- Actor и компания сверяются с проверенной host authority. Только `PUBLISHED`.
- Цитата, SHA, страница, ссылка и UNKNOWN/неоднозначная редакция сохраняются.
- Неисправный/отсутствующий индекс даёт ошибку, а не незаметный старый SQL ответ.
- `tahrir` позволяет уточнить редакцию. Пути `ish`/`resurs` прежние.
- Локальный stdio без R2 host callback сохраняет SQL-совместимость.

## Интеграция L0

При объединении с Jarvis PR #740 сохранить `normativUla(mu, env, authority)`
в общем authenticated handler **обоих** маршрутов `/mcp` и `/jarvis/mcp`.
Сохранить read-only регистрацию app route, actor/company из SSO и original Cookie.
Worker и Pages должны читать один canonical bucket/префикс и Supabase проект.
Codex не меняет production bindings/секреты и не применяет миграции.

Тесты синтетические: gateway contract, tenant/actor denial, source preservation,
UNKNOWN, отказ без stale fallback и прежние SQL пути. Существующие canonical
тесты проверяют repack → Range read → цитата, SHA tamper rejection и endpoint.
Это не доказательство live-доступа к загруженным ShNK или owner acceptance.
