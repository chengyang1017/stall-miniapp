import { traceRequest } from '../runtime/uiTrace'
import type { Category } from '../domain/catalog'
// Public catalog reads: paged listing, or up to 40 explicit IDs for cart/detail.
import type { RemoteProduct } from '../domain/catalog'
export type { RemoteProduct } from '../domain/catalog'
export interface RemoteProductPage { products:RemoteProduct[];categories:Category[];hasMore:boolean;nextCursor:string|null }
export function getRemoteProducts(apiBaseUrl:string,storeSlug:string,ids?:string[]):Promise<RemoteProduct[]> {
  return requestProductPage(apiBaseUrl,storeSlug,ids).then(page=>page.products)
}
export function getRemoteProductPage(apiBaseUrl:string,storeSlug:string,query:{q?:string;category?:string;cursor?:string;discount?:'1'}={}):Promise<RemoteProductPage>{
  return requestProductPage(apiBaseUrl,storeSlug,undefined,query)
}
function requestProductPage(apiBaseUrl:string,storeSlug:string,ids?:string[],query:{q?:string;category?:string;cursor?:string;discount?:'1'}={}):Promise<RemoteProductPage> {
  if(ids&&(!ids.length||ids.length>40||ids.some(id=>!/^[0-9a-f-]{36}$/.test(id))))return Promise.reject(Error('invalid_product_ids'))
  const devLocal = /^http:\/\/(?:127\.0\.0\.1|localhost):8787$/.test(apiBaseUrl)
  const inDevtools = wx.getSystemInfoSync().platform === 'devtools'
  if (!/^https:\/\//.test(apiBaseUrl) && !(inDevtools && devLocal)) {
    return Promise.reject(new Error('API must use HTTPS outside local devtools'))
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug)) return Promise.reject(new Error('Invalid store slug'))
  const params=ids?'ids='+encodeURIComponent(ids.join(',')):'limit=30'+Object.keys(query).map(k=>'&'+encodeURIComponent(k)+'='+encodeURIComponent((query as any)[k])).join('')
  return traceRequest(ids?'catalog.ids':'catalog.page',()=>new Promise((resolve, reject) => {
    wx.request({
      url: apiBaseUrl.replace(/\/$/, '') + '/v1/stores/' + storeSlug + '/products'+'?'+params,
      method: 'GET',
      timeout: 10000,
      success: response => {
        if(response.statusCode!==200){reject(new Error('http_'+response.statusCode+'_products_unavailable'));return}
        const body = response.data as RemoteProductPage
        if (response.statusCode !== 200 || !body || !Array.isArray(body.products) || !Array.isArray(body.categories) || typeof body.hasMore!=='boolean' || (body.hasMore && typeof body.nextCursor!=='string')) {
          reject(new Error('Failed to load products'))
          return
        }
        resolve(body)
      },
      fail: reject
    })
  }))
}
