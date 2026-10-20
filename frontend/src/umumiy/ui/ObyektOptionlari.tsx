import { useEffect, useState } from 'react';
import { guruhYorligi, ierarxiyaOl, obyektGuruhla, type IerarxiyaManba, type ObyektLike } from '../../lib/obyekt-ierarxiya';

/**
 * Obyekt <select> ichidagi variantlar — «Loyiha › Shartnoma» guruhlari (optgroup) bilan. Har qanday obyekt ro'yxati
 * shunchaki `{obyektlar.map(o => <option…>)}` o'rniga `<ObyektOptionlari obyektlar={obyektlar} />` yozadi.
 * Ierarxiya o'qilmaguncha yoki o'qilmasa — oddiy ro'yxat (tanlov hech qachon bloklanmaydi).
 */
export function ObyektOptionlari<O extends ObyektLike & { kompaniya_id?: number | null }>(p: { obyektlar: readonly O[]; kompaniyaId?: number | null }) {
  const kid = p.kompaniyaId ?? p.obyektlar.find((o) => o.kompaniya_id != null)?.kompaniya_id ?? null;
  const [m, setM] = useState<IerarxiyaManba | null>(null);
  useEffect(() => {
    if (kid == null) return;
    let faol = true;
    void ierarxiyaOl(kid).then((x) => { if (faol) setM(x); });
    return () => { faol = false; };
  }, [kid]);
  if (!m) return <>{p.obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}</>;
  return <>{obyektGuruhla(p.obyektlar, m).map((g) => (
    <optgroup key={g.kalit} label={guruhYorligi(g)}>
      {g.obyektlar.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
    </optgroup>
  ))}</>;
}
