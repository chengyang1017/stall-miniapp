const fs=require('fs');let p='backend/tests/build-navigation-isolation.test.mjs',s=fs.readFileSync(p,'utf8').replace(/\r/g,'');s=s.replace("evaluate(file,spec=>spec==='../../modules/integration/singleAppHost'?adapter:modules[spec]||{})",`evaluate(file,spec=>{
   if(spec==='../../modules/customer/controllers/catalog')return evaluate('miniprogram/modules/customer/controllers/catalog.ts',child=>{
    const resolved=path.posix.normalize(path.posix.join('miniprogram/modules/customer/controllers',child))
    const legacy=path.posix.relative('miniprogram/pages/index',resolved)
    return modules[legacy]||{}
   })
   return spec==='../../modules/integration/singleAppHost'?adapter:modules[spec]||{}
  })`);fs.writeFileSync(p,s);
