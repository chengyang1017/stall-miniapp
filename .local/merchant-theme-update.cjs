const fs=require('fs'),path=require('path'),crypto=require('crypto');const manifest=JSON.parse(fs.readFileSync('apps/build-targets.json','utf8'));const pages=manifest.targets.merchant.pages;const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const baseline={pages,controllers:{},templates:{},layout:{}};for(const p of pages){for(const [ext,key]of [['.ts','controllers'],['.wxml','templates']])baseline[key]['miniprogram/'+p+ext]=digest('miniprogram/'+p+ext)}
fs.writeFileSync('.local/merchant-ui-baseline.json',JSON.stringify(baseline,null,2));
fs.writeFileSync('miniprogram/styles/brand-tokens.wxss',`/* Shared brand values; semantic feedback keeps its own colors. */
page,:host{
  --brand-primary:#7137db;
  --brand-primary-dark:#5129b4;
  --brand-primary-soft:#eee5fc;
  --brand-background:#f7f4fc;
  --brand-surface:#ffffff;
  --brand-border:#e6dcf2;
  --brand-text:#2e243c;
  --brand-muted:#8c7d9d;
  --brand-shadow:0 5rpx 20rpx rgba(85,47,141,.06);
}
`);
fs.writeFileSync('miniprogram/styles/merchant-theme.wxss',`@import "./brand-tokens.wxss";
/* Appearance only: no sizing, spacing, positioning, flow or navigation rules. */
page{background:var(--brand-background);color:var(--brand-text)}
button[type=primary]{background:linear-gradient(130deg,var(--brand-primary),var(--brand-primary-dark));color:#fff}
button[type=primary][disabled]{background:#e4d9f2;color:#aa9abf}
input:focus,textarea:focus{border-color:var(--brand-primary)}
.card,.panel,.proof-card,.bill-filter,.bill-stat,.bill-order,.hours-card,.merchant-group,.merchant-shortcuts,.merchant-minimum,.merchant-pending{box-shadow:var(--brand-shadow)}
.merchant-hero{background:linear-gradient(130deg,var(--brand-primary-dark),#9b73e5);color:#fff}
.support-line.mine .support-bubble{background:var(--brand-primary-soft)}
.support-compose button{background:var(--brand-primary);color:#fff}
.proof-link{color:var(--brand-primary)}
`);
const protectedSelector=/success|paid|complete|delivered|cancel|error|warn|danger|refund|profit|state|status|stock-empty/i;
function convertColor(hex){const raw=hex.slice(1),v=raw.length===3?raw.split('').map(x=>x+x).join(''):raw;if(v.length!==6)return hex;const [r,g,b]=[0,2,4].map(i=>parseInt(v.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,s=mx?d/mx:0;let h=0;if(d)h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;
 if(h<85||h>175)return hex;
 if(mx>.88&&s<.18)return 'var(--brand-background)';
 if(mx>.78&&s<.35)return 'var(--brand-primary-soft)';
 if(mx<.32)return 'var(--brand-text)';
 if(s>.45&&mx<.76)return 'var(--brand-primary)';
 if(s<.27)return 'var(--brand-muted)';
 return 'var(--brand-border)';
}
function appearance(css){return css.replace(/([^{}]+)\{([^{}]*)\}/g,(m,selector,body)=>{
 if(protectedSelector.test(selector)||/spa-v8|stall-.*(?:art|hill|sun|box|bow|ribbon|spark|package|premium|classic|bag|placeholder)/.test(selector))return m;
 return selector+'{'+body.replace(/#[0-9a-f]{3,8}\b/gi,convertColor).replace(/rgba\(\s*(?:16,\s*134,\s*93|34,\s*72,\s*55|39,\s*64,\s*47)\s*,/g,'rgba(85,47,141,')+'}';
 })}
const coverage=[];
for(const p of pages){const file='miniprogram/'+p+'.wxss';const original=fs.readFileSync(file,'utf8');let css=appearance(original);css+='\n@import "../../styles/merchant-theme.wxss";\n';fs.writeFileSync(file,css);const config='miniprogram/'+p+'.json',json=JSON.parse(fs.readFileSync(config,'utf8'));json.navigationBarBackgroundColor='#5935cf';json.navigationBarTextStyle='white';fs.writeFileSync(config,JSON.stringify(json,null,2)+'\n');coverage.push(file)}
// Shared feature appearance inherits the same palette in both shells.
for(const file of ['miniprogram/modules/features/chat/view.wxss','miniprogram/modules/features/proof/view.wxss'])fs.writeFileSync(file,appearance(fs.readFileSync(file,'utf8')));
const p='miniprogram/styles/customer-theme.wxss';fs.writeFileSync(p,'@import "./brand-tokens.wxss";\n'+fs.readFileSync(p,'utf8'));
fs.writeFileSync('.local/merchant-ui-coverage.json',JSON.stringify({pages,styles:coverage},null,2));
for(const [p,hash]of Object.entries({...baseline.controllers,...baseline.templates}))if(digest(p)!==hash)throw Error('Merchant structure changed: '+p);
console.log('Appearance updated across '+pages.length+' merchant pages; all merchant controllers and templates unchanged.');
