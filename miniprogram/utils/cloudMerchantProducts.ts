import { createProductWithRetry } from './productCreateRetry'
import { authorizedGet } from '../modules/shared/runtime/auth'
import { authorizedMutation } from '../modules/merchant/api/mutation'
import { ProductDraft, ProductDraftPayload, InventoryMovement } from '../modules/merchant/demo/store'
import { MerchantCatalogItem, MerchantProductQuery, cloudProductToLocal } from './merchantProductQuery'

import { getCloudContext } from '../modules/shared/runtime/context'
export const merchantCloudConfig = getCloudContext
export interface MerchantCloudProduct {
  createdAt?:string;updatedAt?:string
  id: string; categoryId: string | null; name: string; priceCents: number
  active: boolean; soldOut: boolean; imageObjectKey: string | null; imageUrl: string | null
  publishAt?: string | null; effectiveActive?: boolean; version?: number
  stockMode?:'unlimited'|'finite';stockQuantity?:number;lowStockThreshold?:number;inventoryVersion?:number;outOfStock?:boolean
  description?: string; discountPriceCents?: number | null; discountStart?: string | null; discountEnd?: string | null; effectivePriceCents?: number
}
export async function merchantCloudProduct(cfg:{apiBase:string;storeSlug:string},id:string):Promise<MerchantCloudProduct> {
  const result=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/products/${id}`)
  if(!result || !result.product || result.product.id!==id)throw new Error('invalid_product')
  return result.product
}
export async function merchantCloudDraft(cfg:{apiBase:string;storeSlug:string},id:string):Promise<ProductDraft> {
  const result=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/drafts/${id}`)
  if(!result || !result.draft || result.draft.id!==id)throw new Error('invalid_draft')
  return result.draft
}
export async function merchantCloudProductPage(cfg:{apiBase:string;storeSlug:string},query:MerchantProductQuery,cursor:string):Promise<{items:MerchantCatalogItem[];nextCursor:string;hasMore:boolean;timeZone:string}> {
  const result=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/product-search`,{...query,limit:30,...cursor?{cursor}:{}})
  if(!result || !Array.isArray(result.items) || typeof result.hasMore!=='boolean' || typeof result.timeZone!=='string' ||
    (result.hasMore && typeof result.nextCursor!=='string'))throw new Error('invalid_product_page')
  const items:MerchantCatalogItem[]=result.items.map((entry:any)=>{
    if(entry.kind==='product' && entry.product && typeof entry.product.id==='string')return {kind:'product',product:cloudProductToLocal(entry.product)}
    if(entry.kind==='draft' && entry.draft && typeof entry.draft.id==='string' && entry.draft.payload)return {kind:'draft',draft:entry.draft}
    throw new Error('invalid_catalog_item')
  })
  return {items,nextCursor:result.nextCursor || '',hasMore:result.hasMore,timeZone:result.timeZone}
}
export async function merchantCloudProducts(cfg: {apiBase: string;storeSlug: string}): Promise<MerchantCloudProduct[]> {
  const r = await authorizedGet(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/products`)
  if (!r || !Array.isArray(r.items)) throw new Error('invalid_products')
  return r.items
}
export async function merchantCloudCategories(cfg: {apiBase: string;storeSlug: string}): Promise<Array<{id:string;name:string}>> {
  return (await merchantCloudCategoryContext(cfg)).categories
}
export async function merchantCloudCategoryContext(cfg: {apiBase: string;storeSlug: string}): Promise<{categories:Array<{id:string;name:string}>;timeZone:string}> {
  const r = await authorizedGet(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/categories`)
  if (!r || !Array.isArray(r.items)) throw new Error('invalid_categories')
  if (typeof r.timeZone !== 'string') throw new Error('publishing_migration_required')
  return { categories: r.items.map((x:any) => ({id:String(x.id), name:String(x.name)})), timeZone:r.timeZone }
}
export async function merchantCloudDrafts(cfg: {apiBase:string;storeSlug:string}): Promise<ProductDraft[]> {
  const r = await authorizedGet(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/drafts`)
  if (!r || !Array.isArray(r.items)) throw new Error('invalid_drafts')
  return r.items
}
export async function saveMerchantCloudDraft(cfg: {apiBase:string;storeSlug:string}, id: string, version: number, payload: ProductDraftPayload, clientKey: string): Promise<{id:string;version:number}> {
  const path = `/v1/merchant/stores/${cfg.storeSlug}/drafts${id ? '/' + id : ''}`
  const result = await authorizedMutation(cfg.apiBase,path,id?'PATCH':'POST',{payload,clientKey,expectedVersion:version})
  if (!result || typeof result.id !== 'string' || !Number.isSafeInteger(result.version)) throw new Error('unconfirmed_draft_save')
  return result
}
export async function discardMerchantCloudDraft(cfg: {apiBase:string;storeSlug:string}, id: string, version: number): Promise<void> {
  await authorizedMutation(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/drafts/${id}`,'DELETE',{expectedVersion:version})
}
export async function saveMerchantCloudProduct(cfg: {apiBase:string;storeSlug:string}, id:string, data:any,createIntent='new') {
  const path = `/v1/merchant/stores/${cfg.storeSlug}/products${id ? '/' + id : ''}`
  return id?authorizedMutation(cfg.apiBase,path,'PATCH',data):createProductWithRetry(cfg,createIntent,data)
}
export async function archiveMerchantCloudProduct(cfg: {apiBase:string;storeSlug:string}, id:string) {
  return authorizedMutation(cfg.apiBase, `/v1/merchant/stores/${cfg.storeSlug}/products/${id}`, 'DELETE')
}
export type MerchantProductBatchPatch = { active: boolean } | { soldOut: boolean } | { categoryId: string }
export async function patchMerchantCloudProduct(cfg: {apiBase:string;storeSlug:string}, id: string, patch: MerchantProductBatchPatch): Promise<void> {
  const result = await saveMerchantCloudProduct(cfg, id, patch)
  if (!result || result.id !== id) throw new Error('unconfirmed_product_update')
}
export async function merchantCloudInventory(cfg:{apiBase:string;storeSlug:string},id:string):Promise<{product:MerchantCloudProduct;movements:InventoryMovement[]}> {
  const result=await authorizedGet(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/products/${id}/inventory`)
  if(!result||!result.product||!Array.isArray(result.movements))throw new Error('invalid_inventory_result')
  return result
}
export async function adjustMerchantCloudInventory(cfg:{apiBase:string;storeSlug:string},id:string,delta:number,reason:string,expectedInventoryVersion:number,requestKey:string):Promise<void> {
  const result=await authorizedMutation(cfg.apiBase,`/v1/merchant/stores/${cfg.storeSlug}/products/${id}/inventory`,'POST',{delta,reason,expectedInventoryVersion,requestKey})
  if(!result||result.ok!==true)throw new Error('unconfirmed_inventory_adjustment')
}
