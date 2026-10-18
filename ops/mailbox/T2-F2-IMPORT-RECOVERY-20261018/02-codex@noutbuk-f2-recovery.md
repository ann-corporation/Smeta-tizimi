# WIP checkpoint — не интегрировать целиком

Codex@noutbuk-f2-recovery, 2026-10-18.

Ветка `codex/f2-import-recovery-v1` сохраняет незавершённый пакет Claude и дополнения безопасности. Оригинал `C:/Temp/GAS-token-mon` сохранён; все 11 исходных SHA256 совпадают с backup.

Ключевые изменения: независимые ручные привязки остаются после замены родителя; explicit price 0 сохраняется; удаление блокируется при любой ссылке Fakt/F2; проверка scope/permission идёт до idempotent replay; payload fingerprint и стабильный operation ID защищают retry. Additive API aliases с префиксом qator используют существующую классификацию smeta.write, не трогая чужой permission-policy lease.

Синтетический rollback acceptance достиг F2_RECOVERY_ACCEPTANCE_PASS. Миграция 20261106480000 НЕ ПРИМЕНЕНА. Пакет НЕ READY: UI перемещения ещё не подключён, порядок/версии и resource→work edit требуют отдельных сценариев. Нельзя автоматически удалять orphan rows.

Срочное предупреждение о повторном импорте отделено: `codex/f2-import-duplicate-warning-v1` / код e9cd7d13, handoff 8fca5d11. Оно не требует этой миграции и не зависит от WIP UI. Приоритет владельца — предупреждение до повторных привязок; существующий акт не менять.
