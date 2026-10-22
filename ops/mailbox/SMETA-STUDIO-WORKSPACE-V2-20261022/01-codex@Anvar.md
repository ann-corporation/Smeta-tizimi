# ACK — прямое поручение владельца, 2026-10-22
Агент codex, машина Anvar. Branch codex/studio-workspace-v2-20261022, base 7a734d6c.
Владелец передал Research и поручил реконструкцию Studio: любая AI операция должна иметь простой ручной путь и наоборот, один документ/command/calculation engine. Начинаю PR-01 по самому research: рабочий workspace и интеграция существующих возможностей; DB/schema/F2/tenant/payments не меняются. Старый L3b component branch fd1b81c8 — собственная сохранённая основа, не готовый product flow.
Точные owns в ACTIVE_TASKS. Выделены только пересекающиеся frontend-файлы; остальные leases сохранены. Calc/model/commands/server-save остаются у L0. Новая UI не сообщает server autosave до реально выполненного server save. Main/release — Claude L0.
