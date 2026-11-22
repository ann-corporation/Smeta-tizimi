# Jarvis → существующий Smeta MCP

Один core `functions/_shared/jarvis/chat.ts` вызывает существующий Worker `smeta-mcp`, SDK и инструменты `mcp/smeta-mcp/src/tools`. Web/Telegram/native BFF используют тот же core. Отдельной базы, сервера или вычислителя нет.

L0 при выпуске связывает Pages с существующим Worker: Service binding `SMETA_MCP`, service `smeta-mcp`. На Worker настраивается **существующий** секрет SSO `SESSIYA_KALIT` с тем же значением, что у приложения. Значение не попадает в репозиторий, ответы или модель. Codex конфигурацию production не изменял. До этих действий нельзя считать production подключённым.

До включения L0 сверяет, что Hyperdrive MCP и SUPABASE_URL приложения/Worker указывают на один проект. Проверяются actor/current company и одинаковый read-only объект на каналах; строки подключения и реальные данные не публикуются. Код/protocol tests не доказывают эту production-конфигурацию.

Вызов `/jarvis/mcp` проверяет cookie существующим `tekshir`, затем актуальную `roleAuthority`, capabilities/explicit denials и сужает область до `X-Jarvis-Company`. Заголовок компании выставляет API core, членство проверяет MCP. Native BFF уже заменяет device Bearer на серверную cookie с исходным сроком действия. Общего административного токена нет.

Клиент использует настоящие `initialize`, `notifications/initialized`, `tools/list`, `resources/read(smeta://qoidalar)`, `tools/call`. 20 существующих read tools (включая search/fetch) доступны модели как `smeta__<имя>`. Контракт входа поступает из MCP; SQL и роль/актор из модели запрещены. Ограничения вывода и ошибки не превращаются в выдуманный ответ или обрезанную сумму.

SSO-вход регистрирует только read tools. Существующий OAuth `/mcp` остаётся прежним, включая его write tools. В Jarvis записи пока идут через существующий signed preview/подтверждение; эта поставка не объявляет остальные writers, PIN/биометрию, Studio workflow, полную историю/offline queue или live acceptance завершёнными.

Приёмка: реальные SDK/Streamable HTTP + подменённые SQL/roleAuthority; API→core→MCP transport, отрицательные права/tenant/session, неизменённые source NULL/0/минус. Production проверяется отдельно после выпуска L0, на текущем actor/company без реальных записей.

Совместный candidate с mainb0c53115:20 reads (добавлены existing transport_tekshir и f2_jami). У f2_jami обязательная компания подставляется проверенным API context, модель этот аргумент не выбирает; остальные forbidden fields остаются fail-closed. Новые OAuth F2-file/package и superadmin SQL/schema остаются на OAuth route; SSO Jarvis их не регистрирует. Это merge rehearsal, исходный #740 отдельно требует review этой дельты до выпуска.

Merge #740 updated765acb1b + mainb419aa7f: совместимость20 reads теперь также в исходном PR#740. OAuth Telegram login/placement/backoff из main сохранены; normativUla из#741 остаётся в common authenticated handler. Codex production не изменял.
