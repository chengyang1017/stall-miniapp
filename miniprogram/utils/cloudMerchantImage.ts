import { authorizedMutation } from './authApi'

interface StoreConfig { apiBase: string; storeSlug: string }

function imageType(path: string): string {
  const suffix = path.split('?')[0].toLowerCase().split('.').pop()
  if (suffix === 'jpg' || suffix === 'jpeg') return 'image/jpeg'
  if (suffix === 'png') return 'image/png'
  if (suffix === 'webp') return 'image/webp'
  throw new Error('unsupported_image_format')
}

function fileInfo(path: string): Promise<{size: number}> {
  return new Promise((resolve, reject) => wx.getFileInfo({ filePath: path, success: (r: any) => resolve({size: Number(r.size)}), fail: reject }))
}

function fileData(path: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: path, success: (r: any) => resolve(r.data as ArrayBuffer), fail: reject }))
}

export async function uploadMerchantImage(cfg: StoreConfig, path: string): Promise<string> {
  const contentType = imageType(path)
  const info = await fileInfo(path)
  if (!Number.isFinite(info.size) || info.size < 1 || info.size > 5 * 1024 * 1024) throw new Error('image_must_be_under_5mb')
  const result = await authorizedMutation(cfg.apiBase,
    `/v1/merchant/stores/${cfg.storeSlug}/image-uploads`, 'POST', {contentType, sizeBytes: info.size})
  if (!result || typeof result.key !== 'string' || typeof result.uploadUrl !== 'string' || !/^https:\/\//.test(result.uploadUrl)) {
    throw new Error('invalid_upload_signature')
  }
  const data = await fileData(path)
  await new Promise<void>((resolve, reject) => wx.request({
    url: result.uploadUrl, method: 'PUT', data,
    header: {'content-type': contentType}, timeout: 60000,
    success: (r: any) => r.statusCode >= 200 && r.statusCode < 300 ? resolve() : reject(new Error(`image_upload_http_${r.statusCode}`)),
    fail: reject
  }))
  return result.key
}
