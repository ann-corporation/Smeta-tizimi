/**
 * Yordamchi taklif kartasi: «nima qilaman» ko'rsatiladi, foydalanuvchi belgilab «Bajarish» ni bosadi; pul/huquqiy ta'sirli amal
 * ikkinchi aniq «Tasdiqlayman» talab qiladi (ovoz bilan tasdiqlanmaydi). Karta o'zi hech narsa yozmaydi — faqat tasdiqdan keyin
 * `vositalar.bajar` (mavjud yozish yo'llari, operation_id bilan) chaqiriladi.
 */
import { useState } from 'react';
import { AgentAmallar, AgentPulTasdiq } from '../ai-yordamchi/AgentQismlar';
import type { SahifaAmal } from '../../../lib/ai-yordamchi/protokol';
import type { IshlovTaklif } from './ishlov';

type Qator = SahifaAmal & { ogoh: string | null; tanlangan: boolean };

export function YordamchiTaklif({ taklif, onTugadi }: { taklif: IshlovTaklif; onTugadi: (natija: string[]) => void }) {
  const [list, setList] = useState<Qator[]>(() => taklif.amallar.map((a) => ({ ...a, tanlangan: !a.ogoh })));
  const [pulTasdiq, setPulTasdiq] = useState(false);
  const [band, setBand] = useState(false);
  const [yopiq, setYopiq] = useState(false);
  if (yopiq || !list.length) return null;

  const pulMi = (a: SahifaAmal) => taklif.vositalar.pul(a) === true;
  const qatorlar = list.map((a) => ({ nom: taklif.vositalar.nomi(a), izoh: a.izoh, ogoh: a.ogoh, tanlangan: a.tanlangan, pul: pulMi(a), qoshimcha: taklif.qoshimcha(a) }));

  async function bajar(tasdiqlangan = false) {
    const tanlangan = list.filter((a) => a.tanlangan && !a.ogoh);
    if (!tanlangan.length) return;
    if (!tasdiqlangan && tanlangan.some(pulMi)) { setPulTasdiq(true); return; }
    setPulTasdiq(false); setBand(true);
    try {
      const natija = await taklif.vositalar.bajar(tanlangan.map(({ tanlangan: _t, ogoh: _o, ...a }) => a));
      setYopiq(true); onTugadi(natija);
    } finally { setBand(false); }
  }

  return <div className="mt-2" data-testid="yordamchi-taklif">
    {pulTasdiq
      ? <AgentPulTasdiq band={band} amallar={qatorlar} onTasdiq={() => void bajar(true)} onOrqaga={() => setPulTasdiq(false)} />
      : <AgentAmallar band={band} amallar={qatorlar} onBajar={() => void bajar()} onBekor={() => { setYopiq(true); onTugadi([]); }}
        onTanla={(i, v) => setList((l) => l.map((x, j) => (j === i && !x.ogoh ? { ...x, tanlangan: v } : x)))} />}
  </div>;
}
