import {PGlite} from '@electric-sql/pglite'
const {readFileSync}=await import('node:fs')
const pg=await PGlite.create({loadDataDir:new Blob([readFileSync(process.argv[2])])})
const result=await pg.query('SELECT id,request_key FROM sandbox_payment_attempts WHERE id=$1',[process.argv[3]])
process.stdout.write(JSON.stringify(result.rows[0]));await pg.close()
