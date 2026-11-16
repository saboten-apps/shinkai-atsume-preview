export async function makeSceneryPhoto(image:string,en:boolean):Promise<Blob> {
  const source=new Image();source.src=image;await source.decode();
  // Preserve the captured composition, including portrait views. No forced landscape crop.
  const scale=Math.min(1,1600/Math.max(source.naturalWidth,source.naturalHeight));
  const width=Math.max(1,Math.round(source.naturalWidth*scale)),height=Math.max(1,Math.round(source.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+Math.round(width*.19);
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
  ctx.fillStyle='#102b40';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,width,height);
  ctx.strokeStyle='#eadfc7';ctx.lineWidth=Math.max(1,width*.002);ctx.strokeRect(8,8,width-16,height-16);
  const pad=width*.035;ctx.fillStyle='#f5f0e6';ctx.font=`bold ${width*.037}px sans-serif`;
  ctx.fillText(en?'Numazu • Shinkai Atsume':'沼津の景色 · 深海あつめ',pad,height+width*.05);
  ctx.font=`${width*.028}px sans-serif`;ctx.fillText('うみまちラボ',pad,height+width*.09);
  ctx.font=`${width*.018}px sans-serif`;
  ctx.fillText(en?'Virtual scenery · not a real-world photograph':'バーチャルの景色（現地の写真ではありません）',pad,height+width*.125);
  ctx.font=`${width*.015}px sans-serif`;
  ctx.fillText('出典：国土交通省 PLATEAU 沼津市 2021/2023年度・地理院タイルを加工',pad,height+width*.158,width-pad*2);
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image export failed')),'image/png'));
}
