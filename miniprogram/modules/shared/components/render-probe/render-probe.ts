import { traceProbe } from '../../runtime/uiTrace'
let serial=0
Component({
 options:{virtualHost:true},
 properties:{pageName:String,listName:String,rowKey:String},
 lifetimes:{attached(){(this as any).traceInstance=++serial;traceProbe('attached',this.data.pageName,this.data.listName,this.data.rowKey,(this as any).traceInstance)},detached(){traceProbe('detached',this.data.pageName,this.data.listName,this.data.rowKey,(this as any).traceInstance)}},
 pageLifetimes:{show(){traceProbe('show',this.data.pageName,this.data.listName,this.data.rowKey,(this as any).traceInstance)},hide(){traceProbe('hide',this.data.pageName,this.data.listName,this.data.rowKey,(this as any).traceInstance)}}
})
