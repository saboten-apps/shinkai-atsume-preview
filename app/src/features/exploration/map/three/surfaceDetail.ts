import type * as THREE from 'three';
type Shader=Parameters<THREE.Material['onBeforeCompile']>[0];

/** Meter-scaled, filtered microdetail. Never invent facade windows or road markings. */
export function addPhotoSurfaceDetail(shader:Shader,kind:'building'|'ground') {
  shader.vertexShader='varying vec3 vDetailWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvDetailWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  const bump=kind==='building'?`
    vec3 detailPerturb(vec3 surfPos,vec3 normal,float height){
      vec3 sx=dFdx(surfPos),sy=dFdy(surfPos);
      vec3 r1=cross(sy,normal),r2=cross(normal,sx);
      float determinant=dot(sx,r1);
      vec3 gradient=sign(determinant)*(dFdx(height)*r1+dFdy(height)*r2);
      return normalize(max(abs(determinant),.00000001)*normal-gradient);
    }
  `:'';
  shader.fragmentShader=`
    varying vec3 vDetailWorld;
    float detailHash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
    float detailNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(detailHash(i),detailHash(i+vec2(1,0)),f.x),mix(detailHash(i+vec2(0,1)),detailHash(i+vec2(1,1)),f.x),f.y);}
    ${bump}
  `+shader.fragmentShader;
  const coordinates=kind==='ground'?'vec2 detailUv=vDetailWorld.xz;':`
    vec3 detailAxis=abs(normalize(cross(dFdx(vDetailWorld),dFdy(vDetailWorld))));
    vec2 detailUv=detailAxis.y>max(detailAxis.x,detailAxis.z)?vDetailWorld.xz:(detailAxis.x>detailAxis.z?vDetailWorld.zy:vDetailWorld.xy);`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    ${coordinates}
    float detailPixel=max(length(dFdx(detailUv)),length(dFdy(detailUv)));
    float detailNear=1.0-smoothstep(35.0,85.0,distance(cameraPosition,vDetailWorld));
    float detailGrain=0.0;
    if(detailNear>.001){
      detailGrain=(detailNoise(detailUv*35.0)*2.0-1.0)*(1.0-smoothstep(.012,.06,detailPixel));
      detailGrain+=(detailNoise(detailUv*160.0+17.3)*2.0-1.0)*.3*(1.0-smoothstep(.0015,.006,detailPixel));
    }
    detailGrain*=detailNear;
    diffuseColor.rgb*=1.0+detailGrain*${kind==='ground'?'.075':'.018'};
  `);
  if(kind==='building'){
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=detailPerturb(-vViewPosition,normal,detailGrain*.0015);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+detailGrain*.06,.55,1.0);');
  }
}
