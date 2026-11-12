/**
 * LoyihachiBugun.tsx — /admin/loyihachi: rol uyi «Bugun» («PlayStation pulti»): 4–6 katta tugma, har birida son va keyingi qadam.
 * Bitta so'rov (`bugun`), sodda o'zbekcha. Loyihachi / mualliflik nazorati uchun; pudratchi va texnadzor a'zolari ham shu sahifadan
 * o'z tomonidagi tugmalarni ko'radi (bir komponent, rolga qarab tugmalar). Hammasi mavjud sahifalarga olib boradi — yangi modul YO'Q.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KompaniyaKerak } from '../../umumiy/kontekst/KompaniyaKerak';
import { useKompaniya } from '../../umumiy/kontekst/KompaniyaKontekst';
import { Sahifa } from '../../umumiy/ui/Sahifa';
import { loyihachiBugunOl, type BugunSanoq } from '../../api/t2-loyihachi';
import { bugunTomoni, bugunTugmalari } from '../../lib/loyihachi/chizma-yadro';
import { t } from '../../i18n/til';

export default function LoyihachiBugun() {
  const { joriy } = useKompaniya();
  const kompaniyaId = joriy?.id ?? null;
  const [sanoq, setSanoq] = useState<BugunSanoq | null>(null);
  const [xato, setXato] = useState('');
  useEffect(() => {
    if (!kompaniyaId) return;
    let bekor = false;
    void loyihachiBugunOl(kompaniyaId).then((r) => { if (bekor) return; if (r.ok) { setSanoq(r.natija); setXato(''); } else setXato(r.error); });
    return () => { bekor = true; };
  }, [kompaniyaId]);
  if (!kompaniyaId) return <KompaniyaKerak nima="Bugun" />;
  const tugmalar = bugunTugmalari(bugunTomoni(joriy?.rol), sanoq);
  return (
    <Sahifa sarlavha="Bugun" tavsif="Chizmalar, savollar va remarklar: bugun nima qilish kerak">
      {xato && <div role="alert" className="mb-3 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{xato}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tugmalar.map((x) => (
          <Link key={x.kalit} to={x.yol} className={`fz-card block p-4 hover:border-accent ${x.ogoh ? 'border-warn' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="text-base font-semibold">{t(x.nom)}</div>
              {x.son != null && <span className={`rounded px-2 py-0.5 text-lg font-bold tabular-nums ${x.ogoh ? 'bg-warn/15 text-warn' : 'bg-surface-2'}`}>{x.son}</span>}
            </div>
            <p className="mt-1 text-sm text-text-dim">{t(x.izoh)}</p>
          </Link>))}
      </div>
    </Sahifa>
  );
}
