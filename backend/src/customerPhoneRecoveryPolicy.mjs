// Internal policy only; no route, SMS provider, or bypass mechanism.
// Recycled phone possession must never automatically grant an existing account.
export function assessPhoneRecovery({hasActiveAccountSession=false,hasVerifiedWechat=false,newPhoneVerified=false,oldPhoneAvailable=false,phoneBelongsToOtherAccount=false}={}){
 if(phoneBelongsToOtherAccount)return {action:'manual_review',reason:'phone_already_bound',allowAutomaticMerge:false}
 if(!hasActiveAccountSession&&!hasVerifiedWechat)return {action:'manual_review',reason:'account_ownership_unproven',allowAutomaticMerge:false}
 if(!newPhoneVerified)return {action:'verify_new_phone',reason:'new_phone_unverified',allowAutomaticMerge:false}
 if(!oldPhoneAvailable&&!hasVerifiedWechat)return {action:'step_up_required',reason:'old_phone_unavailable',allowAutomaticMerge:false}
 return {action:'step_up_required',reason:'fresh_account_proof_required',allowAutomaticMerge:false}
}
