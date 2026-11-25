-- =====================================================================
--  منصة ابن حزم للتدريب على الاختبارات — قاعدة بيانات Supabase
--  شغّل هذا الملف مرة واحدة: Supabase → SQL Editor → New query → الصق → Run
--  الرموز الافتراضية بعد التثبيت: المعلمون 1234 · الإدارة 0000 (غيّرها فورًا من لوحة الإدارة)
--  الجداول مغلقة تمامًا أمام المتصفح؛ لا يمكن الوصول إليها إلا عبر دوال api_* التي تتحقق من الجلسة.
-- =====================================================================

create table if not exists ihz_settings (
  id int primary key default 1 check (id = 1),
  term text not null default 'Term 1',
  guest boolean not null default true,
  teacher_pin text not null,
  admin_pin text not null,
  salt text not null default md5(random()::text || clock_timestamp()::text)
);
create table if not exists ihz_students (
  id text primary key, grade int not null, track text not null, section text not null default ''
);
create table if not exists ihz_exams (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ihz_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null, exam_title text, subject text, term text,
  kind text not null, student_id text, guest_name text,
  grade int, track text, section text,
  answers jsonb not null default '{}', score numeric, total numeric, pct numeric, passed boolean,
  time_spent int, attempt_no int, submitted_at timestamptz not null default now()
);
create index if not exists ihz_attempts_exam on ihz_attempts(exam_id);
create index if not exists ihz_attempts_student on ihz_attempts(student_id);
create table if not exists ihz_sessions (
  token uuid primary key default gen_random_uuid(),
  role text not null, student_id text, name text, grade int, track text, section text,
  expires timestamptz not null
);
create table if not exists ihz_visits (id bigserial primary key, name text, grade int, track text, at timestamptz not null default now());
create table if not exists ihz_fails (k text primary key, n int not null default 0, at timestamptz not null default now());

alter table ihz_settings enable row level security;
alter table ihz_students enable row level security;
alter table ihz_exams enable row level security;
alter table ihz_attempts enable row level security;
alter table ihz_sessions enable row level security;
alter table ihz_visits enable row level security;
alter table ihz_fails enable row level security;
revoke all on ihz_settings, ihz_students, ihz_exams, ihz_attempts, ihz_sessions, ihz_visits, ihz_fails from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on ihz_settings, ihz_students, ihz_exams, ihz_attempts, ihz_sessions, ihz_visits, ihz_fails from anon, authenticated';
  end if;
end $$;

-- ------------------------------------------------------------------ helpers
create or replace function ihz_hash(p text) returns text language sql stable as $$
  select encode(sha256(convert_to((select salt from ihz_settings where id = 1) || ':' || coalesce(p, ''), 'UTF8')), 'hex');
$$;
insert into ihz_settings (id, teacher_pin, admin_pin) values (1, '', '') on conflict (id) do nothing;
update ihz_settings set teacher_pin = ihz_hash('1234') where teacher_pin = '';
update ihz_settings set admin_pin = ihz_hash('0000') where admin_pin = '';

create or replace function ihz_sess(p_token text, p_roles text[]) returns ihz_sessions language plpgsql as $$
declare s ihz_sessions;
begin
  begin
    select * into s from ihz_sessions where token = p_token::uuid and expires > now();
  exception when invalid_text_representation then s := null; end;
  if s.token is null then raise exception 'no_session'; end if;
  if p_roles is not null and not (s.role = any(p_roles)) then raise exception 'forbidden'; end if;
  return s;
end $$;

create or replace function ihz_total(e jsonb) returns numeric language sql immutable as $$
  select coalesce(sum(coalesce((q->>'marks')::numeric, 0)), 0) from jsonb_array_elements(e->'questions') q;
$$;
create or replace function ihz_strip(e jsonb) returns jsonb language sql immutable as $$
  select e || jsonb_build_object('total', ihz_total(e), 'questions',
    coalesce((select jsonb_agg(q - 'correct' - 'solution') from jsonb_array_elements(e->'questions') q), '[]'::jsonb));
$$;
create or replace function ihz_visible(e jsonb, s ihz_sessions, t text) returns boolean language sql stable as $$
  select coalesce((e->>'published')::boolean, false) and e->>'term' = t
     and (e->>'grade')::int = s.grade and e->>'track' = s.track
     and (s.role <> 'student' or jsonb_array_length(coalesce(e->'sections', '[]')) = 0 or (e->'sections') ? s.section);
