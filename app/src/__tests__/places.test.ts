import {describe,it,expect} from 'vitest';
import {PLACES,placeForBuilding} from '../features/scenery/places';
import {parseViewHash} from '../features/scenery/viewpoint';
import fs from 'node:fs';
describe('place introductions',()=>{
  it('binds only explicit landmark IDs and supplies working scenery links and photos',()=>{
    for(const place of PLACES){
      expect(parseViewHash(`#/view/${place.id}`)?.preset).toBe(place.id);
      expect(fs.existsSync(`public/${place.photo}`)).toBe(true);
      for(const id of place.buildingIds)expect(placeForBuilding(id)?.id).toBe(place.id);
    }
    expect(placeForBuilding('bldg_2c576aee-3e94-47d3-a1c9-55cc64a76de3')).toBeUndefined();
    expect(placeForBuilding('unregistered')).toBeUndefined();
  });
});
