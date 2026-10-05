/** Expected delivery secrets never travel back to the courier who must supply proof. */
export function riderResponse(value:any):any {
  if(Array.isArray(value))return value.map(riderResponse);
  if(!value||typeof value!=='object'||value instanceof Date)return value;
  const result:Record<string,unknown>={};
  const ended=['DELIVERED','COMPLETED','CANCELLED'].includes(value.status);
  for(const [key,item] of Object.entries(value)) {
    if(['delivery_otp','deliveryOtp','expectedOtp'].includes(key))continue;
    if(key==='proof_value' && value.type==='OTP')continue;
    if(ended && ['customer_phone','customer_name','dropoff_location','dropoff_address_text','delivery_instructions'].includes(key))continue;
    result[key]=riderResponse(item);
  }
  return result;
}
