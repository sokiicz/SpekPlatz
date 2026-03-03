
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
        userName: 'Lukas M.',
        rating: 5,
        comment: 'Amazing spot! The wind here is so refreshing.',
        date: '2024-02-01T14:30:00.000Z'
      }
    ],
    isSaved: false
  },
  {
    id: 'pub-2',
    name: 'Strahov Rooftop Garden',
    categories: ['Rooftop', 'Viewpoint'],
    description: 'Hidden garden with a spectacular view of the Prague Castle. Best visited in early spring.',
    lat: 50.0865,
    lng: 14.3985,
    createdBy: 'system',
    createdAt: '2024-01-20T12:00:00.000Z',
    reviews: [],
    isSaved: true
  },
  {
    id: 'pub-3',
    name: 'Letná Secret Bench',
    categories: ['Hidden', 'Park'],
    description: 'A bench tucked away from the main path. Great for reading or a private talk.',
    lat: 50.0958,
    lng: 14.4147,
    createdBy: 'system',
    createdAt: '2024-02-05T09:15:00.000Z',
    reviews: [],
    isSaved: false
  }
];
