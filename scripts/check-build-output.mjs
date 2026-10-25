import { checkOutput } from './miniapp-output.mjs'
const target=process.argv[2]
for(const name of target?[target]:['combined','customer','merchant'])checkOutput(name)
