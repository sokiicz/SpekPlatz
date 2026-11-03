import React, { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { CategoryType, Spot } from '../types';
import { CATEGORIES } from '../constants';
import { COVER_IMAGE, compressImageFile, safeImageSrc } from '../lib/utils';

export interface SpotFormData {
  name: string;
  description: string;
}

export const SPOT_NAME_MAX = 80;
export const SPOT_DESCRIPTION_MAX = 2000;

const SpotForm = ({ onSubmit, initialData, isSubmitting, submitError }: {
  onSubmit: (data: SpotFormData, cats: CategoryType[], img: string | null) => void;
  initialData?: Spot | null;
  isSubmitting?: boolean;
  submitError?: string;
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [cats, setCats] = useState<CategoryType[]>(initialData?.categories || []);
  const [img, setImg] = useState<string | null>(safeImageSrc(initialData?.image) || null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setIsProcessingImage(true);
    setError('');
    try {
      setImg(await compressImageFile(file, COVER_IMAGE.maxPx, COVER_IMAGE.quality));
    } catch {
      setError('This photo could not be read. Try a JPEG or PNG.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim() || cats.length === 0) {
      setError('Please add a name and at least one category.');
      return;
    }
    setError('');
    onSubmit({ name: name.trim(), description: description.trim() }, cats, img);
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="f-name" className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Spot name *</label>
          <input id="f-name" value={name} onChange={e => setName(e.target.value)} maxLength={SPOT_NAME_MAX} required placeholder="e.g. Rooftop at Sunset…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl outline-none font-medium text-base md:text-sm border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Category * <span className="font-normal text-gray-400 dark:text-slate-500">(pick one or more)</span></span>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.label}
                type="button"
                aria-pressed={cats.includes(c.label)}
                onClick={() => setCats(p => p.includes(c.label) ? p.filter(x => x !== c.label) : [...p, c.label])}
                className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2 border ${cats.includes(c.label) ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'}`}
              >
                <span className={cats.includes(c.label) ? 'text-white' : 'text-emerald-500'}>{c.icon}</span>
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Cover photo</span>
          <button onClick={() => fileRef.current?.click()} type="button" disabled={isProcessingImage} className="w-full h-32 md:h-40 bg-gray-50 dark:bg-slate-800 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600 hover:text-emerald-500 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all overflow-hidden relative">
            {img ? (
              <img src={img} className="w-full h-full object-cover" alt="Selected cover" />
            ) : <><Camera size={28} /><span className="text-xs font-medium mt-2 text-gray-400 dark:text-slate-500">{isProcessingImage ? 'Processing…' : 'Tap to add a photo'}</span></>}
          </button>
          {img && (
            <button type="button" onClick={() => setImg(null)} className="text-[11px] text-gray-400 hover:text-red-500 ml-1">Remove photo</button>
          )}
          <input type="file" hidden ref={fileRef} accept="image/*" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="f-desc" className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Description</label>
          <textarea id="f-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={SPOT_DESCRIPTION_MAX} placeholder="Best time to visit, how to get there, vibes…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl outline-none text-base md:text-sm h-24 md:h-32 resize-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      <div className="lg:col-span-2 pt-2">
        {(error || submitError) && <p role="alert" className="text-xs text-red-500 dark:text-red-400 text-center mb-3">{error || submitError}</p>}
        <button type="submit" disabled={isSubmitting || isProcessingImage} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-semibold text-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100">
          {isSubmitting ? 'Saving…' : (initialData ? 'Save changes' : 'Add this spot')}
        </button>
      </div>
    </form>
  );
};

export default SpotForm;
