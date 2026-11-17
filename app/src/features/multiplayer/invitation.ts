// 32 random bytes encoded as hex by the room RPC; never minted by the client.
export const INVITE_TOKEN=/^[a-f0-9]{64}$/;
export function invitationFromHash(hash:string):string|null {
  const match=/^#\/join\/([a-f0-9]{64})$/.exec(hash);return match?.[1]??null;
}
export function invitationUrl(base:string,token:string):string {
  if(!INVITE_TOKEN.test(token))throw new Error('Invalid invitation');
  const url=new URL(base);url.search='';url.hash=`/join/${token}`;return url.href;
}
export function clearInvitation(location:Pick<Location,'href'>,history:Pick<History,'replaceState'|'state'>) {
  if(!invitationFromHash(new URL(location.href).hash))return;
  const url=new URL(location.href);url.hash='/view/port';url.searchParams.delete('room');
  history.replaceState(history.state,'',url.href);
}
