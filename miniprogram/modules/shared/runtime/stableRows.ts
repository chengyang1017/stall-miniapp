// Preserve keyed rows and native children when only row fields change.
export function stableRowsPatch(field:string,current:any[],next:any[],key:string):Record<string,any>{
 const patch:Record<string,any>={},oldKeys=current.map(row=>row[key]),newKeys=next.map(row=>row[key])
 const prefix=new Set(newKeys).size===newKeys.length&&oldKeys.length<=newKeys.length&&oldKeys.every((id,i)=>id===newKeys[i])
 if(!prefix){const previous=new Map(current.map(row=>[row[key],row]));patch[field]=next.map(row=>({...previous.get(row[key]),...row}));return patch}
 next.forEach((row,index)=>{
  if(index>=current.length){patch[field+'['+index+']']=row;return}
  for(const name of Object.keys(row)){const value=row[name]===undefined?null:row[name];if(JSON.stringify(current[index][name])!==JSON.stringify(value))patch[field+'['+index+'].'+name]=value}
 })
 return patch
}
