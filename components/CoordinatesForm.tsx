import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

// Accepts "49.1950, 16.6068" pasted into either field, or the two values separately.
const parsePair = (latRaw: string, lngRaw: string): [number, number] | null => {
  let latStr = latRaw.trim();
  let lngStr = lngRaw.trim();
  if (!lngStr) {
    const parts = latStr.split(/[\s,;]+/).filter(Boolean);
    if (parts.length === 2) [latStr, lngStr] = parts;
  }
  const lat = parseFloat(latStr.replace(',', '.'));
  const lng = parseFloat(lngStr.replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
};

const CoordinatesForm = ({ onConfirm, onBack }: { onConfirm: (lat: number, lng: number) => void; onBack: () => void }) => {
  const [latVal, setLatVal] = useState('');
  const [lngVal, setLngVal] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pair = parsePair(latVal, lngVal);
    if (!pair) {
      setError('Enter valid coordinates (lat −90…90, lng −180…180).');
      return;
    }
    onConfirm(pair[0], pair[1]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Enter Coordinates</h2>
        <button type="button" onClick={onBack} aria-label="Back" className="p-2 bg-gray-100 dark:bg-slate-800 rounded-xl text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"><ArrowLeft size={18} /></button>
      </div>
      <p className="text-xs text-gray-400 dark:text-slate-500">Paste coordinates in decimal format, e.g. <span className="font-mono">49.1950, 16.6068</span></p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="coord-lat" className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Latitude</label>
          <input
            id="coord-lat"
            inputMode="decimal"
            value={latVal}
            onChange={e => { setLatVal(e.target.value); setError(''); }}
            placeholder="49.1950"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl outline-none font-mono text-base md:text-sm border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="coord-lng" className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Longitude</label>
          <input
            id="coord-lng"
            inputMode="decimal"
            value={lngVal}
            onChange={e => { setLngVal(e.target.value); setError(''); }}
            placeholder="16.6068"
            className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl outline-none font-mono text-base md:text-sm border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-500 dark:text-red-400 text-center">{error}</p>}
      <button type="submit" className="w-full py-4 bg-violet-600 text-white rounded-2xl font-semibold text-sm hover:bg-violet-700 active:scale-95 transition-all">
        Continue
      </button>
    </form>
  );
};

export default CoordinatesForm;
