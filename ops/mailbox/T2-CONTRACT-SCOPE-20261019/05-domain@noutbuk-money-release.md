---
agent: codex
machine: noutbuk-money-release
date: 2026-10-19
branch: codex/money-input-release-v1
reviewed_sha: 4412fe75146b6845433ec73297f6d95cfbd9e258
status: предложение_для_согласования
---
# Доменное продолжение CONTRACT-SCOPE — локальное ревью

По прямому поручению владельца выполнено отдельное read-only ревью. Полный результат: [Obsidian](D:/Obsidian/Anvar_Brain/20_PROJECTS/Smeta-tizimi/CONTRACT_SCOPE_NEXT_DOMAIN_CODEX_NOUTBUK_2026-10-19.md).

Текущий пакет — классификация + чистая оценка; полной цепочки смета → Факт → Ф2 → накопительная → Ф3 нет. Основание: `docs/architecture/CONTRACT_SCOPE_V1.md:53–55,74–91`. Текущий money-format + panel release ведёт родитель.

Предлагается следующий минимальный контракт CONTRACT_LINE_POLICY_SNAPSHOT_V1: версия индивидуальной цены на canonical qator_id, проверенное основание, серверный снимок принятия в Ф2, неизменяемость после approval. Первая вертикаль — unit/UZS без ресурсных детей; milestone/amount/валюта требуют явных адаптеров и следующих пакетов. Это предложение, не принятое назначение. Реестр/owns не изменены.

Точные точки расширения и ссылки собраны в Obsidian:
- `t2_fakt_smetadan_tashqari_v1` / `t2_addrepl_execute_v1`, `t2_fakt_yoz_v2`: создание canonical позиции и Факт без поддельной категории/нормы.
- `f2Qur/f2Qatorlar/f2Yuk`, `f2NativePayloadQur`, sb-yoz, `t2_akt_yarat_v2`, `t2_akt_qator_certified_freeze_v1`: индивидуальные pricing/VAT/markup snapshots.
- `t2_qator_holat/t2_f2_kat_oy/t2_nakopitelniy_v2/t2_forma3_yarat_v1`, DTO и `f2AktKirish/f2Hujjat/nakopitelniyVedomostHujjat/f3Model/f3UstunlarNatijasi/forma3Hujjat`: единая денежная база, без повторного общего каскада.

Конкретные дефекты продолжения: сохранённый scope basis не хранит PricePolicy (`20261106490000_t2_contract_scope_v1.sql:75–78`); BL пока структурный/без цены; месячная SQL-проекция делает NULL kat → МАТ (`20261106370000_t2_f2_summa_korinadi_v1.sql:86,95`); экспорты требуют ресурсную категорию. Подставлять МАТ/ОБ/М/К запрещено.

Проверено кодом, на синтетических входах: included 2×100 → 200.00; explicit markup 10% + VAT 12% → 246.40; amount 250.50 → financial 35.05%; current=-1 → DECIMAL_INVALID. Агрегатор approved snapshots 200 + (-100), исключив draft 999, даёт 100.00. Итого: агрегирование минусов есть, полный путь отрицательного закрытия не реализован.

До финансовой реализации согласовать monetary basis certified/direct/payable, signed rounding и delta против replacement/superseded; не пересчитывать старый акт по новой цене/курсу. Milestone требует идентичности каждого этапа; amount нельзя маскировать hajm=1. Старое правило warning сверх сметы не заменять договорным blocker без явного решения.

Проверки: 14 PASS / 2 existing Vitest files; прямой запуск модулей в памяти; governance PASS (81 задач), stale main_sha WARN. Production/SQL execution/owner smoke не проверялись.

Изменены только этот файл и указанная Obsidian-записка. Приложение/SQL/registry/миграции не менялись, чужие изменения сохранены. Commit/push/merge/deploy не выполнялись. Статус передачи LOCAL / UNPUSHED; межмашинная доставка не заявлена. Родительскому агенту передаётся для review и включения в собственный handoff.

