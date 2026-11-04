# Desktop D1b — ADR-DESKTOP-AUTH

Решение L0: устройство получает случайный 256-битный Bearer после существующего web-login. Сервер хранит только SHA-256 токена; actor, отзыв и срок проверяются при каждом запросе. Роли/компании/permissions всегда поступают из существующего roleAuthority; устройство не задаёт actor и не восстанавливает полномочия из JSON клиента.

## Транспорт и границы файлов

- POST /api/desktop/qurilma: только действительная cookie существующего входа, same-origin CSRF, UUID operation_id. DELETE того же пути отзывает только устройство текущего actor. Секрет выдаётся один раз; идемпотентный повтор не восстанавливает его из хеша.
- POST /api/desktop/bff: только проверенный Bearer и точный Origin http://tauri.localhost. Статический набор существующих обработчиков вызывается через неизменённый middleware. Внутренняя cookie создаётся на сервере с тем же сроком, не уходит в JS. Обычные BFF файлы/правила разрешений не меняются.
- POST /api/desktop/lease: свежая авторизация компании, smeta.read/f2.read/narx.read и принадлежность каждого объекта. Только чтение, максимум 72 часа и 100 объектов.
- Rust отправляет HTTP, не следует redirects, ограничивает тело и ответ, исключает пользовательские Authorization/Cookie/Origin. Старые IPC чтения/записи Bearer удалены. JS получает только безопасную проекцию session info и HTTP body.

В нативном входе Rust вызывает существующий /api/kirish, удерживает cookie локально, выполняет обмен на устройство, проверяет /api/sessiya через Desktop BFF и только затем сохраняет credential. Ошибки/запоздавший ответ старого поколения не восстанавливают состояние.

## Подписанный lease

Конверт: {alg:Ed25519, kid, payload, imzo}; payload — base64url исходных UTF-8 байтов JSON, подпись — над этими байтами. Поля: format=smeta-desktop-lease/1, foydalanuvchi_id, kompaniya_id, obyekt_idlar, permissions, device_id, berildi/tugaydi (Unix ms), versiya.

Серверные env: DESKTOP_LEASE_SK (PKCS#8 base64url), DESKTOP_LEASE_KID. Приватный ключ задаёт L0 в защищённом окружении; fallback нет. В установленный frontend входят VITE_DESKTOP_LEASE_PK (raw 32-byte Ed25519 public key, base64url) и VITE_DESKTOP_LEASE_KID. Полученный по HTTP ключ не принимается. Пустая/чужая конфигурация закрывает офлайн-доступ. Тесты создают отдельную пару в памяти; приватного тестового ключа в репозитории нет.

Проверка: подпись → формат/срок → точные actor/device/company → объект в списке → требуемые read permissions. Часы назад относительно сохранённого high-water mark, истечение по монотонному таймеру, выход и отзыв закрывают чтение. Серверный немедленный отзыв без сети недоказуем: предел устаревания — оставшийся срок lease. При подключении выполняется повторная проверка/обновление.

## Ключи и хранение

Bearer и AES-GCM ключ создаются/хранятся в Windows Credential Manager, не возвращаются JS. Шифротекст хранится в app-local каталоге; AAD связывает actor/device/поколение кэша и ключ packet/company/object либо lease/company. Повторный вход создаёт новый AES ключ. Выход/current 401 удаляет credential и ключ: старые файлы становятся криптографически недоступны. Они не объявляются физически удалёнными. Время жизни Bearer ограничено сроком существующей сессии; lease короче.

## Сборка и миграция

Tauri включает native entry через отдельную vite.desktop.config.ts. Общие main.tsx, index.html и web build не изменяются. SMETA_DESKTOP_BFF_ORIGIN фиксируется при сборке (HTTPS origin, по умолчанию production); runtime URL от JS не принимается. Feature desktop-e2e разрешает только loopback HTTP, отдельные identifier/service; тестовый installer нельзя выдавать за релиз.

20261202000000_t2_desktop_auth_v1.sql и парные .rollback.sql/.acceptance.sql — только файлы. RLS/GRANT закрывают таблицу и RPC от anon/authenticated; токены не сохраняются открыто. Применение, production env, main и публикация — L0.

## Доказательства и границы

Модульный клиент: 38 тестов transport/lease/объектного adapter прошли. Native: 19 тестов, включая реальное временное keychain-хранилище, fmt и all-feature clippy прошли до последнего изменения gateway. Итоговые проверки gateway/SQL фиксируются в KOORDINATSIYA по точному SHA. Это не подтверждение входа в production и не M5 E2E.
