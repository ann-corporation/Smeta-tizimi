# Контур развития Jarvis — этап 1

Рабочее ядро и CLI для оператора. Это ещё не подключённые AI-программисты или сервис автоматического deploy.

## Запуск
Node.js >=22. Без npm зависимостей.

```powershell
node --test ops/agent-evolution/runtime.test.mjs
node ops/agent-evolution/cli.mjs create C:/Temp/private-agent-jobs C:/Temp/job.json
node ops/agent-evolution/cli.mjs status C:/Temp/private-agent-jobs studio-fix-1
node ops/agent-evolution/cli.mjs run C:/Temp/private-agent-jobs studio-fix-1 C:/private-controller/adapters.mjs
```

Пример job.json (baseSha заменяется фактическим SHA):
```json
{"id":"studio-fix-1","goal":"Воспроизвести и исправить конкретную ошибку Studio","baseSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","ownedPaths":["frontend/src/components/smeta-studio-workspace"],"maxAttempts":2,"maxCalls":12,"deadline":"2027-01-01T00:00:00Z"}
```
Данные заданий хранятся вне public repo. Пример не содержит действительных данных пользователя.

## Контракт доверенных адаптеров
Модуль оператора экспортирует adapters: diagnose, engineer, review, verify, preview, observe, rollback. Каждый получает {job, operationId, payload, signal}. Только оператор задаёт модуль; ответ модели не должен выбирать исполняемый файл. CLI импортирует произвольный код доверенного модуля: не загружать сюда файлы из PR, модели или внешнего документа.

- diagnose возвращает reproduced и evidenceId подтверждённого воспроизведения.
- engineer запускает AI в отдельном sandbox/worktree и возвращает actor, headSha, changedPaths, полученные контроллером из Git, не из заявления модели.
- review получает отдельного исполнителя и выдаёт actor, headSha, passed. Контроллер проверяет его идентичность/связь с заданием. Разные строки actor сами по себе независимость не доказывают.
- verify сам читает доверенный CI/check-run для exact SHA, сверяет актуальный base, обязательные проверки, полученный artifactId и существующий rollbackArtifactId.
- preview принимает только проверенный artifact и идемпотентный operationId. Должен проверять собственный allowlist проекта/окружения/URL и гарантировать preview-only. Ядро проверяет формат HTTPS URL, но не заменяет авторизацию провайдера.
- observe выполняет пользовательский smoke и возвращает healthy, headSha.
- rollback идемпотентно восстанавливает указанный предыдущий artifact и подтверждает artifactId/restored.

Ядро не является криптографической границей доверия, контейнерной песочницей или tenant-authorizer. Настоящие вызовы LLM/GitHub/Cloudflare пока не подключены. Развёртывание в production отклоняется. В ядре ограничены число вызовов, попытки и время; денежные/token-лимиты обязан до вызова обеспечивать aiHisobli/адаптер. Обещаний о полной финансовой изоляции нет.

## Восстановление
Checkpoint атомарно заменяется после sync; эксклюзивный файл .lock запрещает двух исполнителей. После падения процесса lock автоматически не отбирается: оператор сначала подтверждает остановку процесса и внешнего operationId. На сетевой/timeout неизвестности needs_reconciliation, повтор заблокирован; это не доказательство остановки внешней операции.

Перед отправкой preview намерение записывается на диск. Потерянный ответ запускает rollback по стабильному operationId; после падения процесса previewAttempted требует сверки, повторный deploy не запускается вслепую. Rollback имеет отдельное время и выполняется даже при исчерпанном обычном бюджете. Ошибка rollback не маскируется как успех. Cancel CLI отменяет неисполняемую задачу до preview; активная блокировка не отбирается. SIGINT передаёт сигнал адаптерам.

## Доказано и не доказано
17 синтетических тестов проверяют очередность, восстановление checkpoint, независимый actor/exact SHA gates, область файлов, повтор, блокировку, отмену, лимит, timeout и rollback. Тестовые адаптеры — заглушки, не настоящие AI, CI или deploy. Сквозная эксплуатация, ACL каталога Windows, распределённая очередь, crash/power-loss durability и настоящая стоимость не аттестованы.

Следующий этап: доверенные GitHub/CI/preview адаптеры и sandbox engineer, согласованные с L0; сначала один воспроизводимый дефект в отдельном preview без production секретов. Runtime не предоставляет агенту права менять собственную политику.
