-- Rollback: 20261214900000 t2_arxiv_v1
-- Arxivlangan qatorlar oldingi holatiga qaytariladi (ma'lumot yo'qolmasin), keyin ko'rinish/RPC/jadval olib tashlanadi.
update t2_loyiha x set holat = a.oldingi_holat from t2_arxiv_yozuv a where a.tur = 'loyiha' and a.rid = x.id and x.holat = 'bekor';
update t2_shartnoma x set holat = a.oldingi_holat from t2_arxiv_yozuv a where a.tur = 'shartnoma' and a.rid = x.id and x.holat = 'bekor';
update t2_kontragent x set holat = a.oldingi_holat from t2_arxiv_yozuv a where a.tur = 'kontragent' and a.rid = x.id and x.holat = 'bekor';
update t2_aosr x set holat = a.oldingi_holat from t2_arxiv_yozuv a where a.tur = 'aosr' and a.rid = x.id and x.holat = 'bekor';
update t2_akt x set holat = a.oldingi_holat from t2_arxiv_yozuv a where a.tur = 'akt' and a.rid = x.id and x.holat = 'bekor';

create or replace view public.t2_korzinka as
 select t2_obyekt.id, t2_obyekt.nom as nomi, 't2_obyekt'::text as jadval, t2_obyekt.kompaniya_id, t2_obyekt.yangilandi as ochirilgan_vaqt
   from t2_obyekt where t2_obyekt.holat = 'bekor'
 union all
 select t2_shaxsiy_smeta.id, t2_shaxsiy_smeta.nom, 't2_shaxsiy_smeta'::text, t2_shaxsiy_smeta.kompaniya_id, t2_shaxsiy_smeta.yangilandi
   from t2_shaxsiy_smeta where t2_shaxsiy_smeta.holat = 'bekor'
 union all
 select t2_sklad_harakat.id, t2_sklad_harakat.nomi, 't2_sklad_harakat'::text, t2_sklad_harakat.kompaniya_id, t2_sklad_harakat.yaratildi
   from t2_sklad_harakat where t2_sklad_harakat.holat = 'bekor';

drop function if exists public.t2_arxivla_v1(bigint, text, bigint, uuid);
drop function if exists public.t2_arxivdan_tiklash_v1(bigint, text, bigint);
drop function if exists public.t2_arxiv_butunlay_v1(bigint, text, bigint);
drop table if exists public.t2_arxiv_yozuv;
