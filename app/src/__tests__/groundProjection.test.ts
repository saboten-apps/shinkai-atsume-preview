import {describe,expect,it} from 'vitest';
import {DETAIL_ZOOM,lonLatToTile,worldToLonLat,worldToPhotoTile} from '../features/exploration/map/three/groundProjection';

describe('photograph registration in the PLATEAU frame',()=>{
  it('keeps the origin fixed at different elevations',()=>{
    for(const elevation of [0,41.7,100]) {
      const [lon,lat]=worldToLonLat(0,elevation,0);
      expect(lon).toBeCloseTo(138.8576,9);expect(lat).toBeCloseTo(35.0815,9);
    }
  });
  it('registers the station against an independently calculated WGS84 forward fixture',()=>{
    // ECEF(35.1031N,138.8599E,h=45) minus ECEF origin, rotated into ENU.
    const [lon,lat]=worldToLonLat(209.700570062946,44.54485031027,-2396.372264454027);
    expect(lon).toBeCloseTo(138.8599,8);expect(lat).toBeCloseTo(35.1031,8);
  });
  it('uses the GSI XYZ orientation (north has smaller y, east larger x)',()=>{
    const origin=worldToPhotoTile(0,42,0);
    expect(worldToPhotoTile(100,42,0)[0]).toBeGreaterThan(origin[0]);
    expect(worldToPhotoTile(0,42,-100)[1]).toBeLessThan(origin[1]);
    const center=lonLatToTile(0,0,DETAIL_ZOOM);
    expect(center).toEqual([2**(DETAIL_ZOOM-1),2**(DETAIL_ZOOM-1)]);
  });
});
