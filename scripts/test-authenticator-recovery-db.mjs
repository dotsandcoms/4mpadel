import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'4m-authenticator-recovery-')),data=join(directory,'data'),log=join(directory,'postgres.log');
const connection=['-h','/private/tmp','-p','55448'];
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let started=false;
try {
 run('initdb',['-D',data,'-A','trust','--no-instructions','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-l',log,'-o',"-k /private/tmp -h '' -p 55448",'-w','start']);started=true;
 run('createdb',[...connection,'fourm_authenticator_recovery_test']);
 const output=run('psql',['-X','-q','-v','ON_ERROR_STOP=1',...connection,'-d','fourm_authenticator_recovery_test','-f',resolve('tests/fixtures/authenticator-recovery.sql')]);
 console.log(output.trim().split('\n').at(-1));
 // The access verifier creates roles itself, so remove the fixture's temporary
 // roles before checking the complete migration inventory on an empty database.
 run('dropdb',[...connection,'fourm_authenticator_recovery_test']);
 run('psql',['-X','-q',...connection,'-d','postgres','-c','DROP ROLE anon, authenticated, service_role']);
 run('createdb',[...connection,'fourm_data_api_grant_test']);
 console.log(execFileSync('npm',['run','test:data-api:db'],{encoding:'utf8',env:{...process.env,PGHOST:'/private/tmp',PGPORT:'55448'}}).trim().split('\n').at(-1));
} catch(error) { console.error(error.stderr?.toString()||error.message);if(!started){try{console.error(readFileSync(log,'utf8'));}catch{}}process.exitCode=1; }
finally { if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);rmSync(directory,{recursive:true,force:true}); }
