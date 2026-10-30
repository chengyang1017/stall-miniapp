// Independent server allowlist: clients cannot persist paths, SVG or arbitrary URLs.
export const CATEGORY_ICON_KEYS=Object.freeze(["grid","drink","bowl","snack","bottle","apple","snowflake","cloche","cake","noodle","rice","lunchbox","fries","sunrise","coffee","bubble-tea","bread","seasoning","wine","more","shirt","shoes","bag","phone","laptop","headphones","beauty","jewelry","baby","toys","books","stationery","furniture","lamp","tools","garden","pets","sports","outdoor","auto","medicine","gift","craft","digital"])
export const validCategoryIconKey=value=>value===null||typeof value==='string'&&CATEGORY_ICON_KEYS.includes(value)
export async function categoryIconsSupported(db){
 const result=await db.query("SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='categories'::regclass AND attname='icon_key' AND NOT attisdropped) AS supported")
 return result.rows[0]?.supported===true
}
