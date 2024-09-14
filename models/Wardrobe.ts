import type { Clothes } from './Clothes';
import type { Outfit } from './Outfit';

export interface Wardrobe {
    id: string;
    ownerId: string;
    name: string;
    clothes: Clothes[];
    totalItems: number;
    categories?: string[];
    favoriteOutfits?: Outfit[];
}