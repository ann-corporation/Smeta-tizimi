/**
 * NazoratTayinlash.tsx — buyurtmachi kabinetida «Texnik nazoratni tayinlash». Texnik nazorat = FUNKSIYA:
 * (A) o'z xodimi (sifat qarori ruxsati bor a'zo) yoki (B) buyurtmachi yollagan autsorsing texnadzor kompaniyasiga obyekt bo'yicha VAKOLAT.
 * Vakolat doirasi pudratchi buyurtmachiga bergan grantlar bilan kesishadi (server tekshiradi), bekor qilinsa darhol yopiladi.
 */
import { useCallback, useEffect, useState } from 'react';
import { aloqalarOl, nazoratTayinBekor, nazoratTayinla, nazoratTayinlarOl, vakolatBekor, vakolatBer, zakazchikObyektlarOl,
  type Aloqa, type NazoratTayinlar, type ZakazchikObyekt } from '../../api/t2-tomon';
import { azolikRuxsatlariOl, type AzolikRuxsat } from '../../api/t2-men';
import { toast } from '../../umumiy/ui/Toast';
import { t } from '../../i18n/til';
import { Bolim } from './tomon-ui';
import { inp, tugma, tugmaAsosiy } from './tomon-yordam';

const RESURS_NOMI: Record<string, string> = { f2: 'F2 hujjatlari', lab_natija: 'Laboratoriya natijalari', obyekt_holat: 'Obyekt holati' };

