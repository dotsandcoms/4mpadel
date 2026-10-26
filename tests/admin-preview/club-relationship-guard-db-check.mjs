// Explicit offline acceptance test. Never reads DATABASE_URL or connects to an
// existing server: this script owns a fresh socket-only local Postgres cluster.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';

const directory=mkdtempSync(join(tmpdir(),'4m-club-relationship-'));
const dataDirectory=join(directory,'data'), port='55441';
const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',directory,'-p',port,'-U',userInfo().username,'-d','postgres'];
const run=(command,arguments_,input)=>{
  const result=spawnSync(command,arguments_,{input,encoding:'utf8',timeout:30000});
  if(result.status!==0)throw new Error(`${command}: ${result.stderr||result.stdout||result.error}`);
  return result.stdout.trim();
};
const sql=input=>run('psql',args,input);
const candidate=readFileSync(resolve('supabase/migrations/20261019075330_club_relationship_write_guards.sql'),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const as=(actor,statement,role='authenticated')=>`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${actor}',false); ${statement}`;
const check=(actor,statement)=>sql(as(actor,statement)).split('\n').at(-1);
let started=false;
try {
  run('initdb',['-D',dataDirectory,'-A','trust','--no-locale','-E','UTF8']);
  run('pg_ctl',['-D',dataDirectory,'-l',join(directory,'server.log'),'-o',`-F -k ${directory} -h '' -p ${port}`,'-w','start']);started=true;
  sql(`
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.admin_sidebar_permissions(email text PRIMARY KEY,role text,allowed_tabs text[]);
    CREATE FUNCTION public.is_super_admin(user_email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
      SELECT EXISTS(SELECT 1 FROM public.admin_sidebar_permissions p WHERE lower(p.email)=lower(user_email) AND role='super_admin');
    $$;
    CREATE TABLE public.club_groups(id integer PRIMARY KEY,name text);
    CREATE TABLE public.club_organisations(id integer PRIMARY KEY,club_id uuid,organisation_id uuid);
    ALTER TABLE public.club_groups ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.club_organisations ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.club_groups,public.club_organisations TO anon,authenticated;
    CREATE POLICY "Public read club groups" ON public.club_groups FOR SELECT USING(true);
    CREATE POLICY "Public read club organisations" ON public.club_organisations FOR SELECT USING(true);
    CREATE POLICY "Authenticated manage club groups" ON public.club_groups FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY "Authenticated manage club organisations" ON public.club_organisations FOR ALL TO authenticated USING(true) WITH CHECK(true);
    INSERT INTO auth.users VALUES
      ('${id(1)}','super@example.test',NULL),('${id(2)}','clubs@example.test',NULL),
      ('${id(3)}','outsider@example.test',NULL),('${id(4)}','deleted@example.test',now()),
      ('${id(5)}','wild%card@example.test',NULL),('${id(6)}','ambiguous@example.test',NULL),
      ('${id(7)}','empty@example.test',NULL);
    INSERT INTO public.admin_sidebar_permissions VALUES
      ('super@example.test','super_admin',NULL),('clubs@example.test','custom',ARRAY['clubs']),
      ('deleted@example.test','super_admin',NULL),('wildXcard@example.test','custom',ARRAY['clubs']),
      ('ambiguous@example.test','custom',ARRAY['clubs']),('AMBIGUOUS@example.test','custom',ARRAY['clubs']),
      ('empty@example.test','custom',ARRAY[]::text[]);
    INSERT INTO public.club_groups VALUES(1,'Public brand');
    INSERT INTO public.club_organisations VALUES(1,'${id(11)}','${id(12)}');
  `);
  // Reproduce current production policy flaw, without copying real club data.
  assert.equal(check(id(3),"WITH changed AS(UPDATE public.club_groups SET name='Outsider wrote' WHERE id=1 RETURNING id) SELECT count(*) FROM changed;"),'1');
  assert.equal(check(id(3),"WITH changed AS(UPDATE public.club_organisations SET organisation_id='"+id(13)+"' WHERE id=1 RETURNING id) SELECT count(*) FROM changed;"),'1');
  sql('ALTER POLICY "Authenticated manage club groups" ON public.club_groups USING(false);');
  const drift=spawnSync('psql',args,{input:candidate,encoding:'utf8',timeout:10000});
  assert.notEqual(drift.status,0);assert.match(drift.stderr,/Unexpected write-policy contract/);
  assert.equal(sql("SELECT count(*) FROM pg_namespace WHERE nspname='club_relationship_guard';"),'0','drift failure rolls back installation');
  sql('ALTER POLICY "Authenticated manage club groups" ON public.club_groups USING(true);');
  sql(candidate);
  assert.equal(sql("SET ROLE anon; SELECT count(*) FROM public.club_groups;"),'1');
  assert.equal(sql("SET ROLE anon; SELECT count(*) FROM public.club_organisations;"),'1');
  for(const actor of [id(1),id(2)]) {
    assert.equal(check(actor,"SELECT club_relationship_guard.platform_manager();"),'t');
    for(const table of ['club_groups','club_organisations']) {
      const values=table==='club_groups'?"2,'Authorised'":`2,'${id(11)}','${id(14)}'`;
      assert.equal(check(actor,`WITH changed AS(INSERT INTO public.${table} VALUES(${values}) RETURNING id) SELECT count(*) FROM changed;`),'1');
      assert.equal(check(actor,`WITH changed AS(UPDATE public.${table} SET id=3 WHERE id=2 RETURNING id) SELECT count(*) FROM changed;`),'1');
      assert.equal(check(actor,`WITH changed AS(DELETE FROM public.${table} WHERE id=3 RETURNING id) SELECT count(*) FROM changed;`),'1');
    }
  }
  for(const actor of [id(3),id(4),id(5),id(6),id(7),id(99),'']) {
    assert.equal(check(actor,'SELECT club_relationship_guard.platform_manager();'),'f');
    for(const table of ['club_groups','club_organisations']) {
      assert.equal(check(actor,`WITH changed AS(UPDATE public.${table} SET id=9 WHERE id=1 RETURNING id) SELECT count(*) FROM changed;`),'0');
      assert.equal(check(actor,`WITH changed AS(DELETE FROM public.${table} WHERE id=1 RETURNING id) SELECT count(*) FROM changed;`),'0');
      const values=table==='club_groups'?"9,'Denied'":`9,'${id(11)}','${id(14)}'`;
      const result=spawnSync('psql',args,{input:as(actor,`INSERT INTO public.${table} VALUES(${values});`),encoding:'utf8',timeout:10000});
      assert.notEqual(result.status,0);assert.match(result.stderr,/row-level security/);
    }
  }
  // A spoofed email claim must not override the actual auth.users identity.
  assert.equal(check(id(3),"SELECT set_config('request.jwt.claim.email','super@example.test',false); SELECT club_relationship_guard.platform_manager();"),'f');
  sql("DELETE FROM public.admin_sidebar_permissions WHERE email='clubs@example.test';");
  assert.equal(check(id(2),'SELECT club_relationship_guard.platform_manager();'),'f','revoked grants take effect');
  assert.equal(sql('SELECT count(*) FROM public.club_groups;'),'1');
  assert.equal(sql('SELECT count(*) FROM public.club_organisations;'),'1');
  // Restrictive guards cannot be bypassed by another permissive true policy.
  sql('CREATE POLICY synthetic_broad ON public.club_groups FOR ALL TO authenticated USING(true) WITH CHECK(true);');
  assert.equal(check(id(3),'WITH changed AS(DELETE FROM public.club_groups RETURNING id) SELECT count(*) FROM changed;'),'0');
  console.log('PASS: reproduced broad writes; super/direct Clubs grant CRUD, public reads, outsider/deleted/missing/empty/wildcard/ambiguous denial, spoofed email, revoked grants and permissive-policy composition verified.');
  console.log(`Local ${run('postgres',['--version'])}; shared databases untouched. Temporary files retained at ${directory}`);
} finally { if(started)run('pg_ctl',['-D',dataDirectory,'-m','fast','-w','stop']); }
