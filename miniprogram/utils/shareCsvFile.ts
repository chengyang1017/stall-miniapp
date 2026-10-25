export async function shareCsvFile(csv:string,filename:string):Promise<void>{
  if(typeof csv!=='string'||!csv.startsWith('\uFEFF')||!/^billing-(?:all|\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}|demo-\d+)\.csv$/.test(filename)||encodeURIComponent(csv).replace(/%[a-f0-9]{2}/gi,'x').length>5*1024*1024)throw Error('invalid_csv_file')
  const path=wx.env.USER_DATA_PATH+'/'+filename
  await new Promise<void>((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:path,data:csv,encoding:'utf8',success:()=>resolve(),fail:reject}))
  await new Promise<void>(resolve=>{
    const saved=()=>{wx.showModal({title:'CSV 已保存',content:'文件保存在小程序本地目录。当前环境无法分享文件，请在支持文件分享的微信真机中使用。',showCancel:false});resolve()}
    if(typeof wx.shareFileMessage==='function')wx.shareFileMessage({filePath:path,fileName:filename,success:()=>resolve(),fail:saved});else saved()
  })
}
