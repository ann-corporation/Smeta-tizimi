-- 20261217500000 - Laboratoriya natijasini faol granti bor tomonlar (texnadzor, buyurtmachi) O'QIY oladi; yozolmaydi.
-- Tomonlararo zanjir auditi (UZILISH [4]): t2_lab_sorov_tafsilot_v1/royxat faqat so'rov yuborgan kompaniya va laboratoriyaga ochiq edi,
-- texnadzor va buyurtmachi natijani ko'ra olmasdi (AOSR/hujjat grantlari ham natijani ochmasdi).
-- Mavjud grant mexanizmi ishlatiladi (parallel ruxsat yo'li YO'Q): yangi resurs `lab_natija` [korish] (t2_tomon_resurs), grant shablonlari,
-- ko'rish t2_tomon_ruxsat_bor(oluvchi, beruvchi, 'lab_natija', 'korish', obyekt) orqali: faol aloqa + faol grant + shu obyekt.
-- Yozuv yo'q: natijani faqat laboratoriya (t2_lab_sorov_natija_v1) yozadi, bu migratsiya uni o'zgartirmaydi.
-- Pul/hisob maydonlari (summa, invoys, qarz) uchinchi tomonga BERILMAYDI.
-- Outbox: laboratoriya hodisalari allaqachon t2_tomon_hodisa trigger'i orqali outbox'ga yoziladi (qarshi tomonga); granti bor uchinchi tomonlarga
-- natija haqida xabar trigger bilan qo'shiladi (mavzu 'lab.natija'). Faqat additiv. Mavjud grantlar AVTOMATIK kengaytirilmaydi (egasi har aloqada ochadi).

insert into public.t2_tomon_resurs (kalit, nom, nom_ru, guruh, amallar, taqdim_mumkin, faol, tartib, izoh)
values ('lab_natija', 'Laboratoriya natijalari', U&'\0420\0435\0437\0443\043B\044C\0442\0430\0442\044B \0438\0441\043F\044B\0442\0430\043D\0438\0439', 'nazorat', array['korish'], false, true, 55,
        'Laboratoriya sinov natijasi (marka/sinf, mustahkamlik, xulosa) — faqat o''qish; summa va hisob ko''rsatilmaydi.')
on conflict (kalit) do nothing;

insert into public.t2_tomon_grant_shablon (aloqa_turi, qabul_rol, resurs, amallar, faol, tartib)
select x.t, x.r, 'lab_natija', array['korish'], true, 60
  from (values ('nazorat', 'texnadzor'), ('nazorat', 'inspeksiya'), ('shartnoma', 'buyurtmachi')) x(t, r)
 where not exists (select 1 from public.t2_tomon_grant_shablon s where s.aloqa_turi = x.t and s.qabul_rol = x.r and s.resurs = 'lab_natija');

create or replace function public.t2_lab_natija_royxat_v1(p_actor_id bigint, p_kompaniya_id bigint, p_obyekt_id bigint default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
declare v jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select coalesce(jsonb_agg(z.x order by z.mid desc), '[]'::jsonb) into v
    from (select m.id as mid, jsonb_build_object('id', m.id, 'kompaniya_id', s.kompaniya_id, 'sinov_turi', s.sinov_turi, 'sinov_nom', t.nom, 'holat', m.holat,
                   'natija', s.natija, 'protokol_raqam', s.protokol_raqam, 'protokol_sana', s.protokol_sana, 'xulosa', s.xulosa, 'maydon', s.maydon,
                   'obyekt_id', s.obyekt_id, 'obyekt_nom', o.nom, 'konstruksiya', s.konstruksiya, 'qayta_sinov', s.asl_sorov_id is not null) as x
            from public.t2_lab_sinov_sorov s
            join public.t2_tomon_murojaat m on m.id = s.murojaat_id
            join public.t2_lab_sinov_turi t on t.kalit = s.sinov_turi
            join public.t2_obyekt o on o.id = s.obyekt_id
           where s.natija is not null and s.kompaniya_id <> p_kompaniya_id and s.lab_kompaniya_id <> p_kompaniya_id
             and (p_obyekt_id is null or s.obyekt_id = p_obyekt_id)
             and exists (select 1 from public.t2_tomon_grant g where g.oluvchi_kompaniya_id = p_kompaniya_id and g.beruvchi_kompaniya_id = s.kompaniya_id
                          and g.resurs = 'lab_natija' and g.holat = 'faol')
             and public.t2_tomon_ruxsat_bor(p_kompaniya_id, s.kompaniya_id, 'lab_natija', 'korish', s.obyekt_id)
           order by m.id desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) z;
  return v;
end $fn$;

create or replace function public.t2_lab_natija_tafsilot_v1(p_actor_id bigint, p_kompaniya_id bigint, p_murojaat_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $fn$
declare r jsonb;
begin
  perform public._t2_tomon_azo(p_actor_id, p_kompaniya_id, 'korish');
  select e into r from jsonb_array_elements(public.t2_lab_natija_royxat_v1(p_actor_id, p_kompaniya_id, null, 300)) e where (e->>'id')::bigint = p_murojaat_id limit 1;
  if r is null then return jsonb_build_object('ok', false, 'code', 'TOPILMADI', 'error', 'Natija topilmadi yoki sizga ochilmagan'); end if;
  return jsonb_build_object('ok', true, 'natija', r);
end $fn$;

-- Natija yozilganda granti bor uchinchi tomonlarga xabar (laboratoriya va pudratchi trigger orqali allaqachon oladi).
create or replace function public._t2_lab_natija_outbox()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
declare v_oluvchilar bigint[];
begin
  begin
    select coalesce(array_agg(distinct g.oluvchi_kompaniya_id), '{}'::bigint[]) into v_oluvchilar
      from public.t2_tomon_grant g
     where g.beruvchi_kompaniya_id = new.kompaniya_id and g.resurs = 'lab_natija' and g.holat = 'faol'
       and g.oluvchi_kompaniya_id <> new.lab_kompaniya_id and public.t2_tomon_ruxsat_bor(g.oluvchi_kompaniya_id, new.kompaniya_id, 'lab_natija', 'korish', new.obyekt_id);
    if cardinality(v_oluvchilar) > 0 then
      perform public.t2_outbox_yoz(new.kompaniya_id, 'lab.natija', 't2_lab_sinov_sorov', new.murojaat_id,
        jsonb_build_object('murojaat_id', new.murojaat_id, 'natija', new.natija, 'sinov_turi', new.sinov_turi, 'obyekt_id', new.obyekt_id),
        null, null, new.obyekt_id, null, v_oluvchilar, '{}'::bigint[]);
    end if;
  exception when others then
    raise warning 'T2_OUTBOX: lab natijasi % outbox ga yozilmadi: %', new.murojaat_id, sqlerrm;
  end;
  return new;
end $fn$;

drop trigger if exists t2_lab_natija_outbox_trg on public.t2_lab_sinov_sorov;
create trigger t2_lab_natija_outbox_trg after update on public.t2_lab_sinov_sorov
  for each row when (new.natija is not null and (old.natija is distinct from new.natija or old.protokol_raqam is distinct from new.protokol_raqam))
  execute function public._t2_lab_natija_outbox();

revoke all on function public.t2_lab_natija_royxat_v1(bigint, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.t2_lab_natija_tafsilot_v1(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public._t2_lab_natija_outbox() from public, anon, authenticated;
grant execute on function public.t2_lab_natija_royxat_v1(bigint, bigint, bigint, integer) to service_role;
grant execute on function public.t2_lab_natija_tafsilot_v1(bigint, bigint, bigint) to service_role;
