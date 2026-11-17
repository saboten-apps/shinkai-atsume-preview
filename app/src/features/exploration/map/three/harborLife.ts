import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {SEA} from '../flight/freeFlight';

type WaterQuery=(x:number,z:number)=>boolean;
/** Fictional harbor activity, placed against the source shoreline. No NPC AI,
 * physics, textures, shadows, DOM labels or per-frame mesh allocation. */
export function createHarborLife(scene:THREE.Scene,terrain:THREE.Group,isWater:WaterQuery){
 const root=new THREE.Group();root.name='harbor-life';root.userData.fictionalActivity=true;scene.add(root);
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const painted=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85});materials.push(painted);
 function color(g:THREE.BufferGeometry,c:number){const rgb=new THREE.Color(c),a=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<a.length;i+=3){a[i]=rgb.r;a[i+1]=rgb.g;a[i+2]=rgb.b;}g.setAttribute('color',new THREE.BufferAttribute(a,3));return g;}
 function batch(build:(parts:THREE.BufferGeometry[])=>void){const parts:THREE.BufferGeometry[]=[];build(parts);const compatible=parts.map(p=>p.index?p.toNonIndexed():p);const g=mergeGeometries(compatible)!;new Set([...parts,...compatible]).forEach(p=>p.dispose());geometries.push(g);return g;}
 function box(parts:THREE.BufferGeometry[],c:number,x:number,y:number,z:number,w:number,h:number,d:number){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts.push(color(g,c));}
 function bar(parts:THREE.BufferGeometry[],c:number,a:THREE.Vector3,b:THREE.Vector3,r:number){const g=new THREE.CylinderGeometry(r,r,a.distanceTo(b),5);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());parts.push(color(g,c));}
 const body=batch(p=>{
  for(const side of [-1,1]){box(p,0x384e5d,side*.15,.4,0,.22,.8,.26);box(p,0x29383d,side*.15,.09,.07,.25,.18,.42);}
  box(p,0x548b87,0,1.05,0,.65,.65,.36);
  const head=new THREE.SphereGeometry(.22,8,6);head.translate(0,1.6,0);p.push(color(head,0xdab992));
  box(p,0xe0d7b8,0,1.8,0,.55,.11,.48);box(p,0xe0d7b8,0,1.86,-.02,.38,.12,.34);
  box(p,0x406873,0,.97,-.23,.38,.45,.16);
 });
 const fishing=batch(p=>{
  bar(p,0x548b87,new THREE.Vector3(-.3,1.25,0),new THREE.Vector3(-.12,1.13,.52),.09);
  bar(p,0x548b87,new THREE.Vector3(.3,1.25,0),new THREE.Vector3(.05,1.17,.65),.09);
  bar(p,0xdab992,new THREE.Vector3(-.12,1.13,.52),new THREE.Vector3(0,1.2,.73),.065);
  bar(p,0x514b38,new THREE.Vector3(0,1.2,.45),new THREE.Vector3(0,2.05,3.65),.022);
 });
 const lineMat=new THREE.LineBasicMaterial({color:0xdbddd0,transparent:true,opacity:.65});materials.push(lineMat);
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);terrain.updateMatrixWorld(true);
 const fishers:Array<{group:THREE.Group;rod:THREE.Mesh;line:THREE.Line;phase:number}>=[];
 const waterOrigin={x:-100,z:-140};
 for(const [index,[dx,dz]] of [[-1,0],[0,-1],[1,0]].entries()){
  // Find the first dry point beyond an unobstructed run of harbor water.
  let shore:THREE.Vector3|undefined;
  if(!isWater(waterOrigin.x,waterOrigin.z))break;
  for(let d=8;d<155;d+=2){const x=waterOrigin.x+dx*d,z=waterOrigin.z+dz*d;if(!isWater(x,z)&&!isWater(x+dx*2,z+dz*2)){shore=new THREE.Vector3(x+dx*1.5,0,z+dz*1.5);break;}}
  if(!shore)continue;
  ray.set(shore.clone().setY(140),down);const hit=ray.intersectObject(terrain,true)[0];if(!hit)continue;
  shore.y=hit.point.y+.06;
  // Require the rod tip to reach water; otherwise omit this character.
  if(!isWater(shore.x-dx*4,shore.z-dz*4))continue;
  const group=new THREE.Group();group.name=`harbor-angler-${index+1}`;group.position.copy(shore);group.rotation.y=Math.atan2(-dx,-dz);group.add(new THREE.Mesh(body,painted));
  const rod=new THREE.Mesh(fishing,painted);group.add(rod);
  const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,2.05,3.65),new THREE.Vector3(0,SEA-shore.y+.08,4)]);geometries.push(g);
  const line=new THREE.Line(g,lineMat);group.add(line);root.add(group);group.visible=false;fishers.push({group,rod,line,phase:index*2.1});
 }
 const boatGeometry=batch(p=>{
  // Tapered bow/stern hull; bow is +Z.
  const outline=[[-1.05,-2.4],[1.05,-2.4],[1.2,1.8],[.65,3],[0,3.5],[-.65,3],[-1.2,1.8]];
  const shape=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
  const hull=new THREE.ExtrudeGeometry(shape,{depth:.8,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.15,bevelThickness:.12});hull.rotateX(-Math.PI/2);p.push(color(hull,0xe7e2ce));
  box(p,0x447981,0,.9,.2,2,.12,4.3);box(p,0xdfd9c5,0,1.5,-.5,1.55,1.15,1.7);
  box(p,0x456676,0,1.64,.37,1.3,.55,.035);box(p,0x456676,.79,1.64,-.5,.035,.55,1.4);box(p,0x456676,-.79,1.64,-.5,.035,.55,1.4);
  box(p,0xe3a95b,0,2.15,-.5,1.8,.16,2);bar(p,0x727e7b,new THREE.Vector3(0,2.2,-.8),new THREE.Vector3(0,3.1,-.8),.045);
  for(const x of [-.9,.9])for(const z of [-1.5,1.4])box(p,0x263b3f,x,.45,z,.28,.4,.55);
 });
 const boats:Array<{mesh:THREE.Mesh;origin:THREE.Vector3;phase:number;moving:boolean;route?:{a:THREE.Vector3;b:THREE.Vector3}}>=[];
 // Check the full footprint and complete route before showing a boat.
 const wet=(x:number,z:number)=>[[0,0],[-4,-4],[4,-4],[-4,4],[4,4]].every(([a,b])=>isWater(x+a,z+b));
 for(const [index,[x,z]] of [[-125,-130],[-80,-185],[-155,-80],[-100,-140]].entries()){
  if(!wet(x,z))continue;
  const mesh=new THREE.Mesh(boatGeometry,painted);mesh.name=`harbor-boat-${index+1}`;mesh.position.set(x,SEA-.25,z);mesh.rotation.y=index*.8;mesh.visible=false;root.add(mesh);
  const a=new THREE.Vector3(x-15,SEA-.25,z),b=new THREE.Vector3(x+15,SEA-.25,z);
  const moving=index===3&&Array.from({length:31},(_,i)=>wet(a.x+i,a.z)).every(Boolean);
  boats.push({mesh,origin:mesh.position.clone(),phase:index*1.8,moving,route:moving?{a,b}:undefined});
 }
 let disposed=false;
 return{root,counts:{anglers:fishers.length,boats:boats.length,movingBoats:boats.filter(b=>b.moving).length},
  update(time:number,viewer:THREE.Vector3,reducedMotion=false){
   if(disposed)return;
   root.visible=!scene.userData.underwater&&viewer.y<210&&Math.hypot(viewer.x+100,viewer.z+120)<420;if(!root.visible)return;
   for(const f of fishers){f.group.visible=viewer.distanceToSquared(f.group.position)<140*140;if(!f.group.visible)continue;
    const angle=reducedMotion?0:Math.sin(time*.6+f.phase)*.025+Math.pow(Math.max(0,Math.sin(time*.16+f.phase)),12)*.18;
    f.rod.rotation.x=-angle;
    const position=f.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0,0,2.05*Math.cos(angle)+3.65*Math.sin(angle),-2.05*Math.sin(angle)+3.65*Math.cos(angle));position.needsUpdate=true;
   }
   for(const b of boats){b.mesh.visible=viewer.distanceToSquared(b.origin)<310*310;if(!b.mesh.visible)continue;
    if(b.route&&!reducedMotion){const t=(1-Math.cos(time*.035))*.5;b.mesh.position.lerpVectors(b.route.a,b.route.b,t);b.mesh.rotation.y=Math.sin(time*.035)>=0?Math.PI/2:-Math.PI/2;}
    else b.mesh.position.copy(b.origin);
    b.mesh.position.y=SEA-.25+(reducedMotion?0:Math.sin(time*.85+b.phase)*.08);b.mesh.rotation.z=reducedMotion?0:Math.sin(time*.65+b.phase)*.025;
   }
  },
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());},
 };
}
