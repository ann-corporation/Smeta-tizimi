/**
 * T2-LRV-CLOSURE-006: Additional/Replacement klient kontrakti.
 *
 * BU FAQAT TAKLIF QILINGAN klient chegarasi. Mos RPC lar hali mavjud emas,
 * shuning uchun bu wrapperlar ishlatiladigan UI ga ulanmagan va sb-yoz
 * whitelistiga qo'shilmagan. Isolated DB qabulidan keyin Claude server
 * signaturelarini tasdiqlaydi.
 */
import { yozAmali, type AktNatija } from './supabase';

type CommandBase = {
  kompaniyaId: number;
  obyektId: number;
  /** Retry vaqtida ham o'zgarmaydigan UUID. */
  operationId: string;
  /** Kanonik qatorning foydalanuvchi ko'rgan versiyasi. */
  expectedVersion: number;
  sabab: string;
  dalilHujjatId?: number;
};

export type T2QoshimchaIshYaratInput = CommandBase & {
  otaQatorId: number;
  nom: string;
  birlik: string;
  hajm: number;
  kod?: string;
  keyinQatorId?: number;
};

export type T2ZamenaIshYaratInput = CommandBase & {
  almashtirilayotganQatorId: number;
  otaQatorId: number;
  nom: string;
  birlik: string;
  hajm: number;
  kod?: string;
  keyinQatorId?: number;
};

export type T2ResursBolaQoshInput = CommandBase & {
  otaQatorId: number;
  tur: 'rs' | 'mat' | 'ob';
  nom: string;
  birlik: string;
  hajm?: number;
  kod?: string;
  keyinQatorId?: number;
};

/**
 * TAKLIF qilingan server command: `qoshimcha_ish_yarat_v1`.
 * Server bo'lmaguncha javob normal ravishda `UNKNOWN_AMAL` bo'lishi mumkin.
 */
export function sbT2QoshimchaIshYarat(p: T2QoshimchaIshYaratInput): Promise<AktNatija> {
  return yozAmali({
    amal: 'qoshimcha_ish_yarat_v1',
    kompaniya_id: p.kompaniyaId,
    obyekt_id: p.obyektId,
    ota_qator_id: p.otaQatorId,
    nom: p.nom,
    birlik: p.birlik,
    hajm: p.hajm,
    kod: p.kod,
    keyin_qator_id: p.keyinQatorId,
    sabab: p.sabab,
    dalil_hujjat_id: p.dalilHujjatId,
    operation_id: p.operationId,
    kutilgan_versiya: p.expectedVersion,
  });
}

/** TAKLIF qilingan server command: `zamena_ish_yarat_v1`. */
export function sbT2ZamenaIshYarat(p: T2ZamenaIshYaratInput): Promise<AktNatija> {
  return yozAmali({
    amal: 'zamena_ish_yarat_v1',
    kompaniya_id: p.kompaniyaId,
    obyekt_id: p.obyektId,
    almashtirilayotgan_qator_id: p.almashtirilayotganQatorId,
    ota_qator_id: p.otaQatorId,
    nom: p.nom,
    birlik: p.birlik,
    hajm: p.hajm,
    kod: p.kod,
    keyin_qator_id: p.keyinQatorId,
    sabab: p.sabab,
    dalil_hujjat_id: p.dalilHujjatId,
    operation_id: p.operationId,
    kutilgan_versiya: p.expectedVersion,
  });
}

/** TAKLIF qilingan server command: `resurs_bola_qosh_v1`. */
export function sbT2ResursBolaQosh(p: T2ResursBolaQoshInput): Promise<AktNatija> {
  return yozAmali({
    amal: 'resurs_bola_qosh_v1',
    kompaniya_id: p.kompaniyaId,
    obyekt_id: p.obyektId,
    ota_qator_id: p.otaQatorId,
    tur: p.tur,
    nom: p.nom,
    birlik: p.birlik,
    hajm: p.hajm,
    kod: p.kod,
    keyin_qator_id: p.keyinQatorId,
    sabab: p.sabab,
    dalil_hujjat_id: p.dalilHujjatId,
    operation_id: p.operationId,
    kutilgan_versiya: p.expectedVersion,
  });
}

/**
 * Egasi 2026-09-28 ("bitta zamena uchun dafiga kuttiradi"): qo'shimcha yoki zamena
 * ish F2 dagi RESURSLARI BILAN birga — BITTA so'rov, BITTA tranzaksiya
 * (`t2_ish_resurslar_bilan_yarat_v1`). Biror resurs rad etilsa hech narsa yozilmaydi;
 * qayta urinishda ayni `operationId` dublikat yaratmaydi.
 */
export type IshResurslarBilanNatija = AktNatija & { resurs_qator_idlar?: number[] };

export function sbT2IshResurslarBilanYarat(p: CommandBase & {
  command: 'additional' | 'replacement';
  otaQatorId: number;
  almashtirilayotganQatorId?: number;
  nom: string; birlik: string; hajm: number; kod?: string;
  resurslar: Array<{ tur: 'rs' | 'mat' | 'ob'; nom: string; birlik: string; hajm?: number | null; kod?: string | null }>;
}): Promise<IshResurslarBilanNatija> {
  return yozAmali({
    amal: 'ish_resurslar_bilan_yarat_v1',
    command: p.command,
    kompaniya_id: p.kompaniyaId,
    obyekt_id: p.obyektId,
    ota_qator_id: p.otaQatorId,
    almashtirilayotgan_qator_id: p.almashtirilayotganQatorId,
    nom: p.nom, birlik: p.birlik, hajm: p.hajm, kod: p.kod,
    sabab: p.sabab, dalil_hujjat_id: p.dalilHujjatId,
    operation_id: p.operationId, kutilgan_versiya: p.expectedVersion,
    resurslar: p.resurslar,
  }) as Promise<IshResurslarBilanNatija>;
}
