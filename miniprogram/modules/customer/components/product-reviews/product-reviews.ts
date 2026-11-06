import { publicReviews,publicReviewSummary,reviewCustomerRequest,reviewLogin } from '../../api/reviews'
import { cloudIdentity } from '../../../shared/runtime/context'
import { chinaTime } from '../../../shared/domain/time'
Component({
 properties:{productId:{type:String,value:''},enabled:{type:Boolean,value:false},compact:{type:Boolean,value:false}},
 data:{expanded:false,previewRows:[] as any[],rows:[] as any[],summary:null as any,rating:'',stars:['全部','5 星','4 星','3 星','2 星','1 星'],ratingChoices:[{label:'全部',value:''},{label:'5 星',value:'5'},{label:'4 星',value:'4'},{label:'3 星',value:'3'},{label:'2 星',value:'2'},{label:'1 星',value:'1'}],loading:false,error:'',hasMore:false,reportId:'',reportRevision:'',reportReason:'',reportBusy:false},
 lifetimes:{attached(this:any){this.serial=0;this.visible=true;this.cursor='';this.identity='';this.queryKey='';this.load(true)},detached(this:any){this.visible=false;this.serial++}},
 pageLifetimes:{show(this:any){this.visible=true;this.load(true)},hide(this:any){this.visible=false;this.serial++;this.setData({loading:false,reportId:'',reportReason:''})}},
 observers:{'productId,enabled'(this:any){if(this.visible)this.load(true)}},
 methods:{
  async load(this:any,reset=false){
   if(!this.data.enabled||!this.data.productId||!this.visible)return
   const queryKey=JSON.stringify([cloudIdentity(),this.data.productId,this.data.rating]);if(this.data.loading&&(!reset||this.queryKey===queryKey))return;const changed=this.queryKey!==queryKey;this.queryKey=queryKey
   const serial=++this.serial,identity=cloudIdentity(),id=this.data.productId,rating=this.data.rating;this.identity=identity
   if(reset){this.cursor='';if(changed)this.setData({rows:[],previewRows:[],hasMore:false,summary:null,reportId:'',expanded:false})}
   this.setData({loading:true,error:''})
   try{const [page,summary]=await Promise.all([publicReviews(id,rating,this.cursor),publicReviewSummary(id)]);if(!this.visible||serial!==this.serial||identity!==cloudIdentity())return
    const rows=reset?[]:[...this.data.rows],seen=new Set(rows.map((r:any)=>r.id));page.items.forEach(r=>{if(!seen.has(r.id)){rows.push({...r,displayTime:chinaTime(r.publishedAt||r.createdAt)});seen.add(r.id)}})
    this.cursor=page.nextCursor||'';this.setData({rows,previewRows:rows.slice(0,2),summary,hasMore:page.hasMore})
   }catch(e){if(this.visible&&serial===this.serial)this.setData({error:String((e as Error).message)})}finally{if(serial===this.serial)this.setData({loading:false})}
  },
  expand(this:any){this.setData({expanded:true})},
  filter(this:any,e:any){this.setData({rating:Number(e.detail.value)?String(e.detail.value):''});this.load(true)},
  selectRating(this:any,e:any){const rating=String(e.currentTarget.dataset.rating||'');if(this.data.rating===rating)return;this.setData({rating});this.load(true)},
  refresh(this:any){this.load(true)},more(this:any){if(this.data.hasMore)this.load()},
  async images(this:any,e:any){const row=this.data.rows.find((r:any)=>r.id===e.detail.id);if(!row)return;const identity=cloudIdentity();try{const urls:string[]=[];for(const id of row.imageIds){const v=await reviewCustomerRequest('review-images/'+id);urls.push(v.url)}if(this.visible&&identity===cloudIdentity()&&urls.length)wx.previewImage({urls,current:urls[0]})}catch(e){if(this.visible)this.setData({error:String((e as Error).message)})}},
  report(this:any,e:any){const row=this.data.rows.find((r:any)=>r.id===e.currentTarget.dataset.id);if(!row)return;this.setData({reportId:row.id,reportRevision:row.revisionId,reportReason:''})},
  reportReply(this:any,e:any){
    const row=this.data.rows.find((r:any)=>r.id===e.currentTarget.dataset.id)
    if(row && row.publicReplyRevisionId){
      this.setData({
        reportId:row.id,
        reportRevision:row.publicReplyRevisionId,
        reportReason:''
      })
    }
  },
  reportInput(this:any,e:any){this.setData({reportReason:String(e.detail.value)})},
  cancelReport(this:any){if(!this.data.reportBusy)this.setData({reportId:'',reportReason:''})},
  async submitReport(this:any){if(this.data.reportBusy||!this.data.reportReason.trim())return;const identity=cloudIdentity();this.setData({reportBusy:true,error:''});try{await reviewCustomerRequest(`reviews/${this.data.reportId}/report`,'POST',{revisionId:this.data.reportRevision,reason:this.data.reportReason.trim()});if(this.visible&&identity===cloudIdentity()){this.setData({reportId:'',reportReason:''});wx.showToast({title:'举报已提交，等待处理',icon:'none'})}}catch(e){if(this.visible)this.setData({error:String((e as Error).message)})}finally{this.setData({reportBusy:false})}},
  async login(this:any){try{await reviewLogin();if(this.visible)this.refresh()}catch(e){this.setData({error:String((e as Error).message)})}}
 }
})
