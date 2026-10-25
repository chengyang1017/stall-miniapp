import { createHash } from 'node:crypto'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function pageScope(parts){return createHash('sha256').update(JSON.stringify(parts)).digest('hex')}
export function pageQuery(q,allowed,defaultLimit,scope){
  if([...q.keys()].some(k=>!allowed.includes(k)||q.getAll(k).length!==1))throw Error('invalid_page_query')
  const raw=q.get('limit')??String(defaultLimit),limit=Number(raw)
  if(!/^[1-9][0-9]?$/.test(raw)||limit>50)throw Error('invalid_page_size')
  let anchor=null
  if(q.has('cursor')){
    const value=q.get('cursor')
    if(!value||value.length>600||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('invalid_cursor')
    try{anchor=JSON.parse(Buffer.from(value,'base64url').toString('utf8'))}catch{throw Error('invalid_cursor')}
    if(!Array.isArray(anchor)||anchor.length!==3||anchor[0]!==scope||!uuid.test(anchor[2])||typeof anchor[1]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(anchor[1])||(!Number.isFinite(Date.parse(anchor[1]))||new Date(anchor[1]).toISOString().slice(0,19)!==anchor[1].slice(0,19)))throw Error('invalid_cursor')
  }
  return {limit,anchor}
}
// Preserve PostgreSQL microseconds: JS Date would truncate a cursor to milliseconds.
export const cursorTime=alias=>`to_char(${alias}.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
export function pageResult(rows,limit,scope){
  const hasMore=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1)
  const nextCursor=hasMore?Buffer.from(JSON.stringify([scope,last.cursorTime,last.id])).toString('base64url'):null
  return {items:items.map(({cursorTime,...row})=>row),hasMore,nextCursor}
}
