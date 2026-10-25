import { captureStoreEntry } from '../../miniprogram/utils/storeEntry'
import { syncCartTabBadge } from '../../miniprogram/utils/cart' // CART_TAB_BADGE_V1
import { cloudCartConfig,syncCloudBadge } from '../../miniprogram/utils/cloudCart'
// app.ts
App<IAppOption>({
  onShow(options:any) {captureStoreEntry(options?.query);const cfg=cloudCartConfig();if(cfg)syncCloudBadge(cfg.storeSlug);else syncCartTabBadge()},
  globalData: {},
  onLaunch(options:any) {
    captureStoreEntry(options?.query)
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // Real server sessions are created only through authApi.loginWithWechat.
  },
})
