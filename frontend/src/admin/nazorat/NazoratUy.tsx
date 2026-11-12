/**
 * NazoratUy.tsx - /admin/nazorat. TEXNIK NAZORAT (texnadzor) uyi: "pult" - bitta ko'rinishda kundalik ish.
 * Besh katta tugma (yangi tekshiruv, АОСР qarori, F2 qarori, predpisaniyalar, jurnal) + o'zi nazorat qiladigan obyektlar
 * (har birida ochiq predpisaniya, kechikkan, kutayotgan hujjat va oxirgi tekshiruv). Ma'lumot: 2 ta parallel so'rov.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FileSignature, FileSpreadsheet, ListChecks, NotebookText } from 'lucide-react';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { zakazchikObyektlarOl, type ZakazchikObyekt } from '../../api/t2-tomon';
import { nazoratUyOl, type NazoratUy as UyMalumot } from '../../api/t2-nazorat';
import { t } from '../../i18n/til';
import { Bolim } from '../zakazchik/tomon-ui';

type Tugma = { yol: string; nom: string; son?: number; ogoh?: boolean; ikonka: typeof ClipboardCheck; izoh: string };

function KattaTugma({ x }: { x: Tugma }) {
  const I = x.ikonka;
  return (
    <Link to={x.yol} className={`fz-card flex min-h-[96px] flex-col justify-between gap-1 p-4 hover:border-accent ${x.ogoh ? 'border-warn/60' : ''}`}>
      <span className="flex items-center gap-2 text-base font-semibold"><I size={20} aria-hidden />{t(x.nom)}
        {x.son != null && x.son > 0 && <span className={`ml-auto fz-chip ${x.ogoh ? 'fz-chip--warn' : ''}`}>{x.son}</span>}</span>
      <span className="text-xs text-text-dim">{t(x.izoh)}</span>
    </Link>
  );
}

export default function NazoratUy() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [obyektlar, setObyektlar] = useState<ZakazchikObyekt[]>([]);
  const [uy, setUy] = useState<UyMalumot | null>(null);
  const [xato, setXato] = useState('');
  const [yuklandi, setYuklandi] = useState(false);

  useEffect(() => {
    if (!kompaniyaId) return;
    let bekor = false;
    void Promise.all([zakazchikObyektlarOl(kompaniyaId), nazoratUyOl(kompaniyaId)]).then(([o, u]) => {
      if (bekor) return;
      const e = [o, u].find((x) => !x.ok);
      setXato(e && !e.ok ? e.error : '');
      if (o.ok) setObyektlar(o.natija);
      if (u.ok) setUy(u.natija);
      setYuklandi(true);
    });
    return () => { bekor = true; };
  }, [kompaniyaId]);

  const sonlar = useMemo(() => new Map((uy?.obyektlar ?? []).map((x) => [x.obyekt_id, x])), [uy]);
  if (!kompaniyaId) return <KompaniyaKerak nima="Texnik nazorat" />;
  const j = uy?.jami;
  const tugmalar: Tugma[] = [
    { yol: '/admin/nazorat/tekshiruv', nom: 'Yangi tekshiruv', ikonka: ClipboardCheck, izoh: 'Obyektga borib, ishni tekshiring va foto bilan yozing', son: j?.qoralama_tekshiruv },
    { yol: '/admin/taqdimlar?tur=aosr', nom: 'АОСР qarori', ikonka: FileSignature, izoh: 'Pudratchi yuborgan yashirin ish aktlari', son: j?.aosr_kutayotgan, ogoh: (j?.aosr_kutayotgan ?? 0) > 0 },
    { yol: '/admin/taqdimlar?tur=f2', nom: 'F2 qarori', ikonka: FileSpreadsheet, izoh: 'Bajarilgan ishlar akti, fakt va АОСР bilan solishtirish', son: j?.f2_kutayotgan, ogoh: (j?.f2_kutayotgan ?? 0) > 0 },
    { yol: '/admin/murojaatlar', nom: 'Predpisaniyalar', ikonka: ListChecks, izoh: 'Berilgan ko‘rsatmalar, qayta tekshiruv va muddat', son: (j?.pred_qayta_tekshiruv ?? 0) + (j?.pred_kechikkan ?? 0), ogoh: (j?.pred_kechikkan ?? 0) > 0 },
    { yol: '/admin/nazorat/jurnal', nom: 'Tekshiruvlar jurnali', ikonka: NotebookText, izoh: 'Kunlik jurnal va Excelga yuklash', son: j?.bugungi_tekshiruv },
  ];

  return (
    <Sahifa sarlavha="Texnik nazorat" tavsif="Bugungi ishingiz: tekshirish, qaror chiqarish, predpisaniyalarni nazorat qilish">
      <div className="space-y-4">
        {xato && <div role="alert" className="fz-note fz-note--danger">{xato}</div>}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('Asosiy amallar')}>{tugmalar.map((x) => <KattaTugma key={x.yol} x={x} />)}</section>

        {j && (j.pred_kechikkan > 0 || j.pred_qayta_tekshiruv > 0) && (
          <p className="fz-note fz-note--warn" data-testid="nazorat-diqqat">
            {j.pred_qayta_tekshiruv > 0 && `${t('Pudratchi bajardi, siz qayta tekshirishingiz kerak')}: ${j.pred_qayta_tekshiruv}. `}
            {j.pred_kechikkan > 0 && `${t('Muddati o‘tgan predpisaniya')}: ${j.pred_kechikkan}.`}
          </p>
        )}

        <Bolim sarlavha="Men nazorat qiladigan obyektlar">
          {yuklandi && obyektlar.length === 0 && <p className="text-sm text-text-dim">{t('Hali sizga obyekt ochilmagan. Pudratchi “Tomonlar aloqasi” sahifasidan obyektni ochib berishi kerak.')}</p>}
          <ul className="divide-y divide-border">
            {obyektlar.map((o) => {
              const s = sonlar.get(o.obyekt_id);
              return (
                <li key={`${o.aloqa_id}-${o.obyekt_id}`} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <span className="font-semibold">{o.obyekt_nom}</span>
                  <span className="text-text-dim">{o.qarshi_nom}</span>
                  {s && s.ochiq_pred > 0 && <span className="fz-chip">{t('ochiq predpisaniya')}: {s.ochiq_pred}</span>}
                  {s && s.kechikkan > 0 && <span className="fz-chip fz-chip--warn">{t('kechikkan')}: {s.kechikkan}</span>}
                  {s && s.aosr_kutayotgan > 0 && <span className="fz-chip fz-chip--warn">{t('АОСР kutmoqda')}: {s.aosr_kutayotgan}</span>}
                  {s && s.f2_kutayotgan > 0 && <span className="fz-chip fz-chip--warn">{t('F2 kutmoqda')}: {s.f2_kutayotgan}</span>}
                  <span className="text-text-mute">{s?.oxirgi_tekshiruv ? `${t('oxirgi tekshiruv')}: ${s.oxirgi_tekshiruv}` : t('hali tekshirilmagan')}</span>
                  <Link className="fz-btn fz-btn--sm fz-btn--primary ml-auto" to={`/admin/nazorat/tekshiruv?aloqa=${o.aloqa_id}&obyekt=${o.obyekt_id}`}>{t('Tekshirish')}</Link>
                </li>
              );
            })}
          </ul>
        </Bolim>
      </div>
    </Sahifa>
  );
}
