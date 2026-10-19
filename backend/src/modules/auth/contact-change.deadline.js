// hrtime uses the same OS monotonic clock in the parent and its worker threads.
export const monotonicNow=()=>process.hrtime.bigint();
export const remainingMilliseconds=deadlineNs=>Number(deadlineNs-monotonicNow())/1e6;
export function deadlineFromDatabase(remainingMs,sentNs,{maxMs,ceilingNs}={}) {
  const remaining=Number(remainingMs);
  if(!Number.isFinite(remaining)||!Number.isFinite(maxMs))return null;
  const budget=Math.floor(Math.min(remaining,maxMs));
  if(!Number.isFinite(budget)||budget<=0||typeof sentNs!=='bigint')return null;
  // Charge the ENTIRE query round trip, even time preceding PostgreSQL's clock sample.
  const deadline=sentNs+BigInt(budget)*1000000n;
  return typeof ceilingNs==='bigint'&&ceilingNs<deadline?ceilingNs:deadline;
}
