// Explicit source IDs keep adjacent buildings from inheriting a landmark's introduction.
export const PLACES = [
  {id:'city-hall', buildingIds:['bldg_6b50bdd6-c50a-4791-a8a3-2affe32f1c80','bldg_a05aab3b-f633-46a8-973a-be41451c06c1'],
    ja:'沼津市役所', en:'Numazu City Hall', photo:'environment/city-hall/preview.webp',
    descriptionJa:'大きな屋根と柱が印象的な入口。写真と見比べながら、屋根の下や窓が並ぶ庁舎を眺めてみよう。',
    descriptionEn:'Look for the broad entrance roof and its columns. Compare the photograph with the virtual facade and rows of windows.'},
  {id:'byuuo', buildingIds:['bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526'],
    ja:'沼津港大型展望水門「びゅうお」', en:'Byuuo watergate', photo:'environment/byuuo/byuuo-front.webp',
    descriptionJa:'沼津港の水路をまたぐ大きな水門。左右の塔と、それをつなぐ展望通路、水門扉の形を見比べてみよう。',
    descriptionEn:'A large watergate spanning the harbor channel. Compare its twin towers, elevated walkway and gate with the photograph.'},
] as const;
export function placeForBuilding(id:string){return PLACES.find(place=>(place.buildingIds as readonly string[]).includes(id));}
