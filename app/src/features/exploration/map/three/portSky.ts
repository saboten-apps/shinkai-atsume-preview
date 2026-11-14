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

  // 広い裾野と雪の境界を持つ富士山の遠景。地形や衝突判定には使わない。
  const profile = [[8900, 0], [7200, 420], [5100, 980], [3450, 1590],
    [2470, 2160], [1770, 2700], [1180, 3230], [710, 3630], [350, 3710]];
  const geometry = new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), 64);
  const positions = geometry.getAttribute('position');
  const color = new THREE.Color();
  const rock = new THREE.Color(0x7499b2);
  const snow = new THREE.Color(0xf4f7f4);
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const ridge = 1 + .035 * Math.sin(angle * 9) + .025 * Math.cos(angle * 13);
    positions.setXYZ(i, x * ridge, y + Math.sin(angle * 3) * Math.min(y, 160) * .25, z * ridge);
    const snowline = 2710 + 230 * Math.sin(angle * 7) + 110 * Math.cos(angle * 13);
    color.copy(rock).lerp(snow, THREE.MathUtils.smoothstep(y, snowline - 80, snowline + 140));
    color.multiplyScalar(.95 + .055 * Math.cos(angle * 11));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mountain = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, side: THREE.DoubleSide,
  }));
  mountain.position.set(-4000, 30, -27300);
  scene.add(mountain);

  const airFog = new THREE.FogExp2(0xc3dce8, .00035);
  const waterFog = new THREE.FogExp2(0x27546b, .012);
  const waterColor = new THREE.Color(0x27546b);
  function setUnderwater(underwater: boolean) {
    sky.visible = mountain.visible = !underwater;
    scene.fog = underwater ? waterFog : airFog;
    scene.background = underwater ? waterColor : null;
  }
  setUnderwater(false);

  return {
    setUnderwater,
    dispose() {
      scene.remove(sky, mountain);
      sky.geometry.dispose();
      sky.material.dispose();
      geometry.dispose();
      mountain.material.dispose();
    },
  };
}
