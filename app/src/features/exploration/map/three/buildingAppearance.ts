import * as THREE from 'three';
import { addPhotoSurfaceDetail } from './surfaceDetail';

/** Lift photographic shadows without changing the source photographs or the sky. */
export function brightenBuildingMaterial(material: THREE.MeshStandardMaterial) {
  material.roughness=.85;material.metalness=.05;
  if(!material.map)return;
  material.map.anisotropy=4;
  material.color.set(0xffffff);
  material.emissive.set(0xffffff);
  material.emissiveMap=material.map;
  material.emissiveIntensity=.18;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\ndiffuseColor.rgb += .018 * pow(vec3(1.0) - diffuseColor.rgb, vec3(2.0));');
    addPhotoSurfaceDetail(shader,'building');
  };
  material.customProgramCacheKey=()=> 'building-daylight-detail-v2';
}