$$;
create or replace function ihz_review(e jsonb, ans jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('qid', q->>'id', 'picked', ans->>(q->>'id'), 'correct', q->>'correct',
    'marks', coalesce((q->>'marks')::numeric, 0),
    'gained', case when ans->>(q->>'id') = q->>'correct' then coalesce((q->>'marks')::numeric, 0) else 0 end) order by o), '[]'::jsonb)
  from jsonb_array_elements(e->'questions') with ordinality as x(q, o);
$$;
create or replace function ihz_mine(a ihz_attempts, s ihz_sessions) returns boolean language sql immutable as $$
  select case when s.role = 'student' then a.student_id = s.student_id
              when s.role = 'guest' then a.kind = 'guest' and a.guest_name = s.name and a.grade = s.grade and a.track = s.track
              else true end;
$$;
create or replace function ihz_attempt_json(a ihz_attempts) returns jsonb language sql immutable as $$
  select to_jsonb(a) - 'answers';
$$;

-- ------------------------------------------------------------------ public
create or replace function api_settings() returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('term', term, 'guest', guest) from ihz_settings where id = 1;
$$;

create or replace function api_login(p_role text, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare st ihz_settings; s ihz_sessions; stu ihz_students; nm text; f ihz_fails; fk text;
begin
  select * into st from ihz_settings where id = 1;
  delete from ihz_sessions where expires < now();
  if p_role in ('teacher', 'admin') then
    fk := 'pin:' || p_role;
    select * into f from ihz_fails where ihz_fails.k = fk;
    if f.n >= 8 and f.at > now() - interval '1 minute' then raise exception 'locked'; end if;
    if ihz_hash(p->>'pin') <> (case when p_role = 'admin' then st.admin_pin else st.teacher_pin end) then
      insert into ihz_fails(k, n, at) values (fk, 1, now()) on conflict (k) do update set n = case when ihz_fails.at < now() - interval '1 minute' then 1 else ihz_fails.n + 1 end, at = now();
      raise exception 'bad_pin';
    end if;
    delete from ihz_fails where ihz_fails.k = fk;
    nm := btrim(coalesce(p->>'name', ''));
    if p_role = 'teacher' and length(nm) < 2 then raise exception 'name_required'; end if;
    insert into ihz_sessions(role, name, expires) values (p_role, case when p_role = 'admin' then 'الإدارة' else left(nm, 60) end, now() + interval '12 hours') returning * into s;
  elsif p_role = 'student' then
    select * into stu from ihz_students where id = upper(regexp_replace(coalesce(p->>'id', ''), '\s', '', 'g'));
    if stu.id is null then raise exception 'unknown_student'; end if;
    insert into ihz_sessions(role, student_id, grade, track, section, expires) values ('student', stu.id, stu.grade, stu.track, stu.section, now() + interval '60 days') returning * into s;
  elsif p_role = 'guest' then
    if not st.guest then raise exception 'guest_disabled'; end if;
    nm := regexp_replace(btrim(coalesce(p->>'name', '')), '\s+', ' ', 'g');
    if length(nm) < 2 or length(nm) > 40 or coalesce((p->>'grade')::int, 0) not between 5 and 12 or coalesce(p->>'track', '') not in ('General', 'Advanced') then raise exception 'bad_guest'; end if;
    insert into ihz_sessions(role, name, grade, track, expires) values ('guest', nm, (p->>'grade')::int, p->>'track', now() + interval '30 days') returning * into s;
    insert into ihz_visits(name, grade, track) values (nm, s.grade, s.track);
  else raise exception 'forbidden';
  end if;
  return jsonb_strip_nulls(jsonb_build_object('token', s.token, 'role', s.role, 'id', s.student_id, 'name', s.name, 'grade', s.grade, 'track', s.track, 'section', s.section));
end $$;

create or replace function api_logout(p_token text) returns void language sql security definer set search_path = public as $$
  delete from ihz_sessions where token::text = p_token;
$$;

-- ------------------------------------------------------------------ students & guests
create or replace function api_my_exams(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s ihz_sessions := ihz_sess(p_token, array['student', 'guest']); t text := (select term from ihz_settings where id = 1);
begin
  return coalesce((select jsonb_agg((ihz_strip(e.data) - 'questions') || jsonb_build_object('id', e.id, 'created_at', e.created_at,
      'qcount', jsonb_array_length(e.data->'questions'), 'attempts', x.n, 'best', x.best) order by e.created_at)
    from ihz_exams e
    left join lateral (select count(*) n, max(a.pct) best from ihz_attempts a where a.exam_id = e.id and ihz_mine(a, s)) x on true
    where ihz_visible(e.data, s, t)), '[]'::jsonb);
end $$;

create or replace function api_exam(p_token text, p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s ihz_sessions := ihz_sess(p_token, null); e ihz_exams;
begin
  select * into e from ihz_exams where id = p_id;
  if e.id is null then raise exception 'not_found'; end if;
  if s.role in ('teacher', 'admin') then return e.data || jsonb_build_object('id', e.id, 'created_at', e.created_at, 'updated_at', e.updated_at); end if;
  if not ihz_visible(e.data, s, (select term from ihz_settings where id = 1)) then raise exception 'not_found'; end if;
  return ihz_strip(e.data) || jsonb_build_object('id', e.id);
end $$;

create or replace function api_submit(p_token text, p_id uuid, p_answers jsonb, p_time int) returns jsonb language plpgsql security definer set search_path = public as $$
declare s ihz_sessions := ihz_sess(p_token, array['student', 'guest']); e ihz_exams; rv jsonb; sc numeric; tot numeric; pc numeric; a ihz_attempts; n int;
begin
  select * into e from ihz_exams where id = p_id;
  if e.id is null or not ihz_visible(e.data, s, (select term from ihz_settings where id = 1)) then raise exception 'not_found'; end if;
  rv := ihz_review(e.data, coalesce(p_answers, '{}'));
  select coalesce(sum((r->>'gained')::numeric), 0) into sc from jsonb_array_elements(rv) r;
  tot := ihz_total(e.data);
  pc := case when tot > 0 then round(sc / tot * 100, 1) else 0 end;
  select count(*) into n from ihz_attempts x where x.exam_id = e.id and ihz_mine(x, s);
  insert into ihz_attempts(exam_id, exam_title, subject, term, kind, student_id, guest_name, grade, track, section, answers, score, total, pct, passed, time_spent, attempt_no)
  values (e.id, e.data->>'title', e.data->>'subject', e.data->>'term', s.role, s.student_id, case when s.role = 'guest' then s.name end, s.grade, s.track, s.section,
          coalesce(p_answers, '{}'), sc, tot, pc, pc >= coalesce((e.data->>'passPct')::numeric, 50), greatest(0, coalesce(p_time, 0)), n + 1)
  returning * into a;
  return ihz_attempt_json(a) || jsonb_build_object('answers', a.answers, 'review', rv, 'exam', e.data || jsonb_build_object('id', e.id));
end $$;

create or replace function api_my_attempts(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s ihz_sessions := ihz_sess(p_token, array['student', 'guest']);
begin
  return coalesce((select jsonb_agg(ihz_attempt_json(a) order by a.submitted_at desc) from ihz_attempts a
    where ihz_mine(a, s) and a.term = (select term from ihz_settings where id = 1)), '[]'::jsonb);
end $$;

create or replace function api_attempt(p_token text, p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s ihz_sessions := ihz_sess(p_token, null); a ihz_attempts; e ihz_exams;
begin
  select * into a from ihz_attempts where id = p_id;
  if a.id is null then raise exception 'not_found'; end if;
  if not ihz_mine(a, s) then raise exception 'forbidden'; end if;
  select * into e from ihz_exams where id = a.exam_id;
  if e.id is null then raise exception 'not_found'; end if;
  return ihz_attempt_json(a) || jsonb_build_object('answers', a.answers, 'review', ihz_review(e.data, a.answers), 'exam', e.data || jsonb_build_object('id', e.id));
end $$;

-- ------------------------------------------------------------------ teachers & admin
create or replace function api_exams(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s ihz_sessions := ihz_sess(p_token, array['teacher', 'admin']);
begin
  return coalesce((select jsonb_agg((e.data - 'questions') || jsonb_build_object('id', e.id, 'created_at', e.created_at, 'updated_at', e.updated_at,
      'qcount', jsonb_array_length(e.data->'questions'), 'total', ihz_total(e.data), 'attempts', x.n, 'students', x.st))
    from ihz_exams e left join lateral (select count(*) n, count(distinct a.student_id) st from ihz_attempts a where a.exam_id = e.id and a.kind = 'student') x on true), '[]'::jsonb);
end $$;

create or replace function api_save_exam(p_token text, p_exam jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare s ihz_sessions := ihz_sess(p_token, array['teacher', 'admin']); d jsonb; i uuid;
begin
  if coalesce(btrim(p_exam->>'title'), '') = '' or p_exam->>'subject' is null or p_exam->>'grade' is null or jsonb_array_length(coalesce(p_exam->'questions', '[]')) = 0 then raise exception 'invalid_exam'; end if;
  d := p_exam - 'id' - 'created_at' - 'updated_at' - 'qcount' - 'total' - 'attempts' - 'students';
  if coalesce(d->>'teacher', '') = '' then d := d || jsonb_build_object('teacher', s.name); end if;
  if p_exam->>'id' is not null and exists (select 1 from ihz_exams where id = (p_exam->>'id')::uuid) then
    update ihz_exams set data = d, updated_at = now() where id = (p_exam->>'id')::uuid returning id into i;
  else
    insert into ihz_exams(data) values (d) returning id into i;
  end if;
  return i;
end $$;

create or replace function api_set_published(p_token text, p_id uuid, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['teacher', 'admin']);
  update ihz_exams set data = data || jsonb_build_object('published', p_on), updated_at = now() where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create or replace function api_delete_exam(p_token text, p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['teacher', 'admin']); delete from ihz_exams where id = p_id; end $$;

create or replace function api_results(p_token text, p_term text) returns jsonb language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['teacher', 'admin']);
  return coalesce((select jsonb_agg(ihz_attempt_json(a) order by a.submitted_at) from ihz_attempts a where a.kind = 'student' and (p_term is null or a.term = p_term)), '[]'::jsonb);
end $$;

create or replace function api_item_stats(p_token text, p_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare e ihz_exams;
begin perform ihz_sess(p_token, array['teacher', 'admin']);
  select * into e from ihz_exams where id = p_id; if e.id is null then raise exception 'not_found'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('qid', q->>'id', 'n', (select count(*) from ihz_attempts a where a.exam_id = p_id and a.kind = 'student'),
      'correct', (select count(*) from ihz_attempts a where a.exam_id = p_id and a.kind = 'student' and a.answers->>(q->>'id') = q->>'correct'),
      'counts', coalesce((select jsonb_object_agg(k, c) from (select coalesce(a.answers->>(q->>'id'), '-') k, count(*) c from ihz_attempts a where a.exam_id = p_id and a.kind = 'student' group by 1) z), '{}'::jsonb)) order by o)
    from jsonb_array_elements(e.data->'questions') with ordinality as x(q, o)), '[]'::jsonb);
end $$;

create or replace function api_roster(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['teacher', 'admin']);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.grade, x.section, x.id) from ihz_students x), '[]'::jsonb);
end $$;

create or replace function api_replace_roster(p_token text, p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; r int; n int;
begin perform ihz_sess(p_token, array['admin']);
  create temp table _new on commit drop as
    select distinct on (upper(regexp_replace(x->>'id', '\s', '', 'g'))) upper(regexp_replace(x->>'id', '\s', '', 'g')) id, (x->>'grade')::int grade, x->>'track' track, coalesce(x->>'section', '') section
    from jsonb_array_elements(p_rows) x where coalesce(x->>'id', '') <> '';
  select count(*) into a from _new where id not in (select id from ihz_students);
  select count(*) into r from ihz_students where id not in (select id from _new);
  delete from ihz_students where true;
  insert into ihz_students select * from _new;
  select count(*) into n from ihz_students;
  delete from ihz_sessions where role = 'student' and student_id not in (select id from ihz_students);
  return jsonb_build_object('n', n, 'added', a, 'removed', r);
end $$;

create or replace function api_set_term(p_token text, p_term text) returns void language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['admin']);
  if p_term not in ('Term 1', 'Term 2', 'Term 3') then raise exception 'forbidden'; end if;
  update ihz_settings set term = p_term where id = 1;
end $$;

create or replace function api_set_guest(p_token text, p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['admin']);
  update ihz_settings set guest = p_on where id = 1;
  if not p_on then delete from ihz_sessions where role = 'guest'; end if;
end $$;

create or replace function api_change_pin(p_token text, p_kind text, p_pin text) returns void language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['admin']);
  if p_pin !~ '^\d{4}$' then raise exception 'bad_pin_format'; end if;
  if p_kind = 'admin' then update ihz_settings set admin_pin = ihz_hash(p_pin) where id = 1;
  else update ihz_settings set teacher_pin = ihz_hash(p_pin) where id = 1; delete from ihz_sessions where role = 'teacher'; end if;
end $$;

create or replace function api_visitor_stats(p_token text) returns jsonb language plpgsql security definer set search_path = public as $$
begin perform ihz_sess(p_token, array['admin']);
  return jsonb_build_object('names', (select count(distinct name || grade || track) from ihz_visits), 'signins', (select count(*) from ihz_visits),
    'today', (select count(*) from ihz_visits where at > now() - interval '1 day'), 'week', (select count(*) from ihz_visits where at > now() - interval '7 days'),
    'practice', (select count(*) from ihz_attempts where kind = 'guest'));
end $$;

-- المتصفح يستدعي دوال api_* فقط
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'api\_%' or p.proname like 'ihz\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if f.proname like 'api\_%' then
      execute format('grant execute on function %s to public', f.sig);
    end if;
  end loop;
end $$;
