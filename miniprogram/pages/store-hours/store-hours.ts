import {loadHours,saveHours,HoursConfig,businessState} from '../../utils/storeHours'
const DAYS = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六']
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
Page({
  data: { accepting:true, notice:'', days:[] as Array<{name:string;enabled:boolean;start:string;end:string}>, status:'营业中' },
  onShow() { this.refresh() },
  refresh() {
    const cfg = loadHours()
    this.setData({accepting:cfg.accepting,notice:cfg.notice,days:cfg.days.map((d,i)=>({...d,name:DAYS[i]})),status:businessState().label})
  },
  toggleAccept(e:any) { const cfg=loadHours(); cfg.accepting=!!e.detail.value;saveHours(cfg);this.refresh() },
  changeNotice(e:any) { this.setData({notice:e.detail.value}) },
  saveNotice() { const cfg=loadHours();cfg.notice=String(this.data.notice).slice(0,200);saveHours(cfg);wx.showToast({title:'公告已保存'});this.refresh() },
  toggleDay(e:any) {const idx=Number(e.currentTarget.dataset.index);const cfg=loadHours();if (!cfg.days[idx]) return;cfg.days[idx].enabled=!!e.detail.value;saveHours(cfg);this.refresh()},
  editStart(e:any) {const idx=Number(e.currentTarget.dataset.index);const arr=this.data.days.slice();if(!arr[idx])return;arr[idx].start=e.detail.value;this.setData({days:arr})},
  editEnd(e:any) {const idx=Number(e.currentTarget.dataset.index);const arr=this.data.days.slice();if(!arr[idx])return;arr[idx].end=e.detail.value;this.setData({days:arr})},
  saveSchedule() {
    const days=this.data.days.map(d=>({enabled:d.enabled,start:d.start,end:d.end}))
    for (const d of days) if (!TIME.test(d.start)||!TIME.test(d.end)||d.start>=d.end) return wx.showToast({title:'请检查营业时间',icon:'none'})
    const cfg:HoursConfig=loadHours();cfg.days=days;saveHours(cfg);wx.showToast({title:'营业时间已保存'});this.refresh()
  }
})