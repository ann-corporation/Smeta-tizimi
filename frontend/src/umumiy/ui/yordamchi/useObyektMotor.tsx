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
import { lugatKompaniyaOl, naryadlarOl, tarixOl } from '../../../api/t2-naryad';
import type { NaryadQisqa } from '../../../lib/naryad';
import { ustaNaryadlarOl } from '../../../api/t2-usta';
import { hrMenOl } from '../../../api/t2-hr';
import { ustaNaryadSatrlari, type NaryadSatr } from '../../../lib/usta/naryad-ish';
import { useKompaniya } from '../../kontekst/KompaniyaKontekst';
import { lugatOrnat } from '../../../lib/qurilish-lugat';
import { sbArxivla } from '../../../api/t2-arxiv';
import { daraxtVaHolatOl } from '../../../lib/oylik-hujjat/ostatka-slichitelniy';
import { loyihaFarqMalumotOl } from '../../../api/t2-loyiha-smeta';
import type { LoyihaFarqMalumot } from '../../../lib/loyiha-smeta/jarvis';
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
  yoz: Pick<BuyruqYoz, 'faktYoz' | 'narxProtokol' | 'yangiOperationId' | 'arxivla'>;
};

/** Haqiqiy bog'lanishlar: mavjud o'qish va yozish yo'llari (yangi RPC yo'q). */
export const HAQIQIY_MOTOR_DEPS: MotorDeps = {
  malumotOl: (id) => daraxtVaHolatOl(id),
  yoz: {
    faktYoz: (p) => sbFaktYoz({ obyektId: p.obyektId, sana: p.sana, qatorlar: p.qatorlar, izoh: p.izoh, operationId: p.operationId }) as Promise<YozNatija>,
    narxProtokol: (p) => narxProtokolYarat(p.obyektId, p.qatorlar, p.izoh, p.operationId),
    arxivla: (obyektId) => sbArxivla('obyekt', obyektId),
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

  /* Naryadlar (Jarvis «naryad» vositasi) va kompaniya lug'ati («lugat» vositasi, qidiruv) — xato bo'lsa jim: umumiy lug'at ishlayveradi. */
  const [naryadlar, setNaryadlar] = useState<NaryadQisqa[] | undefined>(undefined);
  useEffect(() => {
    if (!yoqilgan || obyektId == null || kompaniyaId == null) return undefined;
    let tirik = true;
    void naryadlarOl(kompaniyaId, { obyektId, limit: 60 }).then((r) => { if (tirik) setNaryadlar(r ?? undefined); }).catch(() => null);
    void lugatKompaniyaOl(kompaniyaId).then((r) => { if (r) lugatOrnat(r.qiymat); }).catch(() => null);
    return () => { tirik = false; };
  }, [yoqilgan, obyektId, kompaniyaId, versiya]);

  /* Jarvis «mening_naryadim»: faqat USTA (self.work.write, fakt.write yo'q) uchun — o'z naryadlari + oy daromadi HR «Mening oyligim» dan (ikkinchi hisob yo'q). */
  const { joriy: kk, superadmin: sa } = useKompaniya() as { joriy?: { permissions?: string[] } | null; superadmin?: boolean };
  const ustaRejim = !sa && !!kk?.permissions?.includes('self.work.write') && !kk?.permissions?.includes('fakt.write');
  const [ustaBugun, setUstaBugun] = useState<{ satrlar: NaryadSatr[]; oyDaromad: number | null } | undefined>(undefined);
  useEffect(() => {
    if (!yoqilgan || !ustaRejim || obyektId == null || kompaniyaId == null) return undefined;
    let tirik = true;
    void Promise.all([ustaNaryadlarOl(kompaniyaId, obyektId), hrMenOl(kompaniyaId)]).then(([nar, men]) => {
      if (!tirik || !nar) return;
      setUstaBugun({ satrlar: ustaNaryadSatrlari(nar), oyDaromad: 'qator' in men && men.qator ? (men.qator.naryad_summa ?? null) : null });
    }).catch(() => null);
    return () => { tirik = false; };
  }, [yoqilgan, ustaRejim, obyektId, kompaniyaId, versiya]);

  const [loyihaFarq, setLoyihaFarq] = useState<LoyihaFarqMalumot | null>(null);
  useEffect(() => {
    if (!yoqilgan || obyektId == null || kompaniyaId == null) return undefined;
    let tirik = true;
    void loyihaFarqMalumotOl(kompaniyaId, obyektId).then((r) => { if (tirik) setLoyihaFarq(r); }).catch(() => { if (tirik) setLoyihaFarq(null); });
    return () => { tirik = false; };
  }, [yoqilgan, obyektId, kompaniyaId, versiya]);

  const m: BuyruqMalumot | null = useMemo(
    () => (data && data.obyektId === obyektId ? buyruqMalumotQur(data.rows, data.states, { obyektNomi, sahifalar, loyihaFarq, ustamali: (s) => ustamaliRef.current(s), naryadlar, ustaBugun }) : null),
    [data, obyektId, obyektNomi, sahifalar, naryadlar, ustaBugun, loyihaFarq]);
  const mRef = useRef<BuyruqMalumot | null>(m); mRef.current = m;
  const bos = useMemo(() => buyruqMalumotQur([], []), []);
  const yangila = useCallback(() => setVersiya((v) => v + 1), []);

  const vositalar = useMemo(() => (obyektId == null ? null : buyruqVositalar(() => mRef.current ?? bos, obyektId, {
    ...deps.yoz, yangila, tarix: kompaniyaId != null ? (ids, kodlar) => tarixOl(kompaniyaId, ids, kodlar) : undefined,
    korsat: (qatorId) => {
      const r = mRef.current?.qatorById.get(qatorId);
      toast(`[#${qatorId}] ${r?.kod ?? ''} ${r?.nom ?? ''}`.trim(), 'ok');
      window.dispatchEvent(new CustomEvent('ai-buyruq:korsat', { detail: { qatorId } }));
    },
    och: (yol) => ochRef.current(yol),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [obyektId, kompaniyaId, bos, yangila]);

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
