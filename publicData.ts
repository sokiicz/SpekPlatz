
import { Spot } from './types';

export const PUBLIC_SPOTS: Spot[] = [
  {
    id: 'pub-1',
    name: 'Vyhlídka nad lomem',
    categories: ['Viewpoint'],
    description: 'A breathtaking view over the old quarry. Perfect for sunset photography and quiet meditation.',
    lat: 49.1765,
    lng: 16.5921,
    createdBy: 'system',
    createdAt: '2024-01-15T10:00:00.000Z',
    reviews: [
      {
        id: 'rev-1',
        userId: 'user-1',
        userName: 'Lukas',
        rating: 5,
        comment: 'Amazing spot! The wind here is so refreshing.',
        date: '2026-03-01T14:30:00.000Z'
      }
    ],
    isSaved: false
  }
];
