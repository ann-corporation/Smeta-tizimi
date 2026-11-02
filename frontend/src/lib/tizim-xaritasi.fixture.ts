/** Tizim xaritasi testlari uchun SINTETIK graf (real mijoz ma'lumoti va summa yo'q). */
import type { TizimGraf, TizimTugun } from '../api/t2-tizim-xaritasi';
import { MODUL_TARTIB } from './tizim-xaritasi';

/** Sintetik graf (real mijoz ma'lumoti emas): 2 kompaniya × 7 modul + integratsiya tuguni. */
export function sintetikGraf(o: { filtr?: number } = {}): TizimGraf {
  const kompaniyalar = [{ id: 1, nom: 'Sinov A', holat: 'xato' }, { id: 2, nom: 'Sinov B', holat: 'ok' }].filter((k) => !o.filtr || k.id === o.filtr);
  const tugunlar: TizimTugun[] = [];
  if (!o.filtr) tugunlar.push({ id: 'tizim:0', tur: 'tizim', nom: 'Tizim', meta: { holat: 'xato', kompaniya_soni: 2, kompaniya_jami: 2, obyekt_soni: 5, xato_24s: 1, navbat: 3 } });
  for (const k of kompaniyalar) {
    tugunlar.push({ id: 'kompaniya:' + k.id, tur: 'kompaniya', nom: k.nom, meta: { kompaniya_id: k.id, holat: k.holat, obyekt_soni: 2, ochiq_signal: 4, kritik_signal: 1, xato_24s: k.id === 1 ? 1 : 0, navbat: 3, faol_obyektlar: [{ id: 10, nom: 'Obyekt X', soni_7k: 3, oxirgi: '2026-10-27T10:00:00Z', ochiq_signal: 1 }] } });
  }
  for (const k of kompaniyalar) {
    for (const mk of MODUL_TARTIB) {
      const xato = k.id === 1 && mk === 'f2';
      tugunlar.push({ id: `modul:${k.id}:${mk}`, tur: 'modul', nom: mk, meta: {
        kompaniya_id: k.id, modul: mk, holat: xato ? 'xato' : mk === 'smeta' ? 'diqqat' : 'ok',
        soni_24s: 2, soni_7k: 5, xato_24s: xato ? 1 : 0, ochiq_signal: 0, kritik_signal: mk === 'smeta' ? 2 : 0,
        navbat: mk === 'f2' ? 3 : mk === 'agentlar' ? 0 : null, navbat_qotgan: 0,
        oxirgi_amal: mk === 'smeta' ? { vaqt: '2026-10-27T10:00:00Z', kim: 'actor:2', kim_nom: 'Sinov Boss', amal: 'resource_create', matn: null, obyekt_id: 10 } : null,
        xatolar: xato ? [{ vaqt: '2026-10-27T10:00:00Z', matn: 'F2 import: canceling statement due to statement timeout', manba: 'f2_import', daraja: 'error' }] : [],
      } });
    }
  }
  if (!o.filtr) tugunlar.push({ id: 'platforma:integratsiya', tur: 'integratsiya', nom: 'Integratsiyalar', meta: { holat: 'ok', qatorlar: [{ kod: 'drive', nom: 'Drive', holat: 'healthy' }] } });
  const bogichlar = [
    ...(!o.filtr ? kompaniyalar.map((k) => ({ manba: 'tizim:0', maqsad: 'kompaniya:' + k.id, tur: 'tizim_kompaniya' })) : []),
    ...tugunlar.filter((n) => n.tur === 'modul').map((n) => ({ manba: 'kompaniya:' + n.meta!.kompaniya_id, maqsad: n.id, tur: 'kompaniya_modul' })),
    ...(!o.filtr ? [{ manba: 'tizim:0', maqsad: 'platforma:integratsiya', tur: 'tizim_platforma' }] : []),
  ];
  return {
    ok: true, versiya: 1, vaqt: '2026-10-27T10:00:00Z', tugunlar, bogichlar,
    oxirgi_hodisalar: [
      { vaqt: '2026-10-27T10:00:00Z', kompaniya_id: 1, kompaniya_nom: 'Sinov A', modul: 'f2', matn: 'F2 import: canceling statement due to statement timeout', daraja: 'error', manba: 'f2_import', obyekt_id: null },
      { vaqt: '2026-10-27T09:00:00Z', kompaniya_id: 1, kompaniya_nom: 'Sinov A', modul: 'smeta', matn: 'resource_create', daraja: 'info', manba: 'audit', obyekt_id: 10, kim_nom: 'Sinov Boss' },
    ],
    malumot_yoq: ['deploy', 'ishlar'],
    korinish: { doira: o.filtr ? 'kompaniya' : 'tizim', superadmin: true, kompaniya_id: o.filtr ?? null, kompaniya_jami: 2, kompaniya_soni: kompaniyalar.length, oyna_soat: 24, oyna_kun: 7 },
  };
}

