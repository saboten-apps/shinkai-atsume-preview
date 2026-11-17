import * as THREE from 'three';

export function createPortSky(scene: THREE.Scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(47000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms:{skyTop:{value:new THREE.Color(0x4590d4)},skyHorizon:{value:new THREE.Color(0xc2e0f0)},cloudTint:{value:new THREE.Color(0xfafaf5)},nightAmount:{value:0},sunDirection:{value:new THREE.Vector3(.4,.8,.2).normalize()},sunTint:{value:new THREE.Color(0xfff7ed)}},
      vertexShader: `
        varying vec3 direction;
        void main() {
          direction = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 direction;
        uniform vec3 skyTop,skyHorizon,cloudTint,sunDirection,sunTint;
        uniform float nightAmount;
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
          vec3 color = mix(skyHorizon,skyTop,smoothstep(0.0,.8,y));
          vec2 p = d.xz / max(.07, y) * 2.5 + vec2(2.7,1.3);
          float cloud = .58*noise(p) + .27*noise(p*2.1) + .15*noise(p*4.4);
          float cover = smoothstep(.54,.73,cloud) * smoothstep(.035,.22,y);
          color = mix(color, cloudTint, cover * .93);
          float sun = smoothstep(.9994,.99985,dot(d,sunDirection));
          color += sunTint*sun*(1.0-nightAmount)*2.0;
          float moon=smoothstep(.9992,.99975,dot(d,normalize(vec3(-.35,.65,.4))));
          vec2 stars=floor(d.xz/max(.12,d.y)*420.0);
          float sparkle=step(.9985,hash(stars))*smoothstep(.1,.5,d.y)*(1.0-cover);
          color += vec3(.65,.75,.9)*nightAmount*(moon*.6+sparkle*.4);
          gl_FragColor = vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
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
    for(const object of scene.children){if(object.userData.regionalLandscape)object.visible=!underwater;if(object.userData.virtualWaterBed)object.visible=underwater;}
    scene.fog = underwater ? waterFog : airFog;
    scene.background = underwater ? waterColor : null;
  }
  setUnderwater(false);

  return {
    setUnderwater,
    setAtmosphere(colors:{top:THREE.Color;horizon:THREE.Color;cloud:THREE.Color;fog:THREE.Color;sun:THREE.Color;night:number;density:number;sunPosition:THREE.Vector3}){
      const u=sky.material.uniforms;u.skyTop.value.copy(colors.top);u.skyHorizon.value.copy(colors.horizon);u.cloudTint.value.copy(colors.cloud);u.nightAmount.value=colors.night;u.sunDirection.value.copy(colors.sunPosition).normalize();u.sunTint.value.copy(colors.sun);
      airFog.color.copy(colors.fog);airFog.density=colors.density;
    },
    dispose() {
      scene.remove(sky);
      sky.geometry.dispose();
      sky.material.dispose();

    },
  };
}
