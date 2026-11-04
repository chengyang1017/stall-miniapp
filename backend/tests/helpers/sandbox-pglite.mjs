// Executes repository SQL on local WASM PostgreSQL, not a Neon/Stripe integration.
import {PGlite} from '@electric-sql/pglite'
import {readFileSync,readdirSync} from 'node:fs'
export async function sandboxDatabase(dataDir){
 const pg=await PGlite.create(dataDir?{dataDir}:{})
 let queue=Promise.resolve()
 async function connect(){
  let unlock;const next=new Promise(r=>{unlock=r}),prior=queue;queue=next;await prior
  return {query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length}},release:()=>unlock()}
 }
 const pool={connect,query:async(sql,args)=>{const db=await connect();try{return await db.query(sql,args)}finally{db.release()}}}
 return {pg,pool,async migrate(through=27){await pg.exec('CREATE ROLE stall_payment_app_limited NOLOGIN');for(const f of readdirSync(new URL('../../sql/',import.meta.url)).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))<=through).sort())await pg.exec(readFileSync(new URL('../../sql/'+f,import.meta.url),'utf8'))}}
}
