export function money(n:number):string{return n.toFixed(2)}
export function minimumShortfallCents(totalText:string,minimumCents:number):number {
  const subtotal=Math.round(Number(totalText)*100)
  if(!Number.isSafeInteger(minimumCents)||minimumCents<0||!Number.isSafeInteger(subtotal)||subtotal<0)throw new Error('invalid_minimum_amount')
  return Math.max(0,minimumCents-subtotal)
}
