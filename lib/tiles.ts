import { MapSettings } from '../types';

// Raster tile sources. CARTO basemaps started returning "API KEY REQUIRED"
// watermark tiles for keyless requests (Nov 2026), so streets use the
// OpenStreetMap standard layer; dark mode recolours it with a CSS filter
// (`.tiles-dark` in index.css) instead of depending on a second provider.
export interface TileSource {
  url: string;
  attribution: string;
  maxZoom: number;
  className?: string;
}

const MAPY_KEY = import.meta.env.VITE_MAPY_KEY as string | undefined;

export const hasMapyKey = Boolean(MAPY_KEY);

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export const getTileSource = (settings: MapSettings): TileSource => {
  if (settings.mode === 'satellite') {
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    };
  }
  if (settings.mode === 'outdoor' && MAPY_KEY) {
    return {
      url: `https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?apikey=${MAPY_KEY}`,
      attribution: '&copy; <a href="https://mapy.com/" target="_blank" rel="noopener">Mapy.com</a> ' + OSM_ATTRIBUTION,
      maxZoom: 19,
    };
  }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    className: settings.theme === 'dark' ? 'tiles-dark' : undefined,
  };
};
