// Basic per-process protection for existing synchronous CSV endpoints.
// Private archive generation uses its separate database-backed limits in migration 014.
const buckets=new Map()
export function allowReportExport(storeId){
 const now=Date.now()
 for(const [id,b] of buckets)if(now-b.start>=60000)buckets.delete(id)
 const b=buckets.get(storeId)
 if(b){if(b.count>=5)return false;b.count++;return true}
 if(buckets.size>=2000)return false
 buckets.set(storeId,{start:now,count:1});return true
}
