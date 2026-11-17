import * as THREE from 'three';

/** Ground heights are real DEM samples; colors, snow line and haze are scenery. */
export function styleRegionalLandscape(group: THREE.Group) {
  group.name='numazu-regional-landscape';
  group.userData.regionalLandscape=true;
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    object.castShadow=false;object.receiveShadow=false;
    const materials=(Array.isArray(object.material)?object.material:[object.material]) as THREE.Material[];
    for(const material of materials){
      if(material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial)material.fog=false;
      material.onBeforeCompile=shader=>{
        const haze={value:new THREE.Color(0xb8d0d9)};material.userData.regionalHazeUniform=haze;shader.uniforms.regionalHazeColor=haze;
        shader.vertexShader='varying vec3 vRegionalWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvRegionalWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
        shader.fragmentShader='varying vec3 vRegionalWorld;\nuniform vec3 regionalHazeColor;\n'+shader.fragmentShader;
        // The detailed coastal DEM replaces the coarse regional ground here.
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif(vRegionalWorld.x > -1750.0 && vRegionalWorld.x < 1480.0 && vRegionalWorld.z > -2700.0 && vRegionalWorld.z < 1900.0) discard;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\nfloat haze=1.0-exp(-pow(distance(cameraPosition,vRegionalWorld)*.000026,1.35));\ngl_FragColor.rgb=mix(gl_FragColor.rgb,regionalHazeColor,haze);');
      };
      material.customProgramCacheKey=()=> 'regional-haze-coast-v2';
    }
  });
}
