// Generic invalidation callbacks; no customer or merchant state is held here.
const listeners=new Set<()=>void>()
export function registerSessionCacheReset(fn:()=>void):()=>void{listeners.add(fn);return ()=>{listeners.delete(fn)}}
export function clearSessionCaches():void{listeners.forEach(fn=>fn())}
