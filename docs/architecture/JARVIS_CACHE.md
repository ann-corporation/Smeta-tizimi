# Jarvis: шифрованный кэш браузера

M2: completed history/архив не являются pending outbox или канонической историей.
Повторно используются existing `qurai-jarvis-outbox` IDB store, non-extractable key
и `ombor/ombor-idb` AES-GCM+AAD. Отдельной базы, crypto algorithm или server API нет.
Новый namespace `jarvis:cache:v1:actor:company:slot`; pending namespace не меняется.

Active history и selected ID разделены по случайному tab metadata ID.
Архив объединяется по conversation ID+timestamp под optimistic revision CAS;
шифрование вне IDB transaction, compare-and-update синхронный, до5 попыток.
Внутри вкладки записи ordered. Actor/company/slot входят в AAD; перенос ciphertext
между scope не открывает его. Это не выдаёт права и не защищает от вредоносного
same-origin JS: текущая authenticated UI по-прежнему выбирает свой scope.

Сохраняются только id/role/text, archive title/time. `yakun`, preview tokens,
actions, executable cards, tool payloads и PIN/биометрия не кэшируются.
Каноническая server history/sync/append и durable pending retry не изменены.

Legacy session/localStorage мигрирует per key: sanitize → encrypted commit →
реальное readback → удаление старого ключа, только если источник не изменился.
Corrupt/недоступное хранилище, конфликт active/id и tombstone сохраняют старый
источник и показывают warning; plaintext fallback для новых записей отсутствует.
Если миграция не завершилась, физические legacy данные могут оставаться до
успешного повторного открытия. Нельзя объявлять их все удалёнными по одним тестам.
Cache read failure не превращается в успешный restore; дальнейший UI работает
через server/memory, не заменяет unreadable ciphertext пустым новым snapshot.

Async hydration завершается перед pending outbox restore и вводом новых сообщений.
Scope generation/cleanup отклоняет поздний ответ другой компании/пользователя.
Preview cards остаются transient: после перезапуска нужен свежий server preview.

Проверка: real WebCrypto+mock IDB storage, миграция/after-commit readback failure,
tenant AAD/per-tab/ordered writes/CAS archive merge/tombstone/no pending overwrite;
React tests проверяют actor switch и pending restore после отложенного cache load.
Это не live browser/owner/cross-device acceptance. Review/merge/release — L0;
production/SQL/secrets Codex не меняет. Полный M0–M5 остаётся активным.
