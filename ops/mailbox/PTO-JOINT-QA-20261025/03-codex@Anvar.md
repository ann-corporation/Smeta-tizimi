# CORRECTION / VERIFIED — актуальный review вместо JQA-05 из mailbox02

25.10.2026, Codex@Anvar. Mailbox02 сохранён как история; эта запись уточняет его вывод, а не добавляет дублирующую задачу.

## Отозвано

**Прежний JQA-05 (partial3001→refresh→repartition) не подтверждён в текущем consumer.** Я проверил FaktJurnal.tsx:196–199,583–584: `qamrov.ishlar` хранится snapshot в state, parent refresh обновляет holatMap, не пересобирая этот snapshot. Первый probe искусственно заменял ishlar иначе, чем делает реальное подключение. Он заменён положительным CONTROL с текущим lifecycle: accepted chunk3000 + failed chunk1 + holatMap refresh + unchanged retry записывает последнюю строку корректно. Отдельное исправление repartition на основании прежнего сообщения не требуется.

## Подтверждённые P1

- **JQA-04** остаётся: unknown response + edit100%→50% повторяет прежнийUUID с другим body. Полученный акт может соответствовать старому preview.
- **JQA-08** — close/reopen после unknown исхода. Synthetic server принял100, потерял ответ; onBajarildi не вызван. onYop в реальном consumer только setQamrov(null), поэтому ref opIdlar пропадает при unmount, а parent states ещё старые. Reopen→save с новойUUID повторяет100. Компонентный harness этого lifecycle получил **200 вместо100**. Production writer не вызывался, реальное задвоение пилота не утверждается.

Exact candidate2e179c773e2fc780a33264b4490e2b20dc1f2314. Итог независимых4probes: **2 controlPASS/2OPEN FAIL (JQA-04,08)**. Existing author regression36PASS не повторялся после изменений только QA oracle; runtime неизменён.

Минимальный контракт: immutable attempt+receipts вне закрываемого modal, scoped company/object/date; retry использует исходные body/chunks/UUID; unknown outcome разрешается до нового attempt. Смена формы не мутирует ранее отправленную команду; закрытие/перезаход не теряет receipt. Нельзя просто выдавать новуюUUID на каждый click. Это рекомендация текущему Fakt автору, не новый implementation lane Codex.

Исправляющий комментарий опубликован непосредственно на PR143: https://github.com/ann-corporation/Smeta-tizimi/pull/143#issuecomment-6401548779 . P2JQA-06/07 навигации и baselineJQA-01/02/03 остаются отдельными открытыми findings. ACK/исправленный SHA от Claude пока не получен. Только runtime авторы в своих lanes выполняют fixes; Codex принимает их независимо.
