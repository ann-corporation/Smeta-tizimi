# Jarvis: восстановление очереди chat-записей

Один pending slot на actor/company использует существующие IndexedDB/AES-GCM и API create/append. Серверные conversation ID, operation_id, etag/CAS и проверки полномочий не меняются. Это recovery transcript writes, не отдельный workflow или база.

## Контракт

- RPC head (kind/id/operation/title либо etag/turns) неизменяем после первой отправки. Повтор использует тот же operation_id и payload.
- Recovery preview содержит head и все более поздние завершённые user/AI тексты. Частичная генерация, structured actions и confirmation tokens не сохраняются. Preview не режется до12;12 остаётся только server batch limit.
- headCount отделяет подтверждаемую часть от позднего tail. Для новых записей headCount=turns.length; прежние encrypted envelopes без поля читаются совместимо.
- После server ACK encrypted record сохраняет acknowledged etag ВМЕСТЕ с последним tail. CAS проверяет revision; encryption вне IDB transaction. Нельзя удалить head раньше сохранения tail.
- Следующий append атомарно резервируется только с тем же chat/acknowledged etag и префиксом оставшегося tail; подтверждённый head удаляется из recovery preview. Уже сохранённая длинная история не расходует pending capacity.
- ACK без tail не возвращается как pending: не подменяет выбранный per-tab chat. Внутренний encrypted checkpoint разрешает следующую новую операцию/другой chat.
- Same-operation recovery update сохраняет самый длинный совместимый preview, ACK и stale marker. Переписанный head/разошедшийся tail/занятый slot отклоняются. Stale не подтверждается и не снимается автоматическим повтором; поздний stale result старого уже ACKed head не понижает подтверждение.
- Явный discard оставляет operation tombstone: поздний старый callback не воскресит удалённую операцию.
- Ограничения recovery:200 pending messages,32000 символов на текст,1.5MB ciphertext. Превышение/сбой CAS/crypto/storage не обрезает данные; UI показывает существующее «Serverga saqlanmadi — bu oynani yopmang». Успех server ACK не означает успех offline persistence.

## Границы приёмки

Синтетические real WebCrypto + mocked IDB/API UI tests покрывают offline create, head in flight, append retry+tail, reload между ACK и successor, ordered batches и длинную уже сохранённую историю. Это не power-loss/browser-disk durability или live cross-device acceptance. Изначальный debounce до первой head reservation и очередь выполнения самих AI-запросов остаются отдельными M2 задачами.

При объединении с encrypted completed-cache #759 сохранить разные namespace, async hydration-before-outbox и новый ACK API. Completed-cache не заменяет pending slot. Main/prod/SQL/config/secrets не менялись; review/merge/release L0.
