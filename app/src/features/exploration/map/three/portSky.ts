import * as THREE from 'three';

export function createPortSky(scene: THREE.Scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(47000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 direction;
        void main() {
          direction = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 direction;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                     mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
        }
        void main() {
          vec3 d = normalize(direction);
          float y = max(0.0, d.y);
          vec3 color = mix(vec3(.76,.88,.94), vec3(.27,.56,.83), smoothstep(0.0,.8,y));
          vec2 p = d.xz / max(.07, y) * 2.5 + vec2(2.7,1.3);
          float cloud = .58*noise(p) + .27*noise(p*2.1) + .15*noise(p*4.4);
          float cover = smoothstep(.54,.73,cloud) * smoothstep(.035,.22,y);
          color = mix(color, vec3(.98,.98,.96), cover * .93);
          gl_FragColor = vec4(color,1.0);
        }
      `,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const airFog = new THREE.FogExp2(0xc3dce8, .00035);
  const waterFog = new THREE.FogExp2(0x27546b, .012);
  const waterColor = new THREE.Color(0x27546b);
  function setUnderwater(underwater: boolean) {
    sky.visible = !underwater;
    scene.userData.underwater=underwater;
    for(const object of scene.children)if(object.userData.regionalLandscape)object.visible=!underwater;
    scene.fog = underwater ? waterFog : airFog;
    scene.background = underwater ? waterColor : null;
  }
  setUnderwater(false);

  return {
    setUnderwater,
    dispose() {
      scene.remove(sky);
      sky.geometry.dispose();
      sky.material.dispose();

    },
  };
}
