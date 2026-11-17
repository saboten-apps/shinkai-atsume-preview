import {describe,it,expect} from 'vitest';import {parseDrafts,serializeDrafts,validateDraft} from '../features/scenery/placeDraft';
const d={id:'test-place',buildingId:'bldg_test',x:12,z:34,name:'場所',description:'<script>text</script>',url:'https://example.com',photo:'environment/places/test.webp',photographer:'提供者',permission:'公開・加工可',credit:'写真：提供者'};
describe('place draft files',()=>{
 it('round-trips drafts without interpreting text as HTML',()=>{expect(parseDrafts(serializeDrafts([d]))).toEqual([d]);});
 it('rejects active URLs, image traversal, invalid coordinates and unsupported versions',()=>{
 for(const change of [{url:'javascript:alert(1)'},{url:'data:text/html,a'},{photo:'environment/../secret.jpg'},{x:NaN},{x:'12'},{z:9000},{id:'../x'},{buildingId:''}])expect(()=>validateDraft({...d,...change})).toThrow();
 expect(()=>parseDrafts('{"version":2,"drafts":[]}')).toThrow();
 });
 it('rejects duplicates and oversized files before restoring',()=>{expect(()=>parseDrafts(JSON.stringify({version:1,drafts:[d,d]}))).toThrow();expect(()=>parseDrafts(' '.repeat(1000001))).toThrow();});
});
