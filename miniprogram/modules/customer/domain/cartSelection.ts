import { getCloudContext } from '../../shared/runtime/context'
import { sessionScope } from '../../shared/runtime/sessionScope'
function key(){const cfg=getCloudContext();return 'stall_cart_excluded_v1:'+ (cfg?encodeURIComponent(cfg.apiBase+'/'+cfg.storeSlug)+':'+sessionScope():'demo')}
export function excludedCartIds():string[]{const value=wx.getStorageSync(key());return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}
export function setExcludedCartIds(ids:string[]){wx.setStorageSync(key(),Array.from(new Set(ids)))}
export function selectedCartRows<T extends {productId:string}>(rows:T[]):T[]{const excluded=new Set(excludedCartIds());return rows.filter(row=>!excluded.has(row.productId))}
export function selectedCartDetails<T extends {productId:string;quantity:number;subtotal:number}>(cart:{items:T[]}){const items=selectedCartRows(cart.items);return {items,totalCount:items.reduce((n,x)=>n+x.quantity,0),totalText:(items.reduce((n,x)=>n+Math.round(x.subtotal*100),0)/100).toFixed(2)}}
