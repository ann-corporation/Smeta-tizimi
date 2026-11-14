-- T2-IMZO-BIRLASHGAN-PAROL-V1: shaxsiy imzo kaliti yaratishda birlashtirilgan hisob parolini qabul qilish.
--
-- Muammo: kirish (t2_parol_tekshir_v1) birlashtirilgan hisob (holat='birlashtirildi', birlashgan_id = asosiy) parolini qabul qilib,
-- sessiyani ASOSIY hisobga beradi. Lekin t2_imzo_kalit_yarat_v1 parolni faqat asosiy hisobning o'z parol_hash'i bilan solishtiradi
-- -> birlashtirilgan hisob paroli bilan kirgan foydalanuvchi kalit yaratganda doim PAROL_XATO oladi.
--
-- Yechim: parol asosiy hisobning o'z parol_hash'iga YOKI birlashgan_id = p_actor_id va holat = 'birlashtirildi' bo'lgan istalgan
-- hisobning parol_hash'iga mos kelsa qabul qilinadi. Qolgan hamma qoida (parolsiz hisob -> p_yangi_kirish, qurilma/kalit/limit
-- tekshiruvlari, audit, security definer, search_path, grantlar) O'ZGARMAS. Parol tekshiradigan boshqa imzo funksiyasi yo'q
-- (kalit_bekor / imzo_yoz / manba parol so'ramaydi) - faqat t2_imzo_kalit_yarat_v1 o'zgaradi.
-- Migratsiyani EGASI qo'llaydi. Rollback: .rollback.sql. Qabul: .acceptance.sql.
begin;

create or replace function public.t2_imzo_kalit_yarat_v1(p_actor_id bigint, p_qurilma text, p_ochiq_kalit text, p_parol text, p_yangi_kirish boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_u public.t2_foydalanuvchi%rowtype; v_id uuid; v_n int; v_parol_ok boolean;
begin
  if p_actor_id is null then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  select * into v_u from public.t2_foydalanuvchi where id = p_actor_id and holat = 'faol' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ACTOR_NOT_FOUND'); end if;
  if v_u.parol_hash is not null then
    v_parol_ok := coalesce(p_parol, '') <> '' and (
      v_u.parol_hash = extensions.crypt(p_parol, v_u.parol_hash)
      or exists (
        select 1 from public.t2_foydalanuvchi m
         where m.birlashgan_id = p_actor_id and m.holat = 'birlashtirildi' and m.parol_hash is not null
           and m.parol_hash = extensions.crypt(p_parol, m.parol_hash)));
    if not v_parol_ok then
      return jsonb_build_object('ok', false, 'code', 'PAROL_XATO');
    end if;
  elsif p_yangi_kirish is not true then
    return jsonb_build_object('ok', false, 'code', 'QAYTA_KIRISH_KERAK');
  end if;
  if length(btrim(coalesce(p_qurilma, ''))) not between 1 and 80 then return jsonb_build_object('ok', false, 'code', 'QURILMA_NOTOGRI'); end if;
  if p_ochiq_kalit is null or p_ochiq_kalit !~ '^[A-Za-z0-9_-]{87}$' then return jsonb_build_object('ok', false, 'code', 'KALIT_NOTOGRI'); end if;
  select count(*) into v_n from public.t2_imzo_kalit where foydalanuvchi_id = p_actor_id and bekor_vaqt is null;
  if v_n >= 5 then return jsonb_build_object('ok', false, 'code', 'KALIT_LIMIT'); end if;
  begin
    insert into public.t2_imzo_kalit (foydalanuvchi_id, qurilma, ochiq_kalit) values (p_actor_id, btrim(p_qurilma), p_ochiq_kalit) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'KALIT_BAND');
  end;
  perform public._t2_profil_audit(p_actor_id, 'imzo_kalit_yaratildi', 'kalit=' || v_id::text || '; qurilma=' || btrim(p_qurilma));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.t2_imzo_kalit_yarat_v1(bigint, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.t2_imzo_kalit_yarat_v1(bigint, text, text, text, boolean) to service_role;
comment on function public.t2_imzo_kalit_yarat_v1(bigint, text, text, text, boolean) is 'versiya: texnik. Imzo kaliti yaratish: parol asosiy yoki birlashtirilgan hisob parolidan biriga mos bo''lishi kerak.';

commit;
