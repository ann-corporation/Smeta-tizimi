# Контур развития Jarvis

Node.js >=22, Git, авторизованные gh и Codex CLI. Задание → воспроизведение → структурированный AI patch → отдельная AI review-сессия → exact-SHA CI → Pages preview → HTTP smoke.

## Доверенная граница
Оператор запускает контроллер из проверенной копии. Candidate worktree отдельный, чистый, без секретов; изменённый моделью runtime никогда не импортируется контроллером. Модель получает только явно разрешённые исходники; её shell/apps/plugins выключены. Контроллер ограничивает пути и размер, сам получает SHA из Git. Исполнение нового кода происходит в удалённом CI. Права CI и Cloudflare preview задаёт владелец репозитория: этот скрипт не изолирует их от опасного кода автоматически.

Встроенный адаптер разрешает только ops/agent-evolution/*.mjs. Расширение на бизнес-код требует отдельного согласования owns и CI policy. Основной Jarvis/backend принадлежит Claude L0.

## Запуск
```powershell
node --test ops/agent-evolution/*.test.mjs
node ops/agent-evolution/cli.mjs create C:/private/jobs C:/private/job.json
node ops/agent-evolution/live.mjs C:/private/config.json fix-001
node ops/agent-evolution/cli.mjs status C:/private/jobs fix-001
```
Job: id, goal, baseSha (40 hex), ownedPaths, deadline (ISO), maxAttempts (1–5), maxCalls (1–50). Хранение только вне public repo.

Пример доверенного config (пути/rollbackSha заменяются оператором):
```json
{
  "repo":"ann-corporation/Smeta-tizimi",
  "project":"smeta-tizimi",
  "worktree":"C:/private/candidate",
  "queueDirectory":"C:/private/jobs",
  "privateDirectory":"C:/private/evidence",
  "codexEntry":"C:/tools/node_modules/@openai/codex/bin/codex.js",
  "sourceFiles":["ops/agent-evolution/runtime.mjs","ops/agent-evolution/runtime.test.mjs"],
  "reproducer":"C:/private/trusted-reproducer.mjs",
  "rollbackSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```
Reproducer — доверенная программа оператора: получает worktree аргументом, выводит JSON с reproduced:true только после реального воспроизведения. Не принимает команды от модели. Model необязателен; используется доступная модель авторизованного CLI.

## Проверка и публикация
Отдельная review-сессия видит diff и результат, не доверяет самооценке кодчика. Непрошедший review не отправляется в remote. Push идёт только в agent-evolution/<job-id>, без force и без main. Требуются frontend, mcp, mcp-remote, agent-evolution от GitHub Actions на exact SHA и успешный Cloudflare Pages check. Preview URL берётся только из check доверенного провайдера и ограничен immutable hash хостом заданного проекта.

Git integration создаёт preview при push, то есть до завершения CI. Это изолированный кандидат, не production release. Этап preview принимает уже построенный кандидат после проверок. Observe подтверждает только HTTP HTML-shell, НЕ авторизованный пользовательский сценарий и не визуальное качество.

Существующий rollbackSha подтверждается отдельным успешным check и HTTP. Однако старый URL НЕ означает восстановление развёртывания. Реальный адаптер rollback намеренно возвращает restored:false: при ошибке после preview требуется сверка оператором, кандидат не удаляется автоматически. Production deployment/merge/alias switching отсутствуют.

## Состояние, повторы и пределы
Атомарный checkpoint и exclusive lock; завершённый этап не повторяется. Лимиты попыток/вызовов/deadline и 30 минут максимум на этап. SIGINT передаётся исполнителям. Денежный/token cap не реализован; ограничение вызовов не является финансовым лимитом.

Timeout/abort внешней операции → needs_reconciliation, автоматический повтор запрещён. Для неопределённого preview rollback не объявляется успешным: поздний эффект может прийти после timeout. После падения процесса lock не отбирается автоматически. Оператор сверяет процесс, SHA, remote и provider до восстановления. Ошибка после локального commit, но до checkpoint требует ручной сверки worktree, не нового слепого commit.

Системный scheduler, автоматическое обнаружение любых ошибок, бизнес-tool registry, tenant policy и production recovery ещё не включены. Код является инженерным preview-контуром, а не готовым саморазвивающимся продуктом. Доказательства живого прогона фиксируются отдельно в Obsidian, синтетические тесты не заменяют их.

Очередь: `node ops/agent-evolution/live.mjs C:/private/config.json --queue` выполняет один проход, максимум config.maxJobs (по умолчанию 3, максимум 10). Пропускает отменённые/истёкшие/исчерпанные задания и останавливается при неопределённом внешнем результате. Каждая задача обязана соответствовать текущему чистому worktree/base; разные базы требуют отдельных конфигураций. Системный cron сам не регистрируется.
