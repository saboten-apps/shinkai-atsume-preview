export interface PlaceDraft {
  id:string; buildingId:string; x:number; z:number;
  name:string; description:string; url:string; photo:string;
  photographer:string; permission:string; credit:string;
}
export const DRAFT_KEY='shinkai_place_drafts_v1';
export function validateDraft(value:unknown):PlaceDraft {
  if(!value||typeof value!=='object')throw Error('下書きの形式を確認してください');
  const v=value as Record<string,unknown>;
  const text=(key:string,max:number,required=false)=>{const s=v[key];if(typeof s!=='string'||s.length>max||(required&&!s.trim()))throw Error(`${key}: 入力内容を確認してください`);return s.trim();};
  const d:PlaceDraft={id:text('id',80,true),buildingId:text('buildingId',120,true),x:Number(v.x),z:Number(v.z),name:text('name',100,true),description:text('description',2000),url:text('url',1000),photo:text('photo',300),photographer:text('photographer',200),permission:text('permission',1000),credit:text('credit',200)};
  if(!/^[a-z0-9][a-z0-9-]*$/.test(d.id)||!/^bldg_[a-zA-Z0-9_-]+$/.test(d.buildingId))throw Error('場所IDまたは建物IDが不正です');
  if(typeof v.x!=='number'||typeof v.z!=='number'||!Number.isFinite(d.x)||!Number.isFinite(d.z)||d.x< -1550||d.x>1450||d.z< -2580||d.z>1800)throw Error('場所の座標が範囲外です');
  if(d.url){const u=new URL(d.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('URLはhttp/httpsを指定してください');}
  if(d.photo&&!/^environment\/[a-zA-Z0-9_/-]+\.(webp|jpg|jpeg|png)$/.test(d.photo))throw Error('写真はenvironment/配下の画像パスを指定してください');
  return d;
}
export function parseDrafts(text:string):PlaceDraft[]{
 if(text.length>1000000)throw Error('ファイルが大きすぎます');
 const value=JSON.parse(text);if(value?.version!==1||!Array.isArray(value.drafts)||value.drafts.length>200)throw Error('対応していない下書きファイルです');
 const drafts=value.drafts.map(validateDraft) as PlaceDraft[];
 if(new Set(drafts.map(d=>d.id)).size!==drafts.length||new Set(drafts.map(d=>d.buildingId)).size!==drafts.length)throw Error('場所IDまたは建物IDが重複しています');
 return drafts;
}
export function serializeDrafts(drafts:PlaceDraft[]):string {const text=JSON.stringify({version:1,drafts:drafts.map(validateDraft)},null,2);parseDrafts(text);return text;}
