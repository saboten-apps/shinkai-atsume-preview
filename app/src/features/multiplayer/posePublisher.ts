import { validLocalPose, WORLD_VERSION, type LocalPose, type PlayerPose } from './protocol';
export interface PoseChannel {
  state:string;
  socket:{isConnected:()=>boolean};
  send:(message:{type:'broadcast';event:'pose';payload:PlayerPose})=>Promise<unknown>;
}
const PERIOD=1000/3;
function changed(a:LocalPose,b:LocalPose) {
  return a.avatar!==b.avatar||a.pose!==b.pose||a.vehicle!==b.vehicle||a.active!==b.active || a.state!==b.state || Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>.02
    || Math.abs(Math.atan2(Math.sin(a.yaw-b.yaw),Math.cos(a.yaw-b.yaw)))>.01
    || Math.hypot(a.vx-b.vx,a.vy-b.vy,a.vz-b.vz)>.05;
}
/** No queued poses. Even if subscription status is stale, inspect the socket in the same
 * JS task as send(): supabase-js 2.86 falls back to HTTP when _canPush() is false. */
export class PosePublisher {
  private subscribed=false;
  private nextAt=0;
  private lastAt=-Infinity;
  private previous:LocalPose|null=null;
  private seq=0;
  private generation=0;
  private inFlight=false;
  constructor(private channel:PoseChannel, private id:string, private session:string) {}
  setStatus(status:string) {
    this.subscribed=status==='SUBSCRIBED';this.generation++;this.inFlight=false;
    this.previous=null;this.nextAt=0;this.lastAt=-Infinity;
  }
  tick(now:number, pose:LocalPose, others:number, visible=true) {
    if (!this.subscribed || this.channel.state!=='joined' || !this.channel.socket.isConnected()
      || others<1 || !visible) { this.previous=null;this.nextAt=0;return; }
    if (this.inFlight || !validLocalPose(pose)) return;
    // One inactive transition hides an already visible avatar; no inactive heartbeat.
    if (!pose.active && !this.previous?.active) return;
    const moving=pose.speed>.05;
    if (now+.001<this.nextAt) return;
    if (this.previous && !moving && !changed(pose,this.previous) && now-this.lastAt<3000) return;
    const generation=this.generation;
    const payload:PlayerPose={...pose,id:this.id,session:this.session,world:WORLD_VERSION,seq:++this.seq};
    // Advance the deadline rather than accumulating a catch-up queue after a delayed timer.
    this.nextAt=this.nextAt>0?this.nextAt+(Math.floor(Math.max(0,now-this.nextAt)/PERIOD)+1)*PERIOD:now+PERIOD;
    this.lastAt=now;this.previous={...pose};this.inFlight=true;
    void this.channel.send({type:'broadcast',event:'pose',payload}).then(result=>{
      if(generation!==this.generation)return;
      if(result!=='ok')this.previous=null;
    }).catch(()=>{if(generation===this.generation)this.previous=null;}).finally(()=>{
      if(generation===this.generation)this.inFlight=false;
    });
  }
}
