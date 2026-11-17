import * as THREE from 'three';
import {cameraHeading,CITY_LANDMARKS,COMPASS_JA,COMPASS_EN} from '../../navigation';
export function createNavigationHud(root:HTMLElement,camera:THREE.Camera,en:boolean){
 const rose=root.querySelector<HTMLElement>('[data-compass-rose]')!,letters=[...root.querySelectorAll<HTMLElement>('[data-compass-letter]')],heading=root.querySelector<HTMLElement>('[data-compass-heading]')!,compass=root.querySelector<HTMLElement>('.world-compass')!;
 const slots=[...root.querySelectorAll<HTMLElement>('.world-landmark-label')],direction=new THREE.Vector3(),point=new THREE.Vector3();let last=0,angle=0;
 return {update(viewer:THREE.Vector3,showLandmarks:boolean){
  camera.getWorldDirection(direction);const value=cameraHeading(direction.x,direction.z,last);angle+=(value-last+540)%360-180;last=value;
  rose.style.transform=`rotate(${-angle}deg)`;letters.forEach(el=>el.style.transform=`rotate(${angle}deg)`);
  const text=(en?COMPASS_EN:COMPASS_JA)[Math.round(value/45)%8];heading.textContent=text;compass.setAttribute('aria-label',`${en?'Facing':'向いている方角'}：${text}`);
  slots.forEach(el=>{el.hidden=true;});if(!showLandmarks)return;
  const rootBox=root.getBoundingClientRect(),{width,height}=rootBox;if(!width||!height)return;
  const obstacles=[compass,...(root.closest('.exploration-page')??root.parentElement)?.querySelectorAll<HTMLElement>('.flight-instructions:not([hidden]),.search-world-status,.map-loading-indicator,.search-toolbar,.search-detector,.search-world-toolbar')??[]].map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height).map(r=>({left:r.left-rootBox.left,right:r.right-rootBox.left,top:r.top-rootBox.top,bottom:r.bottom-rootBox.top}));
  const candidates=CITY_LANDMARKS.map(site=>({site,distance:Math.hypot(site.x-viewer.x,site.z-viewer.z)})).filter(({site,distance})=>distance>35&&distance<('far'in site?60000:1100)).sort((a,b)=>a.distance-b.distance);
  const boxes:Array<{x:number;y:number}>=[];let index=0;
  for(const {site,distance} of candidates){
   point.set(site.x,site.y,site.z).project(camera);if(point.z<-1||point.z>1)continue;
   const x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;
   if(x<72||x>width-72||y<100||y>height*.67)continue;
   if(obstacles.some(r=>x+72>r.left-5&&x-72<r.right+5&&y>r.top-5&&y-52<r.bottom+5))continue;
   if(boxes.some(b=>Math.abs(b.x-x)<145&&Math.abs(b.y-y)<52))continue;
   const slot=slots[index++];slot.style.left=`${x}px`;slot.style.top=`${y}px`;slot.querySelector('b')!.textContent=en?site.nameEn:site.name;slot.querySelector('small')!.textContent=distance>=1000?`${(distance/1000).toFixed(1)} km`:`${Math.round(distance)} m`;slot.dataset.landmarkId=site.id;slot.hidden=false;boxes.push({x,y});if(index===slots.length)break;
  }
 }};
}
