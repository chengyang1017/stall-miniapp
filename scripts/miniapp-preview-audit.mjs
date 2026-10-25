import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, relative, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Standalone, read-only preview preflight. Does not invoke WeChat upload or run the API server.
export function maskLiteralText(source) {
  const out = [...source]
  let state = 'code', escaped = false
  for (let i = 0; i < source.length; i++) {
    const c = source[i], n = source[i + 1]
    if (state === 'code') {
      if (c === '/' && n === '/') { out[i] = out[i + 1] = ' '; i++; state = 'line'; continue }
      if (c === '/' && n === '*') { out[i] = out[i + 1] = ' '; i++; state = 'block'; continue }
      if (c === "'" || c === '"' || c === '`') { out[i] = ' '; state = c; escaped = false }
    } else {
      if (c !== '\n' && c !== '\r') out[i] = ' '
      if (state === 'line') { if (c === '\n' || c === '\r') state = 'code' }
      else if (state === 'block') { if (c === '*' && n === '/') { out[i + 1] = ' '; i++; state = 'code' } }
      else if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === state) state = 'code'
    }
  }
  return out.join('')
}

function at(source, offset) {
  const before = source.slice(0, offset)
  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') }
}

export function scanJavaScript(source, file = '<input>') {
  const clean = maskLiteralText(source), issues = []
  for (const [pattern, rule, message] of [
    [/\?\.(?!\d)/g, 'OPTIONAL_CHAINING', 'Preview-incompatible optional chaining remains in JavaScript output'],
    [/\?\?(?![=])/g, 'NULLISH_COALESCING', 'Preview-incompatible nullish coalescing remains in JavaScript output'],
    [/\?\?=/g, 'NULLISH_ASSIGNMENT', 'Preview-incompatible nullish assignment remains in JavaScript output']
  ]) {
    let m
    while ((m = pattern.exec(clean))) issues.push({ file, ...at(source, m.index), rule, message })
  }
  return issues.sort((a,b) => a.line - b.line || a.column - b.column)
}

export function scanWxml(source, file = '<input>') {
  const issues = [], pattern = /<checkbox\s+[^>]*?\}\}["\']?\s*-group\b/g
  let m
  while ((m = pattern.exec(source))) issues.push({ file, ...at(source, m.index), rule:'BROKEN_CHECKBOX_GROUP', message:'Malformed checkbox-group opening tag (attribute followed by -group)' })
  return issues
}

export function checkConfig(project, tsconfig) {
  const issues = []
  const settings = project?.setting || {}, compiler = tsconfig?.compilerOptions || {}
  const target = String(compiler.target || '').toUpperCase()
  const modernTargets = ['ES2020','ES2021','ES2022','ES2023','ES2024','ESNEXT']
  if (settings.es6 === false && modernTargets.includes(target)) {
    issues.push({file:'project.config.json / tsconfig.json',line:1,column:1,rule:'BUILD_TARGET_MISMATCH',severity:'warning',message:`WeChat es6=false but TypeScript target=${target}; check actual preview JS and compiler transformation`})
  }
  if (settings.useCompilerPlugins && !settings.useCompilerPlugins.includes('typescript')) {
    issues.push({file:'project.config.json',line:1,column:1,rule:'TYPESCRIPT_PLUGIN_MISSING',severity:'warning',message:'TypeScript compiler plugin not selected' })
  }
  return issues
}

function walk(root, extensions) {
  if (!existsSync(root)) return []
  const results=[], queue=[root]
  while(queue.length) {
    const dir=queue.pop()
    for (const entry of readdirSync(dir,{withFileTypes:true})) {
      if (['node_modules','.git','miniprogram_npm','.wrangler','dist','.cache'].includes(entry.name)) continue
      const full=join(dir,entry.name)
      if(entry.isDirectory())queue.push(full)
      else if(entry.isFile() && extensions.includes(extname(entry.name))) results.push(full)
    }
  }
  return results
}

export function auditProject(root) {
  const findings=[], miniapp=join(root,'miniprogram')
  if (!existsSync(miniapp)) throw Error('Missing miniprogram directory: '+miniapp)
  const readJSON=p=>existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null
  const project=readJSON(join(root,'project.config.json'))
  const tsconfig=readJSON(join(root,'tsconfig.json'))
  findings.push(...checkConfig(project,tsconfig))
  let jsCount=0,wxmlCount=0
  for(const path of walk(miniapp,['.js','.wxml'])) {
    const name=relative(root,path).replaceAll('\\','/')
    const content=readFileSync(path,'utf8')
    if(path.endsWith('.js')) {jsCount++;findings.push(...scanJavaScript(content,name))}
    else {wxmlCount++;findings.push(...scanWxml(content,name))}
  }
  // A zero JS count is not a passing preview build: WeChat may emit JS only inside its IDE.
  if(jsCount===0) findings.push({file:'miniprogram/',line:1,column:1,rule:'NO_JS_OUTPUT',severity:'warning',message:'No .js files found to inspect. This does NOT validate WeChat preview output.'})
  const permission = readJSON(join(miniapp,'app.json'))?.permission?.['scope.userLocation']?.desc
  if(typeof permission==='string' && [...permission].length>30) findings.push({file:'miniprogram/app.json',line:1,column:1,rule:'LOCATION_DESCRIPTION_TOO_LONG',message:`Location permission description contains ${[...permission].length} characters; preview limit is 30`})
  return {findings,jsCount,wxmlCount}
}

const calledAsCLI=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)
if(calledAsCLI) {
  try {
    const root=resolve(process.argv[2] || resolve(fileURLToPath(new URL('..',import.meta.url))))
    const {findings,jsCount,wxmlCount}=auditProject(root)
    console.log(`Preview preflight: scanned ${jsCount} JS and ${wxmlCount} WXML files`)
    for(const f of findings) console.log(`${f.severity==='warning'?'WARN':'FAIL'} ${f.file}:${f.line}:${f.column} [${f.rule}] ${f.message}`)
    const errors=findings.filter(f=>f.severity!=='warning')
    console.log(`Result: ${errors.length} error(s), ${findings.length-errors.length} warning(s)`)
    if(errors.length) process.exitCode=1
  } catch(e) { console.error('Preview audit cannot finish:',e.message);process.exitCode=2 }
}
