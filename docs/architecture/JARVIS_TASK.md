# Jarvis: создание задания через существующий шлюз

Статус: boundary M3; не полная интеграция чата/каналов и не production acceptance.
Архитектура/review/merge/release — Claude L0. Код не применяет SQL.

Единственный writer — существующий `/api/topshiriq`, `t2_topshiriq_ber_v1`.
Сохраняются DB tenant/object/assignee проверки, idempotency, журнал и уведомления.
Новых таблиц, task engine, финансовых формул или произвольного RPC dispatch нет.

1. `jarvis_preview`: `kompaniya_id`, caller `operation_id` UUID, `args`.
   Разрешены title, description, exact deadline, existing task kind, object ID,
   assignee user ID. Другой tenant/actor/role/RPC в args запрещён.
2. Сервер заново читает `t2_men_v1`: `fakt.write`, без explicit denial.
   Объект проверяется scoped `t2_agent_fakt_v1`; активный получатель — существующим
   authenticated `/api/sb`, `t2_azolik_royxat`, exact company/user filter.
   Возвращаются только имена, без email/телефона. Неизвестное не угадывается.
3. Preview содержит очищенные args, verified names и HMAC token на15 минут.
   Token domain отделён от сессии/F2/склада; включает actor/company/payload/names/expiry.
   Стабильный UUID выведен существующим `uuidHosila` из caller UUID и actor/company/payload.
   Повтор preview стабилен, редактирование любого поля меняет UUID.
4. Только `jarvis_confirm` с token и явным boolean `tasdiqlayman:true` продолжает
   существующий `ber`. Модель не получает confirmation tool. Клиент не передаёт
   новые args при подтверждении. Actor/company, срок, права, membership, объект и
   имена проверяются снова; переименование даёт409 и требует нового preview.
5. Replay передаёт тот же operation ID существующему writer. Повторный результат
   `takror:true` не отправляет повторное Telegram уведомление.

`NULL` deadline означает отсутствие срока. Невозможные даты, пустая дата,
потеря точности ID, лишние поля и чужой/неактивный получатель отклоняются.
Initial adapter поддерживает задания внутри выбранной компании; межкомпанейский
ручной endpoint не меняется, но этот AI preview не подменяет relationship checks.
Сбой источника блокирует подтверждение, не означает успешную запись.

Следующий bounded PR: зарегистрированный tool единого core, ручная editable card,
native/Telegram confirmation adapters с тем же token и operation ID; stable receipt
и readback по существующему task API. PIN/signing flow не изменён: это не денежная
операция и не электронная подпись. До channel/owner проверки full M3 не завершён.
