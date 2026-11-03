/**
 * (boshQidiruv o'zgarsa — ota `key` bilan qayta o'rnatadi.)
 * Bitimlar voronkasi (kanban): lid → aloqa → ko'rsatildi → bron → shartnoma → to'lov → topshirildi (+ «bekor» tugmasi bilan).
 * Kartada: mijoz, telefon, birlik, summa, keyingi aloqa (kechikkani qizil), bron qolgan vaqti. Bosqich — ro'yxatdan (drag-drop emas).
 * Telefonda ustunlar gorizontal aylantiriladi.
 */
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';
import { ModalOyna } from '../../components/pto-workspace/ModalOyna';
import { yangiOperationId } from '../../api/supabase';
import { bitimSaqla, type BitimQator } from '../../api/t2-sotuv';
import { MANBALAR, aloqaHolat, bronQoldi, kanbanGuruh, telefonKorinish, type Manba } from '../../lib/sotuv/bitim-korinish';
import { telefonNorm } from '../../lib/sotuv/hisob';
import { Maydon, Pul } from './umumiy';
import { BOSQICH_NOMI, MANBA_NOMI, kirit, useSotuvYangila, xatoMatn } from './sotuv-umumiy';
import { useBitimlar } from './sorovlar';
import { BosqichTanla } from './BosqichAmal';

export function Kanban({ kid, binolar, boshQidiruv, bitimOch }: {
  kid: number; binolar: ReadonlyArray<{ id: number; nom: string }>; boshQidiruv: string; bitimOch: (id: number) => void;
}) {
  const [qidiruv, setQidiruv] = useState(boshQidiruv);
  const q = useDeferredValue(qidiruv.trim());
  const [bekor, setBekor] = useState(false);
  const [yangi, setYangi] = useState(false);
  const bitimlar = useBitimlar(kid, { qidiruv: q || undefined, yopilganlar: bekor || undefined });
  const ustunlar = useMemo(() => kanbanGuruh(bitimlar.data ?? [], bekor), [bitimlar.data, bekor]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:flex-none">
          <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-text-mute" aria-hidden="true" />
          <input className={`${kirit} pl-7`} value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Ism yoki telefon')} aria-label={t('Qidiruv')} />
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={bekor} onChange={(e) => setBekor(e.target.checked)} />{t('Bekor qilinganlarni ko‘rsatish')}</label>
        <button type="button" className="fz-btn fz-btn--primary fz-btn--sm ml-auto" onClick={() => setYangi(true)}><Plus size={14} aria-hidden="true" />{t('Yangi lid')}</button>
      </div>
      {bitimlar.isLoading && <p className="text-text-mute">{t('Yuklanmoqda…')}</p>}
      {bitimlar.error && <p className="fz-note fz-note--danger">{t((bitimlar.error as Error).message)}</p>}

      <div className="flex min-h-0 gap-2 overflow-x-auto pb-2" aria-label={t('Bitimlar voronkasi')}>
        {ustunlar.map((u) => (
          <section key={u.bosqich} className="flex w-[250px] shrink-0 flex-col rounded-md border border-border bg-surface-2/40" aria-label={BOSQICH_NOMI[u.bosqich]()}>
            <header className="flex items-center justify-between border-b border-border px-2 py-1.5 text-[12px] font-semibold">
              <span>{BOSQICH_NOMI[u.bosqich]()}</span><span className="fz-chip">{u.bitimlar.length}</span>
            </header>
            <div className="flex max-h-[65vh] flex-col gap-1.5 overflow-y-auto p-1.5">
              {u.bitimlar.map((b) => <BitimKartochka key={b.id} kid={kid} b={b} binolar={binolar} bitimOch={bitimOch} />)}
              {!u.bitimlar.length && <p className="px-1 py-2 text-center text-[11.5px] text-text-mute">{t('Bo‘sh')}</p>}
            </div>
          </section>
        ))}
      </div>
      {yangi && <YangiLid kid={kid} yop={() => setYangi(false)} tayyor={(id) => { setYangi(false); bitimOch(id); }} />}
    </div>
  );
}

