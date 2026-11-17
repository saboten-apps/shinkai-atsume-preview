import {it,expect} from 'vitest';
import * as THREE from 'three';
import {createOnariArch} from '../features/exploration/map/three/onariArch';
it('fits two open arch ribs above the existing deck and keeps the geometry light',()=>{
 const arch=createOnariArch(140,14,45),bounds=new THREE.Box3().setFromObject(arch.root);expect(bounds.max.y).toBeGreaterThan(60);expect(bounds.min.y).toBeGreaterThan(45);expect(bounds.min.x).toBeGreaterThan(-70);expect(bounds.max.x).toBeLessThan(70);expect(arch.root.children).toHaveLength(2);
 let triangles=0;arch.root.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});expect(triangles).toBeLessThan(2500);expect((arch.root.children[1] as THREE.Mesh).material).toMatchObject({opacity:0});arch.dispose();arch.dispose();
});
