import { expect,it } from 'vitest';
import { ovozdanKirimTaklif } from './ovoz-taklif';
const catalog=[{nom:'Sement',birliklar:['qop','kg'],yetkazuvchilar:['Zavod A'],manbaQatorlar:[1]},
  {nom:'Щебень 5-20',birliklar:['м3','т'],yetkazuvchilar:['Karyer B'],manbaQatorlar:[2]}];
it('offers source-backed fields for a single explicit material/quantity/unit and direction without inventing date',()=>{
  const r=ovozdanKirimTaklif('Sement 50 qop keldi Zavod A',catalog);
  expect(r).toMatchObject({operatsiya:'prixod',maydonlar:{nom:'Sement',miqdor:'50',birlik:'qop',yetkazuvchi:'Zavod A'},noaniq:false});
  expect(r.maydonlar.sana).toBeUndefined();expect(r.maydonlar.hujjat).toBeUndefined();
});
it('recognizes issue separately and never guesses ambiguous material or quantity from its code',()=>{
  expect(ovozdanKirimTaklif('Sement 3 kg berdim',catalog).operatsiya).toBe('rasxod');
  expect(ovozdanKirimTaklif('Щебень 5-20 keldi',catalog).maydonlar.miqdor).toBeUndefined();
  expect(ovozdanKirimTaklif('Sement va Щебень 5-20 10 kub keldi',catalog).maydonlar).toEqual({});
  expect(ovozdanKirimTaklif('Sement 5 qop va 10 kg keldi',catalog)).toMatchObject({noaniq:true,maydonlar:{nom:'Sement'}});
});
it('does not convert units or create unknown entities from the transcript',()=>{
  expect(ovozdanKirimTaklif('Gips 50 qop keldi',catalog).maydonlar).toEqual({});
  expect(ovozdanKirimTaklif('Sement 5 tonna keldi notanish yetkazuvchi',catalog).maydonlar).toEqual({nom:'Sement'});
  expect(ovozdanKirimTaklif('Sement 5 qop keldi va berdim',catalog).operatsiya).toBeNull();
});
