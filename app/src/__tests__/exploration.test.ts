import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampPosition, dailyPlace, detector, EXPLORATION_KEY, HIDE_VERSION, loadDiscovery, PLACES, saveDiscovery } from '../features/exploration/domain';
import { getJstDateString } from '../lib/gacha';
import { createHash } from 'node:crypto';

afterEach(()=>vi.unstubAllGlobals());
describe('daily virtual exploration',()=>{
  it('selects the frozen shared site with an independent SHA-256 implementation',()=>{
    for(const date of ['2026-11-14','2026-11-15','2027-01-01']){
      const index=createHash('sha256').update(`shinkai-exploration:hide-v1:${date}`).digest().readUInt32BE(0)%10;
      expect(dailyPlace(date)).toEqual(PLACES[index]);
    }
    expect(PLACES.map(p=>p.id)).toEqual(['port-entrance','port-south','port-inner','port-east','port-north','river-south','river-north','city-middle','station-approach','station-south']);
  });
  it('changes the session day at Japan midnight, including year boundary',()=>{
    expect(getJstDateString(new Date('2026-12-31T14:59:59Z'))).toBe('2026-12-31');
    expect(getJstDateString(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });
  it('uses north as negative z and the same horizontal find radius in both modes',()=>{
    expect(detector({x:0,z:0},{x:0,z:-100})).toMatchObject({direction:0,distance:100,near:false});
    expect(detector({x:0,z:0},{x:20,z:0})).toMatchObject({direction:2,near:true});
    expect(detector({x:0,z:0},{x:20.01,z:0}).near).toBe(false);
    expect(clampPosition({x:-999,z:-9999})).toEqual({x:-500,z:-2580});
  });
  it('persists discoveries separately and rejects mismatched day, fish, place or version',()=>{
    const data=new Map<string,string>([['shinkai_gacha_collection_v1','existing-collection']]);
    vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});
    const record={date:'2026-11-14',fishId:'f02',placeId:'port-inner',version:HIDE_VERSION,foundAt:'2026-11-14T01:00:00Z',mode:'2d' as const};
    expect(saveDiscovery(record)).toBe(true);
    expect(loadDiscovery(record.date,'f02','port-inner')).toEqual(record);
    expect(loadDiscovery(record.date,'f03','port-inner')).toBeNull();
    expect(loadDiscovery(record.date,'f02','station-south')).toBeNull();
    expect(data.get('shinkai_gacha_collection_v1')).toBe('existing-collection');
    data.set(EXPLORATION_KEY,JSON.stringify({[record.date]:{...record,version:'future'}}));
    expect(loadDiscovery(record.date,'f02','port-inner')).toBeNull();
    data.set(EXPLORATION_KEY,'invalid');expect(loadDiscovery(record.date,'f02','port-inner')).toBeNull();
  });
  it('keeps discovery usable when storage is denied',()=>{
    vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');}});
    expect(loadDiscovery('2026-11-14','f02','port-inner')).toBeNull();
    expect(saveDiscovery({date:'2026-11-14',fishId:'f02',placeId:'port-inner',version:HIDE_VERSION,foundAt:'now',mode:'3d'})).toBe(false);
  });
});
