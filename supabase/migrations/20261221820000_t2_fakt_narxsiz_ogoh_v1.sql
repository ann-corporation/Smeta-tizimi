-- T2-FAKT-NARXSIZ-OGOH-V1 (egasi qoidasi: narxsiz qator faqat o'zi bo'sh + bildirishnoma; narx 0 = 0).
--
-- Muammo: narxi NULL bo'lgan qatorga fakt yozilganda jim o'tadi (prodda ~759 qator faktda, narxsiz): summa bo'sh qoladi, lekin
-- foydalanuvchi/AI bilmaydi. t2_akt_yarat javobida umumiy `narxsiz` soni bor, lekin t2_fakt_yoz_v2 uni qator ro'yxati va aniq
-- xabarsiz qaytaradi (MCP fakt_yoz esa umuman tashlab yuboradi).
--
-- Yechim (additiv; yozuv mantig'i O'ZGARMAYDI — BLOKLAMAYDI): yordamchi _t2_fakt_narxsiz_ogoh_v1(akt_id) — shu hujjatning narxsiz
-- qatorlari (summa bo'sh, hajm ≠ 0). «Narxsiz» ta'rifi yadro (_t2_summa_agg_v1) bilan bir xil: rz/bl qatorlar sanalmaydi
-- (BL puli RS hosilasidan), narx = 0 narxsiz EMAS (0 = 0). t2_fakt_yoz_v2 javobiga `narxsiz_soni`, `narxsiz_qatorlar` (<= 50),
-- `narxsiz_ogohlantirish` qo'shiladi (faqat narxsiz qator bo'lsa). Boshqa hamma javob kalitlari avvalgidek.
-- t2_fakt_yoz_v2 tanasi prod ta'rifidan (pg_get_functiondef) olinadi, faqat oxirgi return o'zgaradi; anchor topilmasa — xato (drift himoyasi).
-- Migratsiyani EGASI qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.
begin;

create or replace function public._t2_fakt_narxsiz_ogoh_v1(p_akt_id bigint)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with n as (
    select aq.qator_id, q.kod, q.nom
      from public.t2_akt_qator aq
      join public.t2_qator q on q.id = aq.qator_id
     where p_akt_id is not null
       and aq.akt_id = p_akt_id
       and q.tur not in ('rz', 'bl')
       and coalesce(aq.certified_amount, aq.summa) is null
       and coalesce(aq.certified_quantity, aq.hajm, 0) <> 0
  )
  select case when (select count(*) from n) = 0 then '{}'::jsonb
              else jsonb_build_object(
                'narxsiz_soni', (select count(*) from n),
                'narxsiz_qatorlar', (select jsonb_agg(jsonb_build_object('qator_id', t.qator_id, 'kod', t.kod, 'nom', left(t.nom, 80)) order by t.qator_id)
                                       from (select * from n order by qator_id limit 50) t),
                'narxsiz_ogohlantirish', 'narxsiz qator: summa bo''sh, narx_tuzat bilan narx qo''ying')
         end;
$$;
revoke all on function public._t2_fakt_narxsiz_ogoh_v1(bigint) from public, anon, authenticated;
grant execute on function public._t2_fakt_narxsiz_ogoh_v1(bigint) to service_role;
comment on function public._t2_fakt_narxsiz_ogoh_v1(bigint) is 'versiya: texnik. Fakt hujjatidagi narxsiz (summa bo''sh) qatorlar — faqat ogohlantirish, yozuvni bloklamaydi.';

do $m$
declare
  v_def text := pg_get_functiondef('public.t2_fakt_yoz_v2(bigint,date,jsonb,bigint,uuid,text,text,text)'::regprocedure);
  v_eski constant text := $a$jsonb_build_object('contract','FAKT_V2','actor_id',p_actor_id,'entry_policy','BL_MAT_OB_RS_F2_COPY');$a$;
  v_yangi constant text := $a$jsonb_build_object('contract','FAKT_V2','actor_id',p_actor_id,'entry_policy','BL_MAT_OB_RS_F2_COPY')
    || public._t2_fakt_narxsiz_ogoh_v1(case when (v_result->>'akt_id') ~ '^[0-9]+$' then (v_result->>'akt_id')::bigint end);$a$;
begin
  if position('_t2_fakt_narxsiz_ogoh_v1' in v_def) > 0 then return; end if;  -- allaqachon qo'llangan
  if position(v_eski in v_def) = 0 then raise exception 'T2_FAKT_NARXSIZ_OGOH: t2_fakt_yoz_v2 oxirgi return anchor topilmadi (ta''rif o''zgargan)'; end if;
  execute replace(v_def, v_eski, v_yangi);
end $m$;

commit;
