// Account-identity preparation. Not wired to login until backwards-compatible rollout is tested.
// The caller must supply a trusted, server-verified WeChat external subject.
// Existing auth_sessions and orders continue to use their legacy external_subject.
export async function resolveVerifiedWechatAccount(pool, externalSubject) {
  if (typeof externalSubject !== 'string' || !/^wx:wx[a-f0-9]{16}:[A-Za-z0-9_-]{1,128}$/.test(externalSubject)) {
    throw Error('unverified_wechat_identity')
  }
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialize competing first-logins for one verified subject.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[externalSubject])
    const existing=await client.query(
      "SELECT account_id FROM customer_login_identities WHERE provider='wechat' AND provider_subject=$1",
      [externalSubject]
    )
    if(existing.rows.length){
      await client.query('COMMIT')
      return existing.rows[0].account_id
    }
    const created=await client.query('INSERT INTO customer_accounts DEFAULT VALUES RETURNING id')
    const accountId=created.rows[0].id
    await client.query(
      "INSERT INTO customer_login_identities(account_id,provider,provider_subject,verified_at) VALUES($1,'wechat',$2,now())",
      [accountId,externalSubject]
    )
    await client.query('COMMIT')
    return accountId
  }catch(error){
    try{await client.query('ROLLBACK')}catch(_){}
    throw error
  }finally{client.release()}
}
