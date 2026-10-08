/**
 * AiBoshqaruvchi.tsx — BOSHQARUVCHI AGENT oynasi (faqat superadmin): tizim agentlari kollektivining bitta ko'rinishi.
 * Nima o'rganildi, nima kutilmoqda, qaysi me'yor sahifalari kuzatilmoqda — hammasi shu yerda. Hech narsa tasdiqsiz kuchga kirmaydi:
 * agent faqat TAKLIF qiladi (bilim, qoida, rivojlanish), superadmin tasdiqlaydi; deploy/migratsiya alohida tasdiq bilan.
 */
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, RefreshCw, Search } from 'lucide-react';
import { bilimHolatiOl, bilimOl, bilimYigish, bilimYoz, kuzatuvOl, kuzatuvSaqla, type BilimHolati, type BilimYozuvi, type KuzatuvUrl, type Markaz } from '../../api/t2-agent-ish';
import { t } from '../../i18n/til';
import { toast } from '../../umumiy/ui/Toast';

const HOLAT_NOMI: Record<string, string> = { ozgarmadi: 'O‘zgarmagan', yangi: 'Yangi (taklif tayyorlandi)', ozgardi: 'O‘zgargan (taklif tayyorlandi)', xato: 'Olinmadi' };
const HOLAT_RANG: Record<string, string> = { ozgarmadi: 'text-text-mute', yangi: 'text-ok', ozgardi: 'text-warn', xato: 'text-danger' };
const YARLIQ_URL = 'Manba sahifa manzili (https://…)';
const YARLIQ_NOM = 'Nomi (masalan: ShNQ 3.01.01-22)';
const YARLIQ_MAQSAD = 'Nimani izlash kerak (ixtiyoriy)';

function Karta({ nom, qiymat, ogoh }: { nom: string; qiymat: number; ogoh?: boolean }) {
  return (
    <div className="karta p-3">
      <div className="text-[11px] uppercase text-text-mute">{t(nom)}</div>
      <div className={`text-[22px] font-semibold tabular-nums ${ogoh && qiymat > 0 ? 'text-warn' : 'text-text'}`}>{qiymat}</div>
    </div>
  );
}