function BitimKartochka({ kid, b, binolar, bitimOch }: { kid: number; b: BitimQator; binolar: ReadonlyArray<{ id: number; nom: string }>; bitimOch: (id: number) => void }) {
  const aloqa = aloqaHolat(b.keyingi_aloqa);
  const bron = b.bosqich === 'bron' ? bronQoldi(b.bron_tugaydi) : null;
  return (
    <article className="rounded-md border border-border bg-surface p-2 text-[12px] shadow-sm">
      <button type="button" className="block w-full text-left" onClick={() => bitimOch(b.id)}>
        <span className="block font-semibold text-text">{b.mijoz}</span>
        <span className="block tabular-nums text-text-dim">{telefonKorinish(b.telefon)}</span>
        {b.birlik && <span className="block text-text-dim">{t('Birlik {raqam}', { raqam: b.birlik.raqam })}{b.birlik.xona_soni != null ? ` · ${b.birlik.xona_soni}x` : ''}{b.birlik.maydon != null ? ` · ${b.birlik.maydon} m²` : ''}</span>}
        {b.summa != null && <span className="block"><Pul val={b.summa} valyuta={b.valyuta} /></span>}
        {aloqa && (
          <span className={`block ${aloqa === 'otgan' ? 'font-medium text-danger' : aloqa === 'bugun' ? 'text-warn' : 'text-text-mute'}`}>
            {aloqa === 'otgan' ? t('Aloqa kechikdi: {s}', { s: String(b.keyingi_aloqa).slice(0, 10) }) : t('Keyingi aloqa: {s}', { s: String(b.keyingi_aloqa).slice(0, 16).replace('T', ' ') })}
          </span>
        )}
        {bron && <span className={`block ${bron.otdi ? 'text-danger' : 'text-warn'}`}>{bron.otdi ? t('Bron muddati tugadi') : t('Bron: {s} soat {d} daqiqa qoldi', { s: bron.soat, d: bron.daqiqa })}</span>}
      </button>
      <div className="mt-1.5">
        <BosqichTanla kid={kid} ixcham binolar={binolar} kartaOch={bitimOch}
          bitim={{ id: b.id, versiya: b.versiya, bosqich: b.bosqich, birlik_id: b.birlik_id, summa: b.summa, mijoz: b.mijoz }} />
      </div>
    </article>
  );
}

export function YangiLid({ kid, yop, tayyor }: { kid: number; yop: () => void; tayyor: (id: number) => void }) {
  const [fio, setFio] = useState('');
  const [tel, setTel] = useState('');
  const [manba, setManba] = useState<Manba>('telegram');
  const [izoh, setIzoh] = useState('');
  const [aloqa, setAloqa] = useState('');
  const [rozilik, setRozilik] = useState(false);
  const [band, setBand] = useState(false);
  const op = useRef(yangiOperationId());
  const yangila = useSotuvYangila();
  const norm = telefonNorm(tel);
  const ok = fio.trim().length > 0 && norm.length >= 9 && norm.length <= 15;
  const saqla = async () => {
    setBand(true);
    const r = await bitimSaqla(kid, {
      mijoz: { fio: fio.trim(), telefon: tel.trim(), manba, rozilik }, manba, izoh: izoh.trim() || undefined,
      keyingi_aloqa: aloqa ? new Date(aloqa).toISOString() : undefined,
    }, op.current);
    setBand(false);
    if (!r.ok || !r.id) { toast(xatoMatn(r), 'danger'); return; }
    toast(t('Lid yaratildi')); yangila(); tayyor(r.id);
  };
  return (
    <ModalOyna sarlavha={t('Yangi lid')} yop={yop} kenglik={480}>
      <div className="space-y-3 text-[13px]">
        <Maydon nom={t('F.I.O.')}><input className={kirit} value={fio} onChange={(e) => setFio(e.target.value)} aria-label={t('F.I.O.')} autoFocus /></Maydon>
        <Maydon nom={t('Telefon')}>
          <input className={kirit} value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} aria-label={t('Telefon')} />
          {norm.length >= 9 && <span className="mt-0.5 block text-[11.5px] text-text-mute">{telefonKorinish(norm)}</span>}
        </Maydon>
        <Maydon nom={t('Manba')}>
          <select className={kirit} value={manba} onChange={(e) => setManba(e.target.value as Manba)}>
            {MANBALAR.map((m) => <option key={m} value={m}>{MANBA_NOMI[m]()}</option>)}
          </select>
        </Maydon>
        <Maydon nom={t('Keyingi aloqa')}><input type="datetime-local" className={kirit} value={aloqa} onChange={(e) => setAloqa(e.target.value)} aria-label={t('Keyingi aloqa')} /></Maydon>
        <Maydon nom={t('Izoh')}><textarea className={kirit} rows={2} value={izoh} onChange={(e) => setIzoh(e.target.value)} aria-label={t('Izoh')} /></Maydon>
        <label className="flex items-center gap-2"><input type="checkbox" checked={rozilik} onChange={(e) => setRozilik(e.target.checked)} />{t('Shaxsiy ma’lumotga rozilik')}</label>
        <div className="flex justify-end gap-2">
          <button type="button" className="fz-btn fz-btn--ghost" onClick={yop}>{t('Bekor qilish')}</button>
          <button type="button" className="fz-btn fz-btn--primary" disabled={!ok || band} onClick={saqla}>{t('Saqlash')}</button>
        </div>
      </div>
    </ModalOyna>
  );
}
