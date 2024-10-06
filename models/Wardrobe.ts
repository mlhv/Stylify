import type { Items } from './Items';
import type { Outfit } from './Outfit';

export interface Wardrobe {
    id: string;
    ownerId: string;
    name: string;
    clothes: Items[];
    totalItems: number;
    categories?: string[];
    favoriteOutfits?: Outfit[];
}