import { checkInventory,graph,relative } from './miniapp-graph.mjs'
checkInventory()
for(const target of ['combined','customer','merchant']){
 const {files}=graph(target)
 console.log(`${target}: ${files.size} source files; dependency boundaries and cycles checked`)
 if(process.argv.includes('--list'))for(const file of files.keys())console.log('  '+relative(file))
}
