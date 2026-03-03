
export type CategoryType = 'Rooftop' | 'Park' | 'Balcony' | 'Lounge' | 'Beach' | 'Hidden' | 'Viewpoint' | 'Other';

export interface User {
  id: string;
  name: string;
  password?: string; // Stored for simple persistent auth
  avatar: string;
  email?: string;
  isAdmin?: boolean;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  image?: string; // base64
}

export interface Spot {
  id: string;
  name: string;
  categories: CategoryType[];
  description: string;
  lat: number;
  lng: number;
  createdBy: string; // User ID
  createdAt: string;
  reviews: Review[];
  image?: string; // base64 (Main Photo)
  isSaved?: boolean;
}

export interface MapSettings {
  mode: 'streets' | 'satellite';
  theme: 'light' | 'dark';
}
