import test from 'node:test'
import assert from 'node:assert/strict'
import {assessPhoneRecovery} from '../src/customerPhoneRecoveryPolicy.mjs'
test('reassigned phone always requires human review, never merges accounts',()=>{
 for(const flags of [{},{hasActiveAccountSession:true,hasVerifiedWechat:true,newPhoneVerified:true,oldPhoneAvailable:true}]){
  const decision=assessPhoneRecovery({...flags,phoneBelongsToOtherAccount:true})
  assert.equal(decision.action,'manual_review')
  assert.equal(decision.allowAutomaticMerge,false)
 }
})
test('possession of a new phone alone does not recover another account',()=>{
 assert.deepEqual(assessPhoneRecovery({newPhoneVerified:true}),{action:'manual_review',reason:'account_ownership_unproven',allowAutomaticMerge:false})
})
test('known WeChat identity without new phone verification cannot change phone',()=>{
 assert.equal(assessPhoneRecovery({hasVerifiedWechat:true}).action,'verify_new_phone')
})
test('verified session and new phone still demand separate fresh step-up proof',()=>{
 assert.equal(assessPhoneRecovery({hasActiveAccountSession:true,newPhoneVerified:true,oldPhoneAvailable:true}).action,'step_up_required')
})
test('lost old phone and no WeChat requires extra account verification',()=>{
 const d=assessPhoneRecovery({hasActiveAccountSession:true,newPhoneVerified:true})
 assert.equal(d.reason,'old_phone_unavailable')
})
test('all normal-path prerequisites still do not authorize rotation automatically',()=>{
 const d=assessPhoneRecovery({hasActiveAccountSession:true,hasVerifiedWechat:true,newPhoneVerified:true,oldPhoneAvailable:true})
 assert.equal(d.action,'step_up_required')
 assert.equal(d.allowAutomaticMerge,false)
})
