/**
 * AiIshchilar.tsx — FON AI ISHCHILARI paneli (kompaniya va tizim): yoqish/o'chirish, jadval, limit, «Hozir ishga tushir», natijalar inbox'i, sarf.
 * Poydevor: migratsiya 20261218500000 (t2_ai_*), shlyuz /api/ai-ishchi. Hamma ishchi sukut bo'yicha O'CHIQ; yoqish — kompaniya boss'i
 * (tizim ishchilari — superadmin). Agent faqat o'qiydi va taklif beradi: pul/hujjatni o'zi tasdiqlamaydi. Token kompaniya hamyonidan yechiladi.
 */
import { useCallback, useEffect, useState } from 'react';
import { aiIshchiOl, aiIshchiYoz, type IshchiQatori, type ManbaQatori, type NatijaQatori, type SarfMalumoti, type YozFn } from '../../api/ai-ishchi';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const son = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU'));
const vaqt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const HOLAT_NOMI: Record<string, string> = { navbatda: 'Navbatda', ishlayapti: 'Ishlayapti', tugadi: 'Tugadi', xato: 'Xato', limit: 'Limit tugadi' };
const AI_NOMI: Record<string, string> = { yoq: 'Faqat faktlar', kutilmoqda: 'AI xulosa navbatda', ishlayapti: 'AI yozmoqda', tayyor: 'AI xulosa tayyor', limit: 'AI limiti tugadi', xato: 'AI xatosi' };
const USTUVOR = ['', 'Diqqat', 'Shoshilinch'];

function HolatChip({ holat }: { holat: string }) {
  const rang = holat === 'xato' || holat === 'limit' ? 'fz-stamp--danger' : holat === 'tugadi' ? 'fz-stamp--ok' : 'fz-stamp--info';
  return <span className={`fz-stamp ${rang}`}>{t(HOLAT_NOMI[holat] ?? holat)}</span>;
}

