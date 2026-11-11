import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const app=JSON.parse(read('../../miniprogram/app.json'))
const targets=JSON.parse(read('../../apps/build-targets.json'))
const admin=read('../../miniprogram/pages/admin/admin.wxml')
const login=read('../../miniprogram/pages/merchant-login/merchant-login.ts')
const loginUI=read('../../miniprogram/pages/merchant-login/merchant-login.wxml')
const pageJSON=JSON.parse(read('../../miniprogram/pages/merchant-login/merchant-login.json'))

test('member-only page removed from all builds without changing account link',()=>{
 const old='pages/merchant-members/merchant-members'
 assert(!app.pages.includes(old))
 assert(!targets.targets.combined.pages.includes(old))
 assert(!targets.targets.merchant.pages.includes(old))
 assert(!targets.pages[old])
 assert.deepEqual(app.pages,targets.targets.combined.pages)
 for(const ext of ['ts','wxml','wxss','json']){
  assert(!existsSync(resolve(fileURLToPath(new URL('../../miniprogram/pages/merchant-login/merchant-login.ts',import.meta.url)),'../../merchant-members/merchant-members.'+ext)))
 }
 assert.doesNotMatch(admin,/url="\/pages\/merchant-members\//)
 assert.match(admin,/url="\/pages\/merchant-login\/merchant-login"/)
 assert.equal(pageJSON.navigationBarTitleText,'账号与权限')
})

test('account and permissions includes owner's member invitation, listing and revocation',()=>{
 assert.match(loginUI,/wx:if="{{authenticated && canInvite}}"/)
 for(const action of ['createMemberInvitation','copyMemberInvitation','refreshMembers','removeManagedMember'])
  assert(login.includes(action)&&loginUI.includes('bindtap="'+action+'"'),action)
 assert.match(loginUI,/open-type="share"/)
 assert.match(login,/onShareAppMessage\(/)
 assert.match(login,/member-invitations/)
 assert.match(login,/\/members/)
 assert.match(login,/method:'DELETE'/)
 assert.match(login,/member\.isSelf\|\|member\.role==='owner'/)
 assert.match(loginUI,/!item\.isSelf && item\.role !== 'owner'/)
 assert.match(login,/store\?\.role==='owner'/)
})

test('invitation redemption and session safeguards retained',()=>{
 assert.match(login,/redeemMemberInvitation\(/)
 assert.match(loginUI,/确认加入商家团队/)
 assert.match(login,/requestIdentity\(\)/)
 assert.match(login,/getSessionToken\(\)/)
 assert.match(login,/this\.membersSerial\+\+/)
 assert.match(login,/this\.data\.canInvite/)
 assert.match(login,/this\.data\.authenticated/)
 assert.match(login,/logout\(\)/)
})
