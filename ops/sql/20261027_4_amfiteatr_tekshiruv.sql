-- 4/4: Amfiteatr tekshiruvi (faqat o'qish). Natija jadvalini Claude'ga yuboring.
select o.id, o.nom,
  (select sum(q.summa) from t2_qator q where q.obyekt_id = o.id and q.tur = 'rz')                                 as smeta_rz,
  (select sum(q.summa) from t2_qator q where q.obyekt_id = o.id and q.tur = 'rz' and coalesce(q.qoshimcha,false)) as qoshimcha_rz,
  (select count(*)     from t2_qator q where q.obyekt_id = o.id and q.tur = 'rz')                                 as razdel_soni
from t2_obyekt o
where (o.nom ilike '%amfi%' or o.nom ilike '%амфи%') and coalesce(o.holat,'') <> 'bekor';
