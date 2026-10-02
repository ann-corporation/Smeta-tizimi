-- Platforma manbalari ko'rinishiga fayl xeshi (takroriy katalog faylini bloklash uchun).
begin;
create or replace view public.t2_platforma_narx_manba as
 select id, tur, nom, raqam, sana, yetkazuvchi, region, yil, kvartal, nds_holati, izoh, holat, versiya, yaratildi, yangilandi,
   (select count(*) from t2_narx_manba_qator q where q.manba_id = m.id and not q.sarlavha) as qator_soni,
   fayl_document_id
 from t2_narx_manba m where m.kompaniya_id is null and m.holat = 'faol';
revoke all on public.t2_platforma_narx_manba from anon, authenticated;
commit;
