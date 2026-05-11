
import React from 'react';
import {
  Cloud,
  Trees,
  Home,
  Coffee,
  Waves,
  Droplets,
  Ghost,
  Telescope,
  Leaf,
  Armchair,
  Flame,
  MoreHorizontal
} from 'lucide-react';
import { CategoryType } from './types';

export const CATEGORIES: { label: CategoryType; icon: React.ReactNode; color: string }[] = [
  { label: 'Rooftop', icon: <Cloud size={18} />, color: 'bg-blue-500' },
  { label: 'Park', icon: <Trees size={18} />, color: 'bg-emerald-500' },
  { label: 'Balcony', icon: <Home size={18} />, color: 'bg-orange-500' },
  { label: 'Lounge', icon: <Coffee size={18} />, color: 'bg-purple-500' },
  { label: 'Beach', icon: <Waves size={18} />, color: 'bg-cyan-500' },
  { label: 'Swim', icon: <Droplets size={18} />, color: 'bg-sky-500' },
  { label: 'Hidden', icon: <Ghost size={18} />, color: 'bg-gray-700' },
  { label: 'Viewpoint', icon: <Telescope size={18} />, color: 'bg-indigo-500' },
  { label: 'Nature', icon: <Leaf size={18} />, color: 'bg-green-600' },
  { label: 'Bench', icon: <Armchair size={18} />, color: 'bg-amber-700' },
  { label: 'Fireplace', icon: <Flame size={18} />, color: 'bg-orange-500' },
  { label: 'Other', icon: <MoreHorizontal size={18} />, color: 'bg-slate-500' },
];

export const INITIAL_CENTER: [number, number] = [50.0, 14.0]; // Central Europe (near Prague)
export const INITIAL_ZOOM = 5; // Zoomed out to see Europe
