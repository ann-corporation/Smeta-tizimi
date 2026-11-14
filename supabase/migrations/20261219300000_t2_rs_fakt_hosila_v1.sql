-- RS fakti hosila (norma NULL RS va rz-ostidagi foizli RS) — bitta qoida, t2_qator_holat va 3 o'lchov funksiyasida bir xil.
--
-- Sabab: RS fakti faqat (a) F-2 nusxasi (DIRECT, narx_manba='f2_sertifikat') yoki (b) ota BL fakti x norma (BL_NORMA).
-- norma NULL bo'lgan RS (masalan «ZATRATI TRUDA MASTEROV») va ota-si bo'lim (rz) bo'lgan foizli RS (transport 5 %)
-- uchun hosila bo'lmagani sababli ota to'liq bajarilganda ham RS fakti 0 qolardi. Bundan tashqari bekor qilingan F-2 dan
-- ko'chirilgan eskirgan fakt nusxasi (narx_manba='f2_sertifikat', narx_manba_id -> bekor F-2) to'liq bajarilgan holatda ham
-- eski hajmda qotib qolardi.
--
-- Qoida (yangi yordamchi _t2_rs_hosila_v1(qator_id), faqat tur='rs'):
--  1) ota BL, norma NULL: hajm = RS smeta hajmi x (BL fakt hajmi, f2_sertifikat nusxasisiz) / BL smeta hajmi.
--  2) ota rz (foizli transport): hajm = RS smeta hajmi x (bo'lim MAT fakt summasi, f2_sertifikatsiz) / (bo'lim MAT smeta summasi).
--  3) Eskirgan nusxa: norma NULL RS ning barcha faol fakt qatorlari bekor F-2 dan ko'chirilgan nusxa bo'lsa — hosila ustun.
--  Qo'lda/boshqa DIRECT fakti bor RS, F-2 nusxasi (tasdiqlangan F-2 ga ishora) va norma NOT NULL + ota BL (eski BL_NORMA)
--  o'zgarmaydi. Hosila 0 bo'lsa (BL fakti yo'q) — avvalgi DIRECT yo'li (eskirgan nusxa bundan mustasno: u 0 ga tushadi).
-- Natija fakt_manbasi='BL_NORMA' (hosila). Hisob-kitob F-2 narxida qayta baholash (_t2_f2_narxda_v1) avvalgidek ishlaydi.
--
-- Yamoq: mavjud ta'rif pg_get_functiondef/pg_get_viewdef dan olinib matn bo'yicha o'zgartiriladi (har almashtirish
-- tekshiriladi — kutilgan joy topilmasa migratsiya to'xtaydi). Teskari: .rollback.sql.

create or replace function public._t2_rs_hosila_v1(p_qator_id bigint)
 returns table(hajm numeric, stale boolean)
 language sql
 stable
as $f$
 select case when c.stale then c.h else nullif(c.h, 0::numeric) end as hajm,
        coalesce(c.stale and c.h is not null, false) as stale
   from public.t2_qator q
   left join public.t2_qator p on p.id = q.ota_id and p.obyekt_id = q.obyekt_id
   cross join lateral (
     select x.h,
            case when q.tur = 'rs' and q.norma is null and x.h is not null then
              exists (select 1 from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.tur = 'fakt' and a.holat <> 'bekor'
                       where aq.qator_id = q.id)
              and not exists (select 1 from public.t2_akt_qator aq join public.t2_akt a on a.id = aq.akt_id and a.tur = 'fakt' and a.holat <> 'bekor'
                               where aq.qator_id = q.id
                                 and not (aq.narx_manba = 'f2_sertifikat'
                                          and exists (select 1 from public.t2_akt sa where sa.id = aq.narx_manba_id and sa.tur = 'f2' and sa.holat = 'bekor')))
            else false end as stale
       from (select case
               when q.tur <> 'rs' or q.hajm is null or q.versiya_holat = 'almashtirilgan' then null::numeric
               when p.tur = 'bl' and q.norma is null then
                 case when p.hajm is not null and p.hajm <> 0 then
                   q.hajm * coalesce((select sum(paq.hajm) filter (where paq.narx_manba is distinct from 'f2_sertifikat')
                                        from public.t2_akt_qator paq join public.t2_akt pa on pa.id = paq.akt_id and pa.tur = 'fakt' and pa.holat <> 'bekor'
                                       where paq.qator_id = p.id), 0::numeric) / p.hajm
                 end
               when p.tur = 'rz' then
                 case when coalesce((select sum(m.summa) from public.t2_qator m
                                      where m.ota_id = p.id and m.tur = 'mat' and m.versiya_holat is distinct from 'almashtirilgan'), 0::numeric) <> 0 then
                   q.hajm * coalesce((select sum(paq.summa) filter (where paq.narx_manba is distinct from 'f2_sertifikat')
                                        from public.t2_qator m
                                        join public.t2_akt_qator paq on paq.qator_id = m.id
                                        join public.t2_akt pa on pa.id = paq.akt_id and pa.tur = 'fakt' and pa.holat <> 'bekor'
                                       where m.ota_id = p.id and m.tur = 'mat' and m.versiya_holat is distinct from 'almashtirilgan'), 0::numeric)
                         / (select sum(m.summa) from public.t2_qator m
                             where m.ota_id = p.id and m.tur = 'mat' and m.versiya_holat is distinct from 'almashtirilgan')
                 end
             end as h) x
   ) c
  where q.id = p_qator_id
$f$;

revoke all on function public._t2_rs_hosila_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_rs_hosila_v1(bigint) to service_role;

do $migr$
declare
  v_frag constant text := ' LEFT JOIN LATERAL (SELECT h0.hajm, h0.stale FROM public._t2_rs_hosila_v1(q.id) h0 WHERE q.tur = ''rs'' AND (q.norma IS NULL OR EXISTS (SELECT 1 FROM public.t2_qator p0 WHERE p0.id = q.ota_id AND p0.tur = ''rz''))) hs ON true';
  v_cond_new constant text := '((bl.bl_soni > 0) OR (hs.hajm IS NOT NULL)) AND ((d.direct_fakt_hajm = (0)::numeric) OR COALESCE(hs.stale, false))';
  v_norma_old constant text := '(bl.fakt_hajm - bl.f2s_hajm) * q.norma';
  v_norma_new constant text := 'COALESCE(hs.hajm, (bl.fakt_hajm - bl.f2s_hajm) * q.norma)';
  r record; v_def text; v_n int; v_cnt int;
begin
  -- 3 funksiya: ta'rif matni bo'yicha yamoq.
  for r in select unnest(array['_t2_fakt_olchov_v1','_t2_qator_holat_v2','_t2_ortiqcha_olchov_v1']) as fn loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = to_regprocedure('public.' || r.fn || '(bigint[])');
    if v_def is null then raise exception 'YAMOQ: % topilmadi', r.fn; end if;
    if position('_t2_rs_hosila_v1' in v_def) > 0 then continue; end if;
    -- shart: ((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))
    v_cnt := (length(v_def) - length(replace(v_def, '((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))', ''))) / length('((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))');
    if v_cnt < 1 then raise exception 'YAMOQ: % da shart topilmadi', r.fn; end if;
    v_def := replace(v_def, '((bl.bl_soni > 0) AND (d.direct_fakt_hajm = (0)::numeric))', '(' || v_cond_new || ')');
    v_cnt := (length(v_def) - length(replace(v_def, v_norma_old, ''))) / length(v_norma_old);
    if v_cnt < 1 then raise exception 'YAMOQ: % da norma ifodasi topilmadi', r.fn; end if;
    v_def := replace(v_def, v_norma_old, v_norma_new);
    select count(*) into v_n from regexp_matches(v_def, 'FROM public\.t2_qator q\s', 'g');
    if v_n <> 1 then raise exception 'YAMOQ: % da FROM t2_qator q % marta (kutilgan 1)', r.fn, v_n; end if;
    v_def := regexp_replace(v_def, '(FROM public\.t2_qator q)(\s)', '\1' || replace(v_frag, '\', '\\') || '\2');
    execute v_def;
  end loop;

  -- view: pretty ko'rinish.
  v_def := pg_get_viewdef('public.t2_qator_holat'::regclass, true);
  if position('_t2_rs_hosila_v1' in v_def) = 0 then
    v_cnt := (length(v_def) - length(replace(v_def, 'bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric', ''))) / length('bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric');
    if v_cnt < 1 then raise exception 'YAMOQ: view da shart topilmadi'; end if;
    v_def := replace(v_def, 'bl.bl_soni > 0 AND d.direct_fakt_hajm = 0::numeric', v_cond_new);
    v_cnt := (length(v_def) - length(replace(v_def, v_norma_old, ''))) / length(v_norma_old);
    if v_cnt < 1 then raise exception 'YAMOQ: view da norma ifodasi topilmadi'; end if;
    v_def := replace(v_def, v_norma_old, v_norma_new);
    select count(*) into v_n from regexp_matches(v_def, 'FROM (public\.)?t2_qator q\s', 'g');
    if v_n <> 1 then raise exception 'YAMOQ: view da FROM t2_qator q % marta (kutilgan 1)', v_n; end if;
    v_def := regexp_replace(v_def, '(FROM (?:public\.)?t2_qator q)(\s)', '\1' || replace(v_frag, '\', '\\') || '\2');
    execute 'CREATE OR REPLACE VIEW public.t2_qator_holat AS ' || v_def;
  end if;
end
$migr$;