export function AiBoshqaruvchi({ m, taklifgaOt }: { m: Markaz; taklifgaOt: () => void }) {
  const [h, setH] = useState<BilimHolati | null>(null);
  const [kuz, setKuz] = useState<KuzatuvUrl[]>([]);
  const [bilim, setBilim] = useState<BilimYozuvi[]>([]);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);
  const [url, setUrl] = useState(''); const [nom, setNom] = useState(''); const [maqsad, setMaqsad] = useState('');
  const [bs, setBs] = useState(''); const [bm, setBm] = useState(''); const [bk, setBk] = useState('');

  const yukla = useCallback(async () => {
    const [a, b, c] = await Promise.all([bilimHolatiOl(), kuzatuvOl(), bilimOl(null)]);
    if (a.ok) { setH(a.natija); setXato(null); } else setXato(a.error);
    if (b.ok) setKuz(b.natija.natija);
    if (c.ok) setBilim(c.natija.natija);
  }, []);
  useEffect(() => { void yukla(); }, [yukla]);

  const yigish = async () => {
    setBand(true);
    try {
      const r = await bilimYigish();
      if (!r.ok) { toast(r.error, 'danger'); return; }
      const n = r.natija;
      toast(n.korildi === 0 ? t('Kuzatiladigan sahifa yo‘q') : `${t('Tekshirildi')}: ${n.korildi} · ${t('o‘zgargan')}: ${n.ozgardi} · ${t('yangi takliflar')}: ${n.takliflar.length}${n.xatolar ? ` · ${t('xato')}: ${n.xatolar}` : ''}`, n.xatolar ? 'warn' : 'ok');
      void yukla();
    } finally { setBand(false); }
  };
  const qosh = async () => {
    const r = await kuzatuvSaqla({ url: url.trim(), nom: nom.trim(), maqsad: maqsad.trim() || undefined });
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(t('Sahifa kuzatuvga qo‘shildi'), 'ok'); setUrl(''); setNom(''); setMaqsad(''); void yukla();
  };
  const yoz = async () => {
    const r = await bilimYoz(null, { sarlavha: bs.trim(), matn: bm.trim(), kalit: bk });
    if (!r.ok) { toast(r.error, 'danger'); return; }
    toast(r.natija.qabul ? t('Bilim qo‘shildi — barcha agentlar foydalanadi') : t('Bilim taklif sifatida saqlandi'), 'ok'); setBs(''); setBm(''); setBk(''); void yukla();
  };

  if (xato) return <section role="alert" className="karta border-danger/40 p-4 text-danger">{xato}</section>;
  if (!h) return <p className="p-4 text-text-dim">{t('Yuklanmoqda…')}</p>;
  return (
    <section className="space-y-3" aria-label={t('Boshqaruvchi agent')}>
      <div className="karta p-3 text-[12px] text-text-dim">
        <b className="text-text">{t('Boshqaruvchi agent')}</b> — {t('tizim agentlari kollektivi: signallardan kamchilik topadi, tasdiqlangan manbalardan yangi me‘yorlarni o‘rganadi va barcha agentlarga yetkazadi. U faqat taklif qiladi — deploy, migratsiya va yangi bilim sizning tasdig‘ingizsiz kuchga kirmaydi.')}
      </div>

      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Karta nom="Tasdiq kutayotgan takliflar" qiymat={m.sonlar.taklif_kutilmoqda} ogoh />
        <Karta nom="Yangi signallar" qiymat={m.sonlar.signal_yangi} />
        <Karta nom="Umumiy bilim (faol)" qiymat={h.bilim_global} />
        <Karta nom="Kompaniya bilimi" qiymat={h.bilim_kompaniya} />
        <Karta nom="Kutayotgan bilim" qiymat={h.bilim_kutilmoqda} ogoh />
        <Karta nom="O‘zgargan manbalar" qiymat={h.kuzatuv_ozgargan} ogoh />
      </div>
      {(m.sonlar.taklif_kutilmoqda > 0 || h.bilim_kutilmoqda > 0) && (
        <button type="button" onClick={taklifgaOt} className="tugma h-8 px-3 text-[12px]">{t('Kutayotgan takliflarni ko‘rib chiqish')}</button>
      )}

      <div className="karta space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-text"><Search size={14} />{t('Me‘yor va qonun manbalari (kuzatuv)')}</h3>
          <button type="button" disabled={band || kuz.length === 0} onClick={() => void yigish()} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-accent/40 px-3 py-1 text-xs text-accent hover:bg-accent/10 disabled:opacity-40">
            <RefreshCw size={12} className={band ? 'animate-spin' : ''} />{band ? t('Tekshirilmoqda…') : t('Yangi me‘yorlarni tekshirish')}
          </button>
        </div>
        <p className="text-[11px] text-text-mute">{t('Faqat «Qoidalar va manbalar» da tasdiqlangan domenlar kuzatiladi. Sahifa o‘zgarmagan bo‘lsa, token sarflanmaydi.')}</p>
        {kuz.length === 0 && <p className="text-xs text-text-dim">{t('Hali kuzatiladigan sahifa yo‘q.')}</p>}
        <ul className="space-y-1">
          {kuz.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-xs">
              <span className="font-medium text-text">{k.nom}</span>
              <a href={k.url} target="_blank" rel="noreferrer" className="truncate text-accent underline">{k.domen}</a>
              <span className={HOLAT_RANG[k.oxirgi_holat ?? ''] ?? 'text-text-mute'}>{k.oxirgi_holat ? t(HOLAT_NOMI[k.oxirgi_holat]) : t('Hali tekshirilmagan')}</span>
              {k.oxirgi_vaqt && <span className="text-text-mute">{new Date(k.oxirgi_vaqt).toLocaleString('ru-RU')}</span>}
              {k.oxirgi_izoh && <span className="text-text-mute">{k.oxirgi_izoh}</span>}
            </li>
          ))}
        </ul>
        <div className="grid gap-2 md:grid-cols-[2fr_1.2fr_1.5fr_auto]">
          <input aria-label={t(YARLIQ_URL)} placeholder={t(YARLIQ_URL)} value={url} onChange={(e) => setUrl(e.target.value)} className="input h-8 px-2 text-[12px]" />
          <input aria-label={t(YARLIQ_NOM)} placeholder={t(YARLIQ_NOM)} value={nom} onChange={(e) => setNom(e.target.value)} className="input h-8 px-2 text-[12px]" />
          <input aria-label={t(YARLIQ_MAQSAD)} placeholder={t(YARLIQ_MAQSAD)} value={maqsad} onChange={(e) => setMaqsad(e.target.value)} className="input h-8 px-2 text-[12px]" />
          <button type="button" disabled={!url.trim() || !nom.trim()} onClick={() => void qosh()} className="tugma-asosiy h-8 px-3 text-[12px] disabled:opacity-40">{t('Kuzatuvga qo‘shish')}</button>
        </div>
      </div>

      <div className="karta space-y-2 p-3">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-text"><BookOpen size={14} />{t('Umumiy bilim (barcha agentlar)')}</h3>
        {bilim.length === 0 && <p className="text-xs text-text-dim">{t('Tasdiqlangan bilim hali yo‘q — kuzatuvdan yoki qo‘lda qo‘shiladi.')}</p>}
        <ul className="space-y-1">
          {bilim.map((b) => (
            <li key={b.id} className="rounded border border-border/60 px-2 py-1.5 text-xs">
              <div className="font-medium text-text">{b.sarlavha} <span className="text-text-mute">v{b.versiya}</span></div>
              <div className="text-text-dim">{b.matn}</div>
              <div className="text-text-mute">{b.kalit.join(', ')}{b.manba_url ? ` · ${b.manba_url}` : ''}</div>
            </li>
          ))}
        </ul>
        <details className="text-xs">
          <summary className="cursor-pointer text-accent">{t('Bilimni qo‘lda qo‘shish')}</summary>
          <div className="mt-2 grid gap-2">
            <input aria-label={t('Sarlavha')} placeholder={t('Sarlavha')} value={bs} onChange={(e) => setBs(e.target.value)} className="input h-8 px-2 text-[12px]" />
            <textarea aria-label={t('Matn (manba va bandini ko‘rsating)')} placeholder={t('Matn (manba va bandini ko‘rsating)')} rows={3} value={bm} onChange={(e) => setBm(e.target.value)} className="input px-2 py-1.5 text-[12px]" />
            <input aria-label={t('Kalit so‘zlar (vergul bilan)')} placeholder={t('Kalit so‘zlar (vergul bilan)')} value={bk} onChange={(e) => setBk(e.target.value)} className="input h-8 px-2 text-[12px]" />
            <button type="button" disabled={bs.trim().length < 3 || bm.trim().length < 20 || !bk.trim()} onClick={() => void yoz()} className="tugma-asosiy h-8 w-fit px-3 text-[12px] disabled:opacity-40">{t('Bilimni saqlash')}</button>
          </div>
        </details>
      </div>

      {h.oxirgi_veb.length > 0 && (
        <div className="karta p-3">
          <h3 className="mb-1 text-[13px] font-semibold text-text">{t('Oxirgi olingan manbalar')}</h3>
          <ul className="space-y-0.5 text-[11px] text-text-mute">
            {h.oxirgi_veb.map((v, i) => <li key={i}>{new Date(v.yaratildi).toLocaleString('ru-RU')} · {v.domen} · HTTP {v.status ?? '—'} · {(v.sha256 ?? '').slice(0, 10)}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
