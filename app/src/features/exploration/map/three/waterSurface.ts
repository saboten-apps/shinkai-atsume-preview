import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** A single shared, small reflection pass for harbor, sea and river. */
export function createWaterSurface(scene: THREE.Scene) {
  const time={value:0};
  const eye={value:new THREE.Vector3()};
  const reflectionMatrix={value:new THREE.Matrix4()};
  const hasReflection={value:0};
  const shore={value:null as THREE.Texture|null};
  const shoreBounds={value:new THREE.Vector4()};
  const hasShore={value:0};
  const shader={
    name:'NumazuWater',
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
      color:{value:new THREE.Color(0x0e4558)},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},
      uSkyTop:{value:new THREE.Color(0x4590d4)},uSkyHorizon:{value:new THREE.Color(0xc2e0f0)},uNight:{value:0},uTime:time,uEye:eye,uReflectionMatrix:reflectionMatrix,uHasReflection:hasReflection,
      uLandMask:shore,uShoreBounds:shoreBounds,uHasShore:hasShore,
      uRiverColor:{value:new THREE.Color(0x345e59)},
      uSun:{value:new THREE.Vector3(300,500,200).normalize()},
    }]),
    vertexShader:`
      uniform mat4 uReflectionMatrix;
      varying vec3 vWorld;
      varying vec4 vMirror;
      #include <common>
      #include <fog_pars_vertex>
      void main(){
        vec4 world=modelMatrix*vec4(position,1.0);
        vWorld=world.xyz;vMirror=uReflectionMatrix*world;
        vec4 mvPosition=viewMatrix*world;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      uniform vec3 color,uEye,uSun,uRiverColor,uSkyTop,uSkyHorizon;
      uniform float uNight;
      uniform float uTime,uHasReflection,uHasShore;
      uniform sampler2D tDiffuse,uLandMask;
      uniform vec4 uShoreBounds;
      varying vec3 vWorld;
      varying vec4 vMirror;
      #include <common>
      #include <fog_pars_fragment>
      float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=vWorld.xz;
        float riverAmount=smoothstep(180.0,520.0,p.x)*(1.0-smoothstep(-1000.0,300.0,p.y))*(1.0-smoothstep(1000.0,1700.0,p.x))*smoothstep(-3500.0,-2500.0,p.y);
        vec2 flow=vec2(-.26,.97)*uTime*mix(.18,.78,riverAmount);
        vec2 q=p-flow;
        float a=dot(q,vec2(.41,.19))-uTime*.8+noise(q*.06)*5.0;
        float b=dot(q,vec2(-.29,.67))+uTime*.61+noise(q*.09+51.8)*4.0;
        float c=dot(q,vec2(1.8,1.3))-uTime*1.7;
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float aa=1.0-smoothstep(1.2,6.5,footprint);
        float ab=1.0-smoothstep(.8,4.0,footprint);
        float ac=1.0-smoothstep(.2,1.3,footprint);
        vec2 slope=vec2(.41,.19)*cos(a)*.12*aa+vec2(-.29,.67)*cos(b)*.075*ab+vec2(1.8,1.3)*cos(c)*.018*ac;
        slope*=mix(1.0,.48,riverAmount);
        vec3 normal=normalize(vec3(-slope.x,1.0,-slope.y));
        vec3 viewDir=normalize(uEye-vWorld);
        float facing=clamp(abs(dot(viewDir,normal)),0.0,1.0);
        float fresnel=.025+.975*pow(1.0-facing,5.0);
        vec3 reflected=reflect(-viewDir,normal);
        vec3 sky=mix(uSkyHorizon,uSkyTop,pow(max(0.0,reflected.y),.6));
        vec2 uv=vMirror.xy/max(.0001,vMirror.w)+normal.xz*.012;
        float inView=step(0.0,uv.x)*step(0.0,uv.y)*step(uv.x,1.0)*step(uv.y,1.0)*step(0.0,vMirror.w);
        vec3 mirror=texture2D(tDiffuse,clamp(uv,vec2(.002),vec2(.998))).rgb;
        vec3 reflection=mix(sky,mirror,uHasReflection*inView*.9);
        vec2 maskUv=(p-uShoreBounds.xy)*uShoreBounds.zw;
        float within=step(0.0,maskUv.x)*step(0.0,maskUv.y)*step(maskUv.x,1.0)*step(maskUv.y,1.0);
        maskUv.y=1.0-maskUv.y;
        // Low coastal ground can be below the shared sea datum; do not paint sea on land.
        if(uHasShore>.5 && within>.5 && texture2D(uLandMask,maskUv).g>.5)discard;
        vec2 radius=uShoreBounds.zw*3.5;
        float nearLand=max(max(texture2D(uLandMask,maskUv+vec2(radius.x,0)).g,texture2D(uLandMask,maskUv-vec2(radius.x,0)).g),max(texture2D(uLandMask,maskUv+vec2(0,radius.y)).g,texture2D(uLandMask,maskUv-vec2(0,radius.y)).g))*uHasShore*within;
        float undulation=.96+.04*sin(a*.47+b*.23);
        vec3 body=mix(color,uRiverColor,riverAmount)*mix(1.0,.38,uNight)*undulation*(.85+.15*facing);
        body=mix(body,body*1.5,nearLand*.45);
        float glint=pow(max(0.0,dot(normal,normalize(viewDir+uSun))),150.0)*mix(.3,.12,riverAmount);
        vec3 water=mix(body,reflection,clamp(.14+fresnel*.78,0.0,.92));
        float foam=nearLand*(.5+.5*sin(uTime*.85+p.x*.25+p.y*.34))*mix(.09,.025,riverAmount);
        water+=(vec3(.9,.95,.95)*foam+vec3(1.0,.94,.81)*glint)*(1.0-uNight*.9);
        gl_FragColor=vec4(water,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  };
  const geometry=new THREE.PlaneGeometry(100000,100000);
  const sea=new Reflector(geometry,{shader,textureWidth:256,textureHeight:256,multisample:0,clipBias:.003,color:0x0e4558});
  sea.name='numazu-water-reflector';sea.rotation.x=-Math.PI/2;sea.position.y=41.5;
  const material=sea.material as THREE.ShaderMaterial;
  material.fog=true;material.side=THREE.DoubleSide;
  const target=sea.getRenderTarget();target.texture.type=THREE.UnsignedByteType;
  // Reflector clones uniforms: re-share the animation and projection parameters.
  Object.assign(material.uniforms,{uTime:time,uEye:eye,uReflectionMatrix:reflectionMatrix,uHasReflection:hasReflection,uLandMask:shore,uShoreBounds:shoreBounds,uHasShore:hasShore});
  const surfaces:THREE.Mesh[]=[];
  const original=sea.onBeforeRender;
  const inverse=new THREE.Matrix4();
  let nextReflection=0,reflecting=false,disposed=false;
  sea.onBeforeRender=function(renderer,renderScene,camera,...rest){
    if(disposed||reflecting)return;
    eye.value.setFromMatrixPosition(camera.matrixWorld);
    if(eye.value.y<41.55||(performance.now()<nextReflection&&!scene.userData.forceReflectionUpdate))return;
    nextReflection=performance.now()+1000/15;
    const states=surfaces.map(mesh=>mesh.visible);
    surfaces.forEach(mesh=>{mesh.visible=false;});
    reflecting=true;
    try{
      original.call(this,renderer,renderScene,camera,...rest);
      reflectionMatrix.value.copy(material.uniforms.textureMatrix.value).multiply(inverse.copy(sea.matrixWorld).invert());
      hasReflection.value=1;
    }finally{
      reflecting=false;surfaces.forEach((mesh,i)=>{mesh.visible=states[i];});
    }
  };
  // Draw the common reflection first, then use it on the actual shore polygons.
  sea.renderOrder=-2;scene.add(sea);
  return {
    attach(group:THREE.Group){
      group.traverse(object=>{if(object instanceof THREE.Mesh){object.material=material;object.renderOrder=-1;surfaces.push(object);}});
    },
    setShoreMask(texture:THREE.Texture,bounds:THREE.Vector4){shore.value=texture;shoreBounds.value.copy(bounds);hasShore.value=1;},
    update(delta:number){time.value+=Math.min(delta,.1);const a=scene.userData.atmosphere;if(a){material.uniforms.color.value.copy(a.water);material.uniforms.uRiverColor.value.copy(a.water).multiplyScalar(1.12);material.uniforms.uSkyTop.value.copy(a.top);material.uniforms.uSkyHorizon.value.copy(a.horizon);material.uniforms.uNight.value=a.night;material.uniforms.uSun.value.copy(a.sunPosition).normalize();}},
    dispose(){disposed=true;scene.remove(sea);sea.dispose();geometry.dispose();surfaces.length=0;},
  };
}
