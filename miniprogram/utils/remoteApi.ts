// Opt-in foundation for phase 2: no existing ordering flows are switched yet.
// Supply a real HTTPS API base URL and store slug from deployment configuration.
export interface RemoteProduct {
  id: string
  name: string
  priceCents: number
  soldOut: boolean
  categoryId: string | null
  imageObjectKey: string | null
  imageUrl?: string | null
}
export function getRemoteProducts(apiBaseUrl: string, storeSlug: string): Promise<RemoteProduct[]> {
  const devLocal = /^http:\/\/(?:127\.0\.0\.1|localhost):8787$/.test(apiBaseUrl)
  const inDevtools = wx.getSystemInfoSync().platform === 'devtools'
  if (!/^https:\/\//.test(apiBaseUrl) && !(inDevtools && devLocal)) {
    return Promise.reject(new Error('API must use HTTPS outside local devtools'))
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug)) return Promise.reject(new Error('Invalid store slug'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBaseUrl.replace(/\/$/, '') + '/v1/stores/' + storeSlug + '/products',
      method: 'GET',
      timeout: 10000,
      success: response => {
        const body = response.data as { products?: RemoteProduct[] }
        if (response.statusCode !== 200 || !body || !Array.isArray(body.products)) {
          reject(new Error('Failed to load products'))
          return
        }
        resolve(body.products)
      },
      fail: reject
    })
  })
}
