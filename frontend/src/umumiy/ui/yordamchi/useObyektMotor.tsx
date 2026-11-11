/**
 * Yagona yordamchi (Jarvis) obyekt «motori»: tanlangan obyektning smeta/fakt/F2 ma'lumotini BIR marta o'qiydi va o'sha
 * ma'lumot ustida o'qish/yozish vositalarini beradi. Yangi hisob yo'q: avvalgi Ctrl+K «AI buyruq satri» (AiBuyruqSatri) bilan
 * bir xil funksiyalar — `daraxtVaHolatOl` (sahifalar ishlatadigan o'qish), `buyruqVositalar` (fakt-jurnal/hisob yadrosi),
 * `useUstamaliSumma` (ustamali summa). Yozuv — faqat mavjud yo'llar (`sbFaktYoz`, `narxProtokolYarat`) va faqat tasdiqdan keyin.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../../i18n/til';
import { yangiOperationId, type T2Qator, type T2QatorHolat } from '../../../api/supabase';
import { sbFaktYoz } from '../../../api/t2-fakt';
import { narxProtokolYarat } from '../../../api/t2-narx-protokol';
import { daraxtVaHolatOl } from '../../../lib/oylik-hujjat/ostatka-slichitelniy';
import { amalDelta, buyruqMalumotQur, buyruqVositalar, type BuyruqMalumot, type BuyruqYoz, type OchiqSahifa, type YozNatija } from '../../../lib/ai-yordamchi/buyruq-vositalar';
import type { SahifaAmal } from '../../../lib/ai-yordamchi/protokol';
import type { SahifaVositalar } from '../../../lib/ai-yordamchi/sikl';
import type { UstamaliFn } from '../../../lib/ai-yordamchi/fakt-vositalar';
import { SummaJuft } from '../SummaJuft';
import { useUstamaliSumma } from '../useUstamaliSumma';
import { toast } from '../Toast';

export type MalumotNatija = { ok: true; rows: T2Qator[]; states: T2QatorHolat[] } | { ok: false; xato: string };
export type MotorDeps = {
  malumotOl: { (obyektId: number): Promise<MalumotNatija> };
  yoz: Pick<BuyruqYoz, 'faktYoz' | 'narxProtokol' | 'yangiOperationId'>;
};

/** Haqiqiy bog'lanishlar: mavjud o'qish va yozish yo'llari (yangi RPC yo'q). */
export const HAQIQIY_MOTOR_DEPS: MotorDeps = {
  malumotOl: (id) => daraxtVaHolatOl(id),
  yoz: {
    faktYoz: (p) => sbFaktYoz({ obyektId: p.obyektId, sana: p.sana, qatorlar: p.qatorlar, izoh: p.izoh, operationId: p.operationId }) as Promise<YozNatija>,
    narxProtokol: (p) => narxProtokolYarat(p.obyektId, p.qatorlar, p.izoh, p.operationId),
    yangiOperationId,
  },
};

export type MotorHolat = 'yoq' | 'yuklanmoqda' | 'tayyor' | 'xato';
export type Motor = {
  obyektId: number | null; holat: MotorHolat; xato: string;
  vositalar: (SahifaVositalar & { pul: (a: SahifaAmal) => boolean }) | null;
  /** Taklif kartasiga qo'shimcha: eski → yangi va pul farqi (SummaJuft: ustamali + ustamasiz). */
  qoshimcha: (a: SahifaAmal) => ReactNode;
};

export function useObyektMotor({ kompaniyaId, obyektId, obyektNomi, faol, sahifalar, och, deps = HAQIQIY_MOTOR_DEPS }: {
  kompaniyaId: number | null; obyektId: number | null; obyektNomi?: string; faol: boolean; sahifalar: readonly OchiqSahifa[]; och: (yol: string) => void; deps?: MotorDeps;
}): Motor {
  const yoqilgan = faol && kompaniyaId != null && obyektId != null;
  const h = useUstamaliSumma(yoqilgan ? obyektId : null, { kompaniyaId });
  const ustamaliRef = useRef<UstamaliFn>(() => ({ ustamali: null, taxminiy: false }));
  ustamaliRef.current = (s) => {
    const u = h.hisobla(s.kesim);
    if (u?.ustamali == null) return { ustamali: null, taxminiy: false };
    const nomalum = u.nomalum.soni > 0 || u.nomalum.summa !== 0;
    if (nomalum && u.ustamasiz === 0) return { ustamali: null, taxminiy: false };
    return { ustamali: nomalum ? u.ustamali + u.nomalum.summa : u.ustamali, taxminiy: nomalum };
  };

  const [data, setData] = useState<{ obyektId: number; rows: T2Qator[]; states: T2QatorHolat[] } | null>(null);
  const [xato, setXato] = useState('');
  const [versiya, setVersiya] = useState(0);
  const depsRef = useRef(deps); depsRef.current = deps;
  const ochRef = useRef(och); ochRef.current = och;

  useEffect(() => {
    if (!yoqilgan || obyektId == null) return undefined;
    let tirik = true;
    setXato('');
    void depsRef.current.malumotOl(obyektId).then((r) => {
      if (!tirik) return;
      if (r.ok) setData({ obyektId, rows: r.rows, states: r.states }); else setXato(r.xato);
    }).catch(() => { if (tirik) setXato(t('Obyekt ma’lumotini o‘qib bo‘lmadi. Tarmoq yoki ruxsatni tekshiring.')); });
    return () => { tirik = false; };
  }, [yoqilgan, obyektId, versiya]);

  const m: BuyruqMalumot | null = useMemo(
    () => (data && data.obyektId === obyektId ? buyruqMalumotQur(data.rows, data.states, { obyektNomi, sahifalar, ustamali: (s) => ustamaliRef.current(s) }) : null),
    [data, obyektId, obyektNomi, sahifalar]);
  const mRef = useRef<BuyruqMalumot | null>(m); mRef.current = m;
  const bos = useMemo(() => buyruqMalumotQur([], []), []);
  const yangila = useCallback(() => setVersiya((v) => v + 1), []);

  const vositalar = useMemo(() => (obyektId == null ? null : buyruqVositalar(() => mRef.current ?? bos, obyektId, {
    ...deps.yoz, yangila,
    korsat: (qatorId) => {
      const r = mRef.current?.qatorById.get(qatorId);
      toast(`[#${qatorId}] ${r?.kod ?? ''} ${r?.nom ?? ''}`.trim(), 'ok');
      window.dispatchEvent(new CustomEvent('ai-buyruq:korsat', { detail: { qatorId } }));
    },
    och: (yol) => ochRef.current(yol),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [obyektId, bos, yangila]);

  const qoshimcha = useCallback((a: SahifaAmal): ReactNode => {
    const cur = mRef.current;
    if (!cur || obyektId == null || kompaniyaId == null) return null;
    const d = amalDelta(cur, a);
    if (!d) return null;
    return <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-dim" data-testid="ai-taklif-delta">
      <span>{d.eski} → {d.yangi}</span>
      <SummaJuft obyektId={obyektId} kompaniyaId={kompaniyaId} ustamasiz={d.ustamasiz} katKesim={d.kesim} kichik rejim="ustamali" />
    </span>;
  }, [obyektId, kompaniyaId]);

  const holat: MotorHolat = !yoqilgan ? 'yoq' : m ? 'tayyor' : xato ? 'xato' : 'yuklanmoqda';
  return { obyektId: yoqilgan ? obyektId : null, holat, xato, vositalar: m ? vositalar : null, qoshimcha };
}
