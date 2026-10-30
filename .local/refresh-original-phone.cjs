const fs=require('fs'),path=require('path'),cp=require('child_process');
const workspace=process.cwd(),source=path.resolve('dist/combined'),target=path.resolve('dist/phone-preview');
if(path.dirname(target)!==path.join(workspace,'dist')||path.basename(target)!=='phone-preview'||!fs.existsSync(path.join(target,'.stall-build-output')))throw Error('Unowned or unexpected preview output');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>{const full=path.join(p,e.name);if(e.isSymbolicLink())throw Error('Symlink output refused');return e.isDirectory()?walk(full):[full]});
const profile=JSON.parse(fs.readFileSync('.local/phone-staging.json','utf8')),phone=JSON.parse(fs.readFileSync(path.join(target,'phone-preview.json'),'utf8')),project=JSON.parse(fs.readFileSync(path.join(target,'project.config.json'),'utf8'));
for(const key of ['apiBase','storeSlug','appId'])if(profile[key]!==phone[key])throw Error('Staging profile changed: '+key);
if(project.appid!==phone.appId||project.setting.urlCheck!==true)throw Error('Preview identity or domain validation mismatch');
const phoneConfig=fs.readFileSync(path.join(target,'source/config/cloud.ts'),'utf8');if(!phoneConfig.includes(phone.apiBase)||!/CLOUD_ONLY(?::boolean)?\s*=\s*true/.test(phoneConfig))throw Error('Cloud-only configuration not confirmed');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'build-manifest.json'),'utf8')),expected=new Set(manifest.artifacts);
for(const file of walk(path.join(target,'miniprogram'))){const relative=path.relative(path.join(target,'miniprogram'),file).replace(/\\/g,'/');if(!expected.has(relative))throw Error('Stale artifact requires operator review: '+relative)}
for(const folder of ['source','miniprogram'])for(const file of walk(path.join(source,folder))){const rel=path.relative(source,file).replace(/\\/g,'/');if(rel==='source/config/cloud.ts'||rel==='miniprogram/config/cloud.js')continue;const destination=path.resolve(target,rel);if(!destination.startsWith(target+path.sep))throw Error('Output escape');fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination)}
const result=cp.spawnSync(process.execPath,['node_modules/typescript/lib/tsc.js','--project',path.join(target,'tsconfig.json'),'--pretty','false'],{stdio:'inherit'});if(result.status!==0)throw Error('In-place phone TypeScript compile failed');
manifest.appid=phone.appId;fs.writeFileSync(path.join(target,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
if(fs.readFileSync(path.join(target,'source/config/cloud.ts'),'utf8')!==phoneConfig)throw Error('Preview config changed');
const emitted=fs.readFileSync(path.join(target,'miniprogram/config/cloud.js'),'utf8');if(!emitted.includes(phone.apiBase)||!emitted.includes('CLOUD_ONLY = true'))throw Error('Emitted preview config mismatch');
console.log('Updated original phone-preview in place; cloud-only staging configuration, AppID, domain validation and directory retained; no deletions.');

