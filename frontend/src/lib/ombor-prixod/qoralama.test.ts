import { expect, it } from 'vitest';
import { prixodQoralama, qoralamaTahrirla, qoralamaTasdiqla, qoralamaTasdiqlangan, qoralamaQator } from './qoralama';
import { materialTaklifQur, materialTaklifQidir, materialMaydonTaklif } from './taklif';
import type { PrixodQator } from './turlar';
const row = (extra: Partial<PrixodQator> = {}): PrixodQator => ({manbaQator:8,manbaRaqam:'5',sana:'2026-10-27',nom:'Щебень 5-20',birlik:'м3',miqdor:12,
  miqdorMatni:'12',tur:'Материал',yetkazuvchi:'Карьер',hujjat:'',narx:null,summa:null,qqs:null,kalit:'old-source-key',holat:'yangi',xatolar:[],ogohlar:[],...extra});
it('full confirmation is required and editing any visible field invalidates it',()=>{
  const d=prixodQoralama(row());expect(qoralamaTasdiqlangan(d)).toBe(false);
  const approved=qoralamaTasdiqla(d);expect(qoralamaTasdiqlangan(approved)).toBe(true);
  for(const f of ['sana','nom','birlik','miqdor','yetkazuvchi','hujjat'] as const) {
    const edited=qoralamaTahrirla(approved,{[f]: approved.maydonlar[f]+' '});
    expect(qoralamaTasdiqlangan(edited),f).toBe(false);
  }
  const bypass={...approved,maydonlar:{...approved.maydonlar,miqdor:'13'}};
  expect(qoralamaTasdiqlangan(bypass)).toBe(false);
});
it('correcting a draft preserves original source and invalidates prior duplicate identity',()=>{
  const source=row({birlik:'',miqdor:null,miqdorMatni:'',holat:'xato',xatolar:['BIRLIK_YOQ','MIQDOR_YOQ']});
  const before=structuredClone(source);let d=prixodQoralama(source);
  expect(qoralamaTasdiqlangan(qoralamaTasdiqla(d))).toBe(false);
  d=qoralamaTahrirla(d,{birlik:'т',miqdor:'12,25'});const effective=qoralamaQator(qoralamaTasdiqla(d));
  expect(effective).toMatchObject({birlik:'т',miqdor:12.25,holat:'yangi',kalit:null,narx:null,summa:null,qqs:null});
  expect(source).toEqual(before);expect(d.manba).toEqual(before);expect(effective.xatolar).toEqual([]);
});
it('source date-formatted quantity requires correction before approval',()=>{
  let d=prixodQoralama(row({miqdor:null,miqdorMatni:'27.10.2026',xatolar:['MIQDOR_SANA']}));
  expect(qoralamaQator(d).xatolar).toContain('MIQDOR_SANA');
  expect(qoralamaTasdiqlangan(qoralamaTasdiqla(d))).toBe(false);
  d=qoralamaTahrirla(d,{miqdor:'27'});expect(qoralamaTasdiqlangan(qoralamaTasdiqla(d))).toBe(true);
});
it('sheb finds actual Cyrillic gravel candidates with their available units and suppliers',()=>{
  const rows=[row(),row({manbaQator:9,birlik:'т',yetkazuvchi:'Карьер Б'}),row({manbaQator:10,nom:'Sement',birlik:'qop',yetkazuvchi:'Zavod'})];
  const before=structuredClone(rows);const items=materialTaklifQur(rows);const found=materialTaklifQidir(items,'sheb');
  expect(found.map(x=>x.nom)).toEqual(['Щебень 5-20']);
  expect(materialMaydonTaklif(items,found[0].nom,'birliklar')).toEqual(['м3','т']);
  expect(materialMaydonTaklif(items,found[0].nom,'birliklar','м3')).toEqual(['м3','т']);
  expect(materialMaydonTaklif(items,found[0].nom,'yetkazuvchilar','kar')).toEqual(['Карьер','Карьер Б']);
  expect(rows).toEqual(before);
});
it('suggestions do not invent unavailable material/unit/supplier values or convert quantity',()=>{
  const items=materialTaklifQur([row()]);expect(materialTaklifQidir(items,'sement')).toEqual([]);
  expect(materialMaydonTaklif(items,'Щебень 5-20','birliklar','kg')).toEqual([]);
  expect(materialMaydonTaklif(items,'Unknown material','birliklar')).toEqual([]);
  expect(items[0].birliklar).toEqual(['м3']);
});
