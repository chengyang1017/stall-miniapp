const fs=require('fs');const p='miniprogram/utils/merchantCategoriesCloud.ts';let s=fs.readFileSync(p,'utf8');s=s.replace("if(identity!==supportIdentity()||!r||r.ok!==true)throw Error('category_write_unconfirmed');return accept(r,identity,issued)",`if(identity!==supportIdentity()||!r||r.ok!==true)throw Error('category_write_unconfirmed')
 if((method==='POST'||method==='PATCH'&&id!=='order')&&Object.prototype.hasOwnProperty.call(body,'iconKey')){
  const saved=Array.isArray(r.items)?r.items.find((item:any)=>method==='POST'?item.name===String(body.name).trim():item.id===id):null
  if(r.categoryIconsSupported!==true||!saved||(saved.iconKey??null)!==body.iconKey)throw Error('category_icon_write_unconfirmed')
 }
 return accept(r,identity,issued)`);fs.writeFileSync(p,s);
