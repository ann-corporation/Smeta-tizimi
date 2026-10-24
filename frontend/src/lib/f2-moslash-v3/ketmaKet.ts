/**
 * KETMA-KET TARQATIB BOG'LASH (egasi 2026-10-24: «ketma-ket ikki tarafda ham mos turibdi, lekin 10 lab narsalarni bittalab
 * birlashtirishim kerak. Bir nechtasini tanlab smeta tarafga tashlasam, qolganlarini shu atrofidagilariga tarqatib bog'lasin»).
 *
 *  - `ketmaKetBogla`: belgilangan F2 qatorlari (F2 tartibida) smetadagi LANGAR qatordan boshlab, shu otaning pastdagi
 *    qatorlariga juftlanadi. Dalil — `qatorMosmi` (nom+birlik aynan yoki kod+o'lcham); mos kelmagan smeta qatorlari
 *    o'tkazib yuboriladi, birligi farqli hech qachon juftlanmaydi; juftsiz F2 qatorlari o'zgarmaydi va ro'yxatda qaytadi.
 *  - `pastdagilarniBogla`: qo'lda bog'langan F2 qatoridan keyin F2 dagi qo'shnilari va smetadagi qo'shnilari mos turgan
 *    ekan — davom ettiradi (birinchi mos kelmagan joyda to'xtaydi).
 * Ikkalasi ham bitta yangi IshJoyi qaytaradi — UI da bitta «Orqaga» qadami.
 */
import type { F2Tugun } from '../smeta-anatomiya/f2';
import { gradeFarq, type SmetaQator } from './index';
import { ishniBogla, type F2Indeks, type IshJoyi, type SmetaIndeks } from './ishJoyi';
import { qatorMosmi } from './mustaqil';

export const KETMA_KET_USUL = 'ketma_ket';

export interface KetmaKetNatija { ij: IshJoyi; boglandi: number; topilmadi: F2Tugun[] }

/** Smeta qatori va shu otadagi pastdagi qo'shnilari (tartib bo'yicha), qatorning o'zidan boshlab. */
function smetaQatori(S: SmetaIndeks, langarId: number): SmetaQator[] {
  const l = S.byId.get(langarId);
  if (!l) return [];
  const qoshni = (S.bolalar.get(l.otaId ?? null) ?? []).filter((x) => x.tur !== 'rz');
  const i = qoshni.findIndex((x) => x.id === l.id);
  return i < 0 ? [l] : qoshni.slice(i);
}

/** Bitta juftni yozish: ish (resurslari bilan) — ishniBogla; resurs/mustaqil qator — qo'lda bog'lash. */
function juftla(ij: IshJoyi, f: F2Tugun, s: SmetaQator, S: SmetaIndeks): IshJoyi {
  if (f.tur === 'bl' && f.bolalar.length && s.tur === 'bl') return ishniBogla(ij, f, s.id, S).ij;
  const bog = new Map(ij.bog);
  bog.set(f.uid, { qatorId: s.id, holat: 'qolda', usul: KETMA_KET_USUL });
  const otkaz = new Set(ij.otkaz); otkaz.delete(f.uid);
  return { bog, otkaz };
}

/**
 * Belgilangan F2 qatorlarini langar smeta qatoridan boshlab ketma-ket bog'lash. `uidlar` istalgan tartibda — F2 tartibida
 * saralanadi; ishi ham belgilangan resurslar alohida olinmaydi (ish resurslari bilan bog'lanadi). Aktga kiritilmaganlarga tegilmaydi.
 */
export function ketmaKetBogla(ij: IshJoyi, ind: F2Indeks, S: SmetaIndeks, uidlar: Iterable<string>, langarId: number): KetmaKetNatija {
  const tartib = new Map(ind.qatorlar.map((x, i) => [x.uid, i]));
  const tanlov = new Set(uidlar);
  const f2 = [...tanlov].map((u) => ind.byUid.get(u)).filter((x): x is F2Tugun => !!x && x.tur !== 'rz' && !ij.otkaz.has(x.uid))
    .filter((x) => { const o = ind.ota.get(x.uid); return !(o && o.tur === 'bl' && tanlov.has(o.uid)); })
    .sort((a, b) => (tartib.get(a.uid) ?? 0) - (tartib.get(b.uid) ?? 0));
  const qator = smetaQatori(S, langarId);
  let next = ij; let boglandi = 0; const topilmadi: F2Tugun[] = [];
  let k = 0;
  for (const f of f2) {
    let j = -1;
    // Avval nom+birlik aynan, keyin kod+o'lcham — shu tartibda pastga qarab (kod siljigan holatda noto'g'ri qo'shniga tushmasin).
    for (const daraja of ['nom', 'kod'] as const) {
      for (let i = k; i < qator.length; i++) if (qatorMosmi(f, qator[i], gradeFarq) === daraja) { j = i; break; }
      if (j >= 0) break;
    }
    if (j < 0) { topilmadi.push(f); continue; }
    next = juftla(next, f, qator[j], S); boglandi++; k = j + 1;
  }
  return { ij: next, boglandi, topilmadi };
}

/**
 * Qo'lda bog'langan F2 qatoridan PASTGA: F2 dagi keyingi qo'shnilar (shu ota ostida) ↔ smetadagi bog'langan qatordan keyingi
 * qo'shnilar. Har F2 qatori uchun smetada keyingi 3 qator ichidan mosi qidiriladi; topilmasa — to'xtaydi. Allaqachon
 * tasdiqlangan F2 qatorlari o'z joyida qoladi (smeta ko'rsatkichi ularning qatoridan o'tadi).
 */
export function pastdagilarniBogla(ij: IshJoyi, ind: F2Indeks, S: SmetaIndeks, uid: string): KetmaKetNatija {
  const f0 = ind.byUid.get(uid);
  const b0 = ij.bog.get(uid);
  if (!f0 || !b0) return { ij, boglandi: 0, topilmadi: [] };
  const ota = ind.ota.get(uid) ?? null;
  const qoshni = (ota ? ota.bolalar : ind.qatorlar.filter((x) => (ind.ota.get(x.uid) ?? null) === null)).filter((x) => x.tur !== 'rz');
  const f2 = qoshni.slice(qoshni.findIndex((x) => x.uid === uid) + 1);
  const qator = smetaQatori(S, b0.qatorId).slice(1);
  let next = ij; let boglandi = 0; let k = 0;
  for (const f of f2) {
    if (ij.otkaz.has(f.uid)) continue;
    const b = next.bog.get(f.uid);
    if (b && b.holat !== 'taklif') {
      const i = qator.findIndex((x, n) => n >= k && x.id === b.qatorId);
      if (i >= 0) { k = i + 1; continue; }
      break;
    }
    let j = -1;
    for (const daraja of ['nom', 'kod'] as const) {
      for (let i = k; i < Math.min(qator.length, k + 3); i++) if (qatorMosmi(f, qator[i], gradeFarq) === daraja) { j = i; break; }
      if (j >= 0) break;
    }
    if (j < 0) break;
    next = juftla(next, f, qator[j], S); boglandi++; k = j + 1;
  }
  return { ij: next, boglandi, topilmadi: [] };
}
