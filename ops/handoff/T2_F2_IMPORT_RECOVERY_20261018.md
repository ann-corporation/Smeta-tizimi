# F2: исправление добавленных строк без потери привязок

Codex@noutbuk-f2-recovery · 2026-10-19 · READY_FOR_REVIEW: основной edit/cancel/resume пакет.

Ветка `codex/f2-import-recovery-v1`, база origin/main `90a36f53`. Включён отдельный проверенный пакет предупреждения `codex/f2-import-duplicate-warning-v1`. Машинный receipt с SHA и хешами SQL: `ops/mailbox/T2-F2-IMPORT-RECOVERY-20261018/04-codex@noutbuk-f2-recovery.json`.

## Поведение

- До повторной привязки проверяется ключ объекта/F2/месяца/пустого номера. Существующий ID, период, статус и история доступны сразу; ошибка проверки требует retry. Это проверка ключа, не доказательство равенства файлов. Exact unique conflict объясняется, вместо ложного «обновите страницу».
- У добавленных строк есть edit/cancel. Исходная смета не удаляется; отмена сохраняет архив. Любая ссылка Fakt/F2 или утверждённое изменение блокирует удаление; нужен отдельный governed workflow. Нет автоматической очистки orphan rows.
- Версионированные команды edit/cancel проверяют actor/company/object до idempotent replay. Изменённый запрос с прежним operation ID отклоняется. При edit сохраняются независимые ручные привязки ресурсов; negative/unresolved исходные строки остаются в рабочем черновике.
- Канонический результат checkpoint-ится локально и в cursor серверного черновика перед refresh. При неудачном refresh pending correction применяется при local/server resume. Успех показывается после обновления и сохранения связей. После подтверждённой записи повтор кнопки обновляет связи, не создаёт ещё одну строку.
- Диалог показывает предыдущую/новую суммы и разницу. Неполные цены не дают ложную полную разницу/единичную цену. Explicit price 0 остаётся 0; NULL остаётся неизвестным.

## Проверки

Полный Vitest: 2130 PASS / 17 skipped; 296 PASS / 8 skipped suites. После небольшого scope/refresh follow-up: Workbench 21 PASS, local/server draft 20 PASS. Build покрывает оба TS-проекта; tekshir и oxlint проверяются финальными receipts. Governance PASS (существующее предупреждение stale CURRENT_STATE SHA). Сайт-карта сгенерирована после добавления именованных команд.

SQL acceptance в одной транзакции достигает `F2_RECOVERY_ACCEPTANCE_PASS` и полностью откатывается через RAISE: source values unchanged, explicit zero, unauthorized/cache replay, stale edit/delete, failed edit atomicity, archive, Fakt protection, resource→work edit/replay. Roundtrip достигает `F2_RECOVERY_ROUNDTRIP_PASS`: четыре старые функции восстановлены (нормализуются только CRLF/LF), ACL/security config сохранены, новые функции отсутствуют после rollback.

## Выпуск — integrator lane

Миграция `20261106480000_t2_qoshilgan_boshqaruv_v1` НЕ ПРИМЕНЕНА. Сначала повторить rollback acceptance/проверку baseline drift, применить migration, затем развернуть frontend/API из ветки. При откате сначала вернуть frontend/API, затем rollback SQL. Иначе новый frontend вызовет отсутствующие v2 RPC. Бизнес-данные не переписывать. Для завершения product release требуется authenticated owner vertical smoke (add/edit/cancel/relink/save/resume/company switch).

DEPLOYED: нет. MAIN UPDATED: нет. Authenticated UI smoke: UNKNOWN. До этих шагов не называть задачу выпущенной.

## Ограничения / следующий пакет

Произвольное перемещение исключено из выпуска: прототип сохранён в `ca263ee7`. Нынешний integer tartib + ID не обеспечивает точную вставку старого ID между строками без изменения исходного порядка. Нужен согласованный display-order metadata across projections, не подмена source tartib. Создание нескольких работ вместо ресурса протестировано как RPC, отдельный UI создания ещё не предоставлен; автоматическое восстановление архива тоже не входит. Нельзя заявлять, что эти возможности уже доступны оператору.

Checkpoint защищает уже полученный канонический результат; browser crash до первого ACK/checkpoint не является общей DB+browser атомарной транзакцией и остаётся отдельным E2E recovery сценарием. Исходник и остальные решения не удаляются.

Оригинальные 11 файлов `C:/Temp/GAS-token-mon` сохранены и проверены по SHA256; backup `C:/Temp/f2-claude-recovery-20261018`. OpenRouter §2 ещё не выполнен. Исторические сообщения mailbox 01–03 не переписывать; текущее состояние — этот handoff и receipt 04.