function IshchiKarta({ w, kid, band, onYoz }: { w: IshchiQatori; kid: number | null; band: boolean; onYoz: YozFn }) {
  const [jadval, setJadval] = useState(w.jadval);
  const [aiX, setAiX] = useState(w.ai_xulosa);
  const [maxT, setMaxT] = useState(String(w.max_token_ish));
  useEffect(() => { setJadval(w.jadval); setAiX(w.ai_xulosa); setMaxT(String(w.max_token_ish)); }, [w.jadval, w.ai_xulosa, w.max_token_ish]);
  const saqla = (yoqilgan: boolean) => onYoz(() => aiIshchiYoz({ amal: 'sozlama_saqla', kompaniya_id: kid, ishchi: w.kod, yoqilgan, jadval, soat: w.soat, ai_xulosa: aiX, max_token_ish: Number(maxT) || 3000 }), yoqilgan ? 'Ishchi yoqildi' : 'Ishchi saqlandi');
  return (
    <div className="fz-panel space-y-2" data-testid={`ishchi-${w.kod}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[13px]">{t(w.nom)}</b>
        <span className={`fz-stamp ${w.yoqilgan ? 'fz-stamp--ok' : 'fz-stamp--info'}`}>{w.yoqilgan ? t('Yoqilgan') : t('O‘chiq')}</span>
        {w.yangi_natija > 0 && <span className="fz-stamp fz-stamp--info">{w.yangi_natija} {t('yangi natija')}</span>}
        <button type="button" disabled={band || !w.yoqilgan} className="fz-btn fz-btn--primary fz-btn--sm ml-auto" onClick={() => void onYoz(() => aiIshchiYoz({ amal: 'ishga_tushir', kompaniya_id: kid, ishchi: w.kod }), 'Ishchi ishga tushirildi — natija pastda')}>
          {band ? t('Ishlamoqda…') : t('Hozir ishga tushir')}
        </button>
      </div>
      <p className="text-[12px] text-text-mute">{t(w.tavsif)}</p>
      {!w.yoqilgan && <p className="text-[12px] text-text-dim" data-testid="ishchi-ochiq-izoh">{t('Hali ishga tushmagan — yoqing. Yoqilmaguncha hech qanday sarf bo‘lmaydi.')}</p>}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <label className="flex items-center gap-1">{t('Jadval')}
          <select className="h-7 px-1" value={jadval} onChange={(e) => setJadval(e.target.value as typeof jadval)}>
            <option value="qolda">{t('Faqat qo‘lda')}</option><option value="kunlik">{t('Har kuni')}</option><option value="haftalik">{t('Har hafta (dushanba)')}</option>
          </select>
        </label>
        {w.ai_bor && (
          <label className="flex items-center gap-1"><input type="checkbox" checked={aiX} onChange={(e) => setAiX(e.target.checked)} />{t('AI xulosa (o‘chiq = faqat faktlar, token sarflanmaydi)')}</label>
        )}
        <label className="flex items-center gap-1">{t('Bitta ish chegarasi (token)')}
          <input className="h-7 w-20 px-1 tabular-nums" inputMode="numeric" value={maxT} onChange={(e) => setMaxT(e.target.value.replace(/[^0-9]/g, ''))} />
        </label>
        <button type="button" className="fz-btn fz-btn--sm" disabled={band} onClick={() => void saqla(w.yoqilgan)}>{t('Saqlash')}</button>
        <button type="button" className={`fz-btn fz-btn--sm ${w.yoqilgan ? '' : 'fz-btn--primary'}`} disabled={band} onClick={() => void saqla(!w.yoqilgan)}>{w.yoqilgan ? t('O‘chirish') : t('Yoqish')}</button>
      </div>
      {w.oxirgi && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-mute" data-testid="ishchi-oxirgi">
          {t('Oxirgi ish')}: {vaqt(w.oxirgi.yaratildi)} <HolatChip holat={w.oxirgi.holat} />
          <span>{t(AI_NOMI[w.oxirgi.ai_holat] ?? w.oxirgi.ai_holat)}</span>
          {w.oxirgi.holat === 'limit' && <span className="text-danger">{t('AI limiti tugadi — faktlar ro‘yxati baribir pastda. Limitni oshiring yoki hisobni to‘ldiring.')}</span>}
          {w.oxirgi.holat === 'xato' && <span className="text-danger">{t('Ish xato bilan to‘xtadi')} ({w.oxirgi.xato_kod ?? '—'})</span>}
        </div>
      )}
    </div>
  );
}

function NatijaKarta({ n, nomi, onHolat }: { n: NatijaQatori; nomi: string; onHolat: (id: number, holat: 'oqildi' | 'bajarildi') => void }) {
  return (
    <div className="fz-panel space-y-1" data-testid={`natija-${n.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[13px]">{n.sarlavha}</b>
        {n.ustuvorlik > 0 && <span className="fz-stamp fz-stamp--danger">{t(USTUVOR[n.ustuvorlik])}</span>}
        <span className="fz-stamp fz-stamp--info">{n.quruq ? t('Faqat faktlar') : t('AI xulosa')}</span>
        <span className="text-[11px] text-text-dim">{t(nomi)} · {vaqt(n.yaratildi)}</span>
        <span className={`fz-stamp ml-auto ${n.holat === 'yangi' ? 'fz-stamp--info' : 'fz-stamp--ok'}`}>{n.holat === 'yangi' ? t('Yangi') : n.holat === 'oqildi' ? t('O‘qildi') : t('Bajarildi')}</span>
      </div>
      <p className="whitespace-pre-wrap text-[12px]">{n.xulosa}</p>
      {n.bandlar.length > 0 && (
        <details className="text-[12px]"><summary className="cursor-pointer text-text-mute">{t('Faktlar')} ({n.bandlar.length})</summary>
          <ul className="list-disc pl-5">{n.bandlar.map((b, i) => <li key={i}>{b.matn}</li>)}</ul>
        </details>
      )}
      <div className="flex gap-2">
        {n.holat === 'yangi' && <button type="button" className="fz-btn fz-btn--sm" onClick={() => onHolat(n.id, 'oqildi')}>{t('O‘qildi')}</button>}
        {n.holat !== 'bajarildi' && <button type="button" className="fz-btn fz-btn--sm" onClick={() => onHolat(n.id, 'bajarildi')}>{t('Bajarildi')}</button>}
      </div>
    </div>
  );
}

/** kid = kompaniya id; tizim=true → platforma ishchilari (kid=null). */
export function AiIshchilar({ kid, tizim }: { kid: number | null; tizim: boolean }) {
  const [ishchilar, setIshchilar] = useState<IshchiQatori[] | null>(null);
  const [inbox, setInbox] = useState<NatijaQatori[]>([]);
  const [sarf, setSarf] = useState<SarfMalumoti | null>(null);
  const [manbalar, setManbalar] = useState<ManbaQatori[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [faqatYangi, setFaqatYangi] = useState(false);

  const yukla = useCallback(async () => {
    const a = await aiIshchiOl('ishchilar', kid);
    const b = await aiIshchiOl('inbox', kid, faqatYangi ? 'yangi' : undefined);
    const c = await aiIshchiOl('sarf', kid);
    if (!a.ok) { setXato(a.error); setIshchilar(null); return; }
    setXato(null); setIshchilar(a.data.royxat); setInbox(b.ok ? b.data.royxat : []); setSarf(c.ok ? c.data : null);
    if (tizim) { const mb = await aiIshchiOl('manbalar', null); setManbalar(mb.ok ? mb.data.royxat : []); }
  }, [kid, tizim, faqatYangi]);
  useEffect(() => { void yukla(); }, [yukla]);

  const yoz: YozFn = async (fn, xabar) => {
    setBand(true);
    try { const r = await fn(); if (r.ok) { toast(t(xabar), 'ok'); await yukla(); } else toast(r.error ?? t('Xato'), 'danger'); }
    finally { setBand(false); }
  };
  const nomOf = (kod: string) => ishchilar?.find((w) => w.kod === kod)?.nom ?? kod;

  if (xato) return <p className="text-xs text-text-dim" data-testid="ishchi-xato">{t('AI ishchilar mavjud emas')}: {xato}</p>;
  if (!ishchilar) return <p className="text-xs text-text-dim">{t('Yuklanmoqda…')}</p>;
  const jamiYangi = ishchilar.reduce((s, w) => s + w.yangi_natija, 0);
  return (
    <section className="space-y-3" aria-label={tizim ? t('Tizim ishchilari') : t('Kompaniya ishchilari')}>
      <div>
        <h2 className="text-sm font-semibold">{tizim ? t('Tizim ishchilari') : t('Kompaniya ishchilari (fon AI)')}</h2>
        <p className="text-[12px] text-text-mute">{tizim
          ? t('Platformani kuzatadi; natija sizning navbatingizga TAKLIF bo‘lib tushadi. Internetdan kelgan hech narsa o‘zi qoidaga, narxga yoki kodga aylanmaydi.')
          : t('Rejali ishlaydigan AI ishchilar: faqat o‘qiydi va taklif beradi, pul va hujjatni o‘zi tasdiqlamaydi. Sarf kompaniya tokenidan yechiladi; limit tugasa faktlar ro‘yxati baribir chiqadi.')}</p>
      </div>
      {sarf && (
        <div className="fz-panel flex flex-wrap items-center gap-4 text-[12px]" data-testid="ishchi-sarf">
          <span>{t('Shu oy ishchilar sarfi (token)')}: <b className="tabular-nums">{son(sarf.oy_token_ishchi)}</b></span>
          <span>{t('Jami AI sarfi')}: <b className="tabular-nums">{son(sarf.oy_token_jami)}</b></span>
          {sarf.token_limit != null && <span>{t('limit')}: <b className="tabular-nums">{son(sarf.token_limit)}</b></span>}
          {sarf.token_balans != null && <span className={sarf.token_balans <= 0 ? 'text-danger' : ''}>{t('Token balansi')}: <b className="tabular-nums">{son(sarf.token_balans)}</b></span>}
          {sarf.ishchilar.map((s) => <span key={s.ishchi} className="text-text-mute">{t(nomOf(s.ishchi))}: {son(s.token)} ({s.chaqiruv}×)</span>)}
        </div>
      )}
      {ishchilar.length === 0 && <p className="text-xs text-text-dim">{t('Ishchi ta‘riflari topilmadi (migratsiya qo‘llanmagan).')}</p>}
      <div className="grid gap-2 xl:grid-cols-2">{ishchilar.map((w) => <IshchiKarta key={w.kod} w={w} kid={kid} band={band} onYoz={yoz} />)}</div>

      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">{t('Natijalar')} {jamiYangi > 0 && <span className="fz-stamp fz-stamp--info">{jamiYangi} {t('yangi')}</span>}</h3>
        <label className="ml-auto flex items-center gap-1 text-[12px]"><input type="checkbox" checked={faqatYangi} onChange={(e) => setFaqatYangi(e.target.checked)} />{t('Faqat yangilari')}</label>
      </div>
      {inbox.length === 0
        ? <p className="text-xs text-text-dim" data-testid="inbox-bosh">{t('Hali natija yo‘q. Ishchini yoqing va «Hozir ishga tushir» tugmasini bosing — natija shu yerda chiqadi.')}</p>
        : <div className="space-y-2">{inbox.map((n) => <NatijaKarta key={n.id} n={n} nomi={nomOf(n.ishchi_kod)} onHolat={(id, holat) => void yoz(() => aiIshchiYoz({ amal: 'natija_holat', natija_id: id, holat }), 'Belgilandi')} />)}</div>}

      {tizim && manbalar && (
        <div className="fz-panel space-y-2" data-testid="manbalar">
          <h3 className="text-[13px] font-semibold">{t('Kuzatiladigan manbalar')}</h3>
          <p className="text-[12px] text-text-mute">{t('Faqat shu ro‘yxatdagi va tasdiqlangan domenlar yuklanadi (robots.txt hurmat qilinadi). Yangi manba qo‘shish — «Boshqaruvchi agent» bo‘limida; bu yerda yoqish/o‘chirish va chastota.')}</p>
          {manbalar.length === 0 && <p className="text-xs text-text-dim">{t('Manba yo‘q — internet kuzatuvchi hech narsa yuklamaydi.')}</p>}
          {manbalar.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 text-[12px]">
              <input type="checkbox" checked={m.faol} disabled={band} aria-label={m.nom} onChange={(e) => void yoz(() => aiIshchiYoz({ amal: 'manba_saqla', kompaniya_id: null, id: m.id, faol: e.target.checked }), 'Manba saqlandi')} />
              <b>{m.nom}</b><span className="text-text-dim">{m.domen}</span>
              {!m.domen_ruxsat && <span className="fz-stamp fz-stamp--danger">{t('Domen tasdiqlanmagan')}</span>}
              <select className="h-7 px-1" value={m.chastota_soat} disabled={band} onChange={(e) => void yoz(() => aiIshchiYoz({ amal: 'manba_saqla', kompaniya_id: null, id: m.id, chastota_soat: Number(e.target.value) }), 'Manba saqlandi')}>
                {[6, 12, 24, 72, 168].map((h) => <option key={h} value={h}>{t('Har')} {h} {t('soatda')}</option>)}
              </select>
              <span className="text-text-mute">{t('Oxirgi')}: {vaqt(m.oxirgi_vaqt)} {m.oxirgi_holat ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
