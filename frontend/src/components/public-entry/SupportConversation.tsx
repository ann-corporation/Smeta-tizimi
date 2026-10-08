import { useEffect, useRef, useState } from 'react';
import { useTil } from '../../i18n/til';
import { validateSupportSnapshot, type PublicSupportPort, type SupportSnapshot } from './support-port';

/** Bot va inson xabarlari server transcriptidan; local fake javob yoki receipt yo'q. */
export function SupportConversation({ port }: { port: PublicSupportPort }) {
  const { til } = useTil();
  const ru = til === 'ru'; const en = til === 'en';
  const [snapshot, setSnapshot] = useState<SupportSnapshot | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef<{ text: string; operationId: string } | null>(null);
  const operatorId = useRef<string | null>(null);
  const write = useRef(false);
  const generation = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const revision = useRef(0);
  const appliedVersion = useRef(-1);
  const accept = (value: SupportSnapshot) => {
    const checked = validateSupportSnapshot(value);
    if (!checked || checked.version < appliedVersion.current) return false;
    appliedVersion.current = checked.version; setSnapshot(checked);
    return true;
  };
  useEffect(() => {
    const epoch = ++generation.current;
    setSnapshot(null); setText(''); setError(false); setBusy(false);
    pending.current = null; operatorId.current = null; write.current = false;
    appliedVersion.current = -1;
    const activeControllers = controllers.current;
    let reading = false;
    const invalidate = () => { ++generation.current; };
    const read = async () => {
      if (write.current || reading) return;
      reading = true;
      const version = revision.current;
      const controller = new AbortController(); controllers.current.add(controller);
      try {
        const value = await port.read(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
        if (generation.current === epoch && !write.current && revision.current === version) {
          if (!accept(value)) throw new Error('Invalid support receipt');
          setError(false);
        }
      } catch { if (generation.current === epoch) setError(true); }
      finally { reading = false; controllers.current.delete(controller); }
    };
    void read();
    const timer = setInterval(() => { void read(); }, 5000);
    return () => { invalidate(); clearInterval(timer); for (const c of activeControllers) c.abort(); activeControllers.clear(); };
  }, [port]);
  const command = async (operator: boolean) => {
    if (write.current || snapshot?.mode === 'CLOSED' || !snapshot || (!operator && !text.trim())) return;
    write.current = true; ++revision.current;
    setBusy(true); setError(false);
    const epoch = generation.current;
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      let value: SupportSnapshot;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
      if (operator) {
        operatorId.current ??= crypto.randomUUID();
        value = await port.requestOperator({ operationId: operatorId.current }, signal);
      } else {
        if (!pending.current || pending.current.text !== text.trim()) pending.current = { text: text.trim(), operationId: crypto.randomUUID() };
        value = await port.send(pending.current, signal);
      }
      if (generation.current !== epoch) return;
      if (!accept(value)) throw new Error('Invalid support receipt');
      if (!operator) { setText(''); pending.current = null; }
    } catch { if (generation.current === epoch) setError(true); }
    finally { controllers.current.delete(controller); if (generation.current === epoch) { write.current = false; setBusy(false); } }
  };
  const mode = snapshot?.mode;
  const status = mode === 'HUMAN_ACTIVE' ? (ru ? 'Оператор в чате' : en ? 'An operator has joined' : 'Operator suhbatga qo‘shildi')
    : mode === 'WAITING_OPERATOR' ? (ru ? 'Ожидаем оператора' : en ? 'Waiting for an operator' : 'Operator javobi kutilmoqda')
    : mode === 'CLOSED' ? (ru ? 'Обращение закрыто' : en ? 'Conversation closed' : 'Murojaat yopilgan')
    : (ru ? 'Помощник AI' : en ? 'AI assistant' : 'AI yordamchi');
  return <div className="entry-conversation">
    <p role="status">{snapshot ? status : ru ? 'Загрузка разговора…' : en ? 'Loading conversation…' : 'Suhbat yuklanmoqda…'}</p>
    <div className="entry-transcript" role="log" aria-label={ru ? 'Разговор' : en ? 'Conversation' : 'Suhbat'} aria-live="polite">
      {snapshot?.messages.slice(-100).map(m => <article key={m.id} data-author={m.author}><small>{m.author === 'visitor' ? (ru ? 'Вы' : en ? 'You' : 'Siz') : m.author === 'operator' ? 'Admin' : 'AI'}</small><p>{m.text}</p></article>)}
    </div>
    {error && <p role="alert">{ru ? 'Не удалось обновить разговор. Повторите попытку или позвоните.' : en ? 'Could not update the conversation. Try again or call.' : 'Suhbatni yangilab bo‘lmadi. Qayta urinib ko‘ring yoki qo‘ng‘iroq qiling.'}</p>}
    <form onSubmit={e => { e.preventDefault(); void command(false); }}><label htmlFor="public-support-message">{ru ? 'Ваш вопрос' : en ? 'Your question' : 'Savolingiz'}</label><textarea id="public-support-message" maxLength={2000} value={text} onChange={e => setText(e.target.value)} disabled={!snapshot || busy || mode === 'CLOSED'} /><button className="entry-primary" disabled={!snapshot || busy || !text.trim() || mode === 'CLOSED'}>{ru ? 'Отправить' : en ? 'Send' : 'Yuborish'}</button></form>
    <button type="button" disabled={!snapshot || busy || mode !== 'AI_ASSISTING'} onClick={() => { void command(true); }}>{ru ? 'Позвать администратора' : en ? 'Request the admin' : 'Adminni suhbatga chaqirish'}</button>
  </div>;
}
