import { authorizedGet, authorizedMutation, localDevAllowed } from './authApi'

const KEY = 'stall_cloud_catalog_config_v1'
export function merchantCloudConfig(): {apiBase: string; storeSlug: string} | null {
  const v = wx.getStorageSync(KEY) as any
  if (!v || typeof v.apiBase !== 'string' || typeof v.storeSlug !== 'string') return null
  const apiBase = v.apiBase.trim().replace(/\/$/, '')
  const storeSlug = v.storeSlug.trim()
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug)) return null
  if (!/^https:\/\//.test(apiBase) && !localDevAllowed(apiBase)) return null
  return { apiBase, storeSlug }
}
export interface MerchantCloudProduct {
  id: string; categoryId: string | null; name: string; priceCents: number
  active: boolean; soldOut: boolean; imageObjectKey: string | null; imageUrl: string | null
  description?: string; discountPriceCents?: number | null; discountStart?: string | null; discountEnd?: string | null; effectivePriceCents?: number
}
export async function merchantCloudProducts(cfg: {apiBase: string;storeSlug: string}): Promise<MerchantCloudProduct[]> {
  const r = await authorizedGet(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/products`)
  if (!r || !Array.isArray(r.items)) throw new Error('invalid_products')
  return r.items
}
export async function merchantCloudCategories(cfg: {apiBase: string;storeSlug: string}): Promise<Array<{id:string;name:string}>> {
  const r = await authorizedGet(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/categories`)
  if (!r || !Array.isArray(r.items)) throw new Error('invalid_categories')
  return r.items.map((x:any) => ({id:String(x.id), name:String(x.name)}))
}
export async function saveMerchantCloudProduct(cfg: {apiBase:string;storeSlug:string}, id:string, data:any) {
  const path = `/v1/merchant/stores/${cfg.storeSlug}/products${id ? '/' + id : ''}`
  return authorizedMutation(cfg.apiBase, path, id ? 'PATCH' : 'POST', data)
}
export async function archiveMerchantCloudProduct(cfg: {apiBase:string;storeSlug:string}, id:string) {
  return authorizedMutation(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/products/${id}`, 'DELETE')
}
