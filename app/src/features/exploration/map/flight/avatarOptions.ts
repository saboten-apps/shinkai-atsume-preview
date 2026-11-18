export const AVATARS=[{id:'mendako',ja:'メンダコ潜水士',en:'Flapjack diver'},{id:'jellyfish',ja:'クラゲ潜水士',en:'Jellyfish diver'},{id:'angler',ja:'アンコウ潜水士',en:'Anglerfish diver'}] as const;
export type AvatarId=typeof AVATARS[number]['id'];
export const PHOTO_POSES=[{id:'none',ja:'景色だけ',en:'Scenery only'},{id:'natural',ja:'正面',en:'Face camera'},{id:'wave',ja:'手を振る',en:'Wave'},{id:'cheer',ja:'ばんざい',en:'Celebrate'},{id:'salute',ja:'敬礼',en:'Salute'}] as const;
export type PhotoPose=typeof PHOTO_POSES[number]['id'];
export type VehicleId='none'|'submarine';
export const AVATAR_KEY='shinkai-avatar-v1';
export const isAvatar=(v:unknown):v is AvatarId=>AVATARS.some(a=>a.id===v);
export const isPhotoPose=(v:unknown):v is PhotoPose=>PHOTO_POSES.some(a=>a.id===v);
export const isVehicle=(v:unknown):v is VehicleId=>v==='none'||v==='submarine';
export function loadAvatar():AvatarId{try{const id=localStorage.getItem(AVATAR_KEY);return isAvatar(id)?id:'mendako';}catch{return 'mendako';}}