export default function NazoratTayinlash({ kompaniyaId }: { kompaniyaId: number }) {
  const [d, setD] = useState<NazoratTayinlar | null>(null);
  const [obyektlar, setObyektlar] = useState<ZakazchikObyekt[]>([]);
  const [aloqalar, setAloqalar] = useState<Aloqa[]>([]);
  const [obyektId, setObyektId] = useState('');
  const [aloqaId, setAloqaId] = useState('');
  const [xodimId, setXodimId] = useState('');
  const [nazoratchilar, setNazoratchilar] = useState<AzolikRuxsat[]>([]);
  const [resurslar, setResurslar] = useState<string[]>(['f2', 'lab_natija']);
  const [yakuniy, setYakuniy] = useState(false);

  const ol = useCallback(async () => {
    const [a, o, l] = await Promise.all([nazoratTayinlarOl(kompaniyaId), zakazchikObyektlarOl(kompaniyaId), aloqalarOl(kompaniyaId)]);
    if (a.ok) setD(a.natija);
    if (o.ok) setObyektlar(o.natija);
    if (l.ok) setAloqalar(l.natija.filter((x) => x.holat === 'faol' && ['texnadzor', 'inspeksiya'].includes(x.qarshi_rol)));
    /* Faqat sifat qarori (quality.decide) ruxsati bor a'zolar tanlanadi (mavjud a'zolar ruxsati API'si). */
    void azolikRuxsatlariOl(kompaniyaId).then((m) => setNazoratchilar(m.azolar.filter((x) => (x.effective_permissions ?? []).includes('quality.decide')))).catch(() => setNazoratchilar([]));
  }, [kompaniyaId]);
  useEffect(() => { void ol(); }, [ol]);

  const xato = (e: { error: string }) => toast(e.error, 'danger');
  const vakolat = async () => {
    if (!obyektId || !aloqaId) { toast(t('Obyekt va texnadzor kompaniyasini tanlang'), 'warn'); return; }
    const r = await vakolatBer(kompaniyaId, { aloqaId: Number(aloqaId), obyektId: Number(obyektId), resurslar, amallar: yakuniy ? ['korish', 'qaror'] : ['korish', 'texnik_qaror'] });
    if (r.ok) { toast(t('Vakolat berildi')); await ol(); } else xato(r);
  };
  const xodim = async () => {
    if (!obyektId || !xodimId) { toast(t('Obyekt va xodimni tanlang'), 'warn'); return; }
    const r = await nazoratTayinla(kompaniyaId, Number(obyektId), Number(xodimId));
    if (r.ok) { toast(t('Texnik nazoratchi tayinlandi')); setXodimId(''); await ol(); } else xato(r);
  };

  return (
    <Bolim sarlavha="Texnik nazoratni tayinlash">
      <p className="text-xs text-text-dim mb-2">{t('Texnik nazorat — funksiya: o‘z xodimingiz yoki siz yollagan autsorsing kompaniya. Vakolat siz pudratchidan olgan ruxsatlardan keng bo‘lmaydi.')}</p>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <label className="text-xs">{t('Obyekt')}
          <select className={inp} value={obyektId} onChange={(e) => setObyektId(e.target.value)} data-testid="nazorat-obyekt">
            <option value="">—</option>{obyektlar.map((o) => <option key={o.obyekt_id} value={o.obyekt_id}>{o.obyekt_nom} · #{o.obyekt_id}</option>)}
          </select></label>
        <label className="text-xs">{t('Autsorsing texnadzor kompaniyasi')}
          <select className={inp} value={aloqaId} onChange={(e) => setAloqaId(e.target.value)} data-testid="nazorat-aloqa">
            <option value="">—</option>{aloqalar.map((a) => <option key={a.id} value={a.id}>{a.qarshi_nom}</option>)}
          </select></label>
        {Object.keys(RESURS_NOMI).map((k) => (
          <label key={k} className="text-xs flex items-center gap-1"><input type="checkbox" checked={resurslar.includes(k)} onChange={(e) => setResurslar((s) => (e.target.checked ? [...s, k] : s.filter((x) => x !== k)))} />{t(RESURS_NOMI[k])}</label>
        ))}
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={yakuniy} onChange={(e) => setYakuniy(e.target.checked)} />{t('Mening nomimdan yakuniy qaror ham chiqarsin')}</label>
        <button type="button" className={tugmaAsosiy} onClick={() => void vakolat()}>{t('Vakolat berish')}</button>
      </div>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <label className="text-xs">{t('O‘z xodimi (sifat qarori ruxsati bor)')}
          <select className={inp} value={xodimId} onChange={(e) => setXodimId(e.target.value)} data-testid="nazorat-xodim">
            <option value="">—</option>{nazoratchilar.map((m) => <option key={m.azolik_id} value={m.foydalanuvchi_id}>{m.ism || m.login} · {m.rol}</option>)}
          </select></label>
        <button type="button" className={tugma} onClick={() => void xodim()}>{t('Xodimni tayinlash')}</button>
      </div>
      <ul className="divide-y divide-border text-[13px]" data-testid="nazorat-royxat">
        {(d?.bergan ?? []).map((x) => (
          <li key={`v${x.id}`} className="py-2 flex flex-wrap gap-2 items-center">
            <b>{x.vakil_nom}</b><span className="text-text-dim">{x.obyekt_nom}</span><span className="fz-chip">{t('vakil')}</span>
            <span className="text-text-mute">{x.resurslar.map((r) => t(RESURS_NOMI[r] ?? r)).join(', ')}</span>
            <button type="button" className={`${tugma} ml-auto`} onClick={() => void vakolatBekor(kompaniyaId, x.id).then(() => ol())}>{t('Vakolatni bekor qilish')}</button>
          </li>))}
        {(d?.xodimlar ?? []).map((x) => (
          <li key={`x${x.id}`} className="py-2 flex flex-wrap gap-2 items-center">
            <b>{x.ism ?? `#${x.foydalanuvchi_id}`}</b><span className="text-text-dim">{x.obyekt_nom}</span><span className="fz-chip">{t('o‘z xodimi')}</span>
            <button type="button" className={`${tugma} ml-auto`} onClick={() => void nazoratTayinBekor(kompaniyaId, x.id).then(() => ol())}>{t('Bekor qilish')}</button>
          </li>))}
        {d && d.bergan.length === 0 && d.xodimlar.length === 0 && <li className="py-2 text-text-dim">{t('Texnik nazorat hali tayinlanmagan')}</li>}
      </ul>
    </Bolim>
  );
}
