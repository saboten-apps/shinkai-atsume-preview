import { Fish } from '../types';
import rawFishData from '../../../app/data/fish.json';

interface FishJsonStructure {
  fish: Fish[];
}

const fishMap: Map<string, Fish> = new Map();

try {
  const data = rawFishData as unknown as FishJsonStructure;
  if (data && Array.isArray(data.fish)) {
    data.fish.forEach((f) => {
      fishMap.set(f.id, f);
    });
  }
} catch (err) {
  console.warn('Failed to load rawFishData directly, using fallback', err);
}

export function getFishById(id: string): Fish | undefined {
  return fishMap.get(id);
}
