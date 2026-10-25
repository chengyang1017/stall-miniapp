// Compatibility facade; new consumers use shared/public or merchant/admin API directly.
export { publicBusiness,minimumDisplay } from '../modules/shared/api/business'
export type { CloudBusiness } from '../modules/shared/domain/business'
export { merchantBusiness,patchMerchantBusiness,businessContextKey } from '../modules/merchant/api/business'
