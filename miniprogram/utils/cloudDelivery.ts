// Compatibility only: customer selection and merchant settings now have separate modules.
export * from '../modules/customer/api/delivery'
export { fetchMerchantDelivery,saveMerchantDelivery } from '../modules/merchant/api/delivery'
