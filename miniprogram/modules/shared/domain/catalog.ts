export interface Category { id:string;name:string }
export type StockMode='unlimited'|'finite'
export function stockAllows(product: {stockMode?:string;stockQuantity?:number;outOfStock?:boolean}, quantity=1): boolean {
  return !product.outOfStock && (product.stockMode !== 'finite' || (Number.isSafeInteger(product.stockQuantity) && Number(product.stockQuantity)>=quantity))
}

export interface RemoteProduct {
  id: string
  name: string
  priceCents: number
  soldOut: boolean
  categoryId: string | null
  imageObjectKey: string | null
  imageUrl?: string | null
  categoryName?:string|null
  categorySortOrder?:number
  effectivePriceCents?:number
  description?:string
  stockMode?:'unlimited'|'finite'
  stockQuantity?:number
  outOfStock?:boolean
}
