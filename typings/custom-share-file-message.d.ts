// Compatibility declaration for wx.shareFileMessage.
// The installed WeChat typings omit this API. Runtime support must still be tested on a real device.
declare namespace WechatMiniprogram {
  interface Wx {
    shareFileMessage(options: {
      filePath: string
      fileName?: string
      success?: () => void
      fail?: (result: { errMsg?: string }) => void
      complete?: () => void
    }): void
  }
}
