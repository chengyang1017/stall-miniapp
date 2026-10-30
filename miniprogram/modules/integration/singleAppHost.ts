export const CAN_OPEN_MERCHANT=true
export function openMerchantWorkspace(){wx.navigateTo({url:'/pages/admin/admin'})}
export const CAN_OPEN_CUSTOMER=true
export function openCustomerShop(){wx.switchTab({url:'/pages/index/index'})}
