
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  useMapEvents,
  CircleMarker
} from 'react-leaflet';
import L from 'leaflet';
import { 
  Plus, 
  Navigation, 
  Map as MapIcon, 
  Moon, 
  Sun, 
  Search, 
  LogOut,
  User as UserIcon,
  Trash2,
  Edit2,
  Heart,
  Cloud,
  Star,
  Camera,
  ArrowLeft,
  X,
  MapPin,
  Navigation2,
  MessageSquare,
  Send,
  Clock,
  Ghost,
  Layers,
  LocateFixed,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Target,
  AlertCircle,
  ChevronDown,
  MoreHorizontal,
  Move
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  arrayUnion,
  arrayRemove,
  getDocs,
  setDoc,
  where,
  limit
} from 'firebase/firestore';

import { Spot, CategoryType, User, MapSettings, Review } from './types';
import { CATEGORIES, INITIAL_CENTER, INITIAL_ZOOM } from './constants';
import { PUBLIC_SPOTS } from './publicData';
import { formatDistanceToNow } from 'date-fns';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'spekplatz');

const USER_SESSION_KEY = 'spekplatz_current_user_v4';
const OWNED_SPOTS_KEY = 'spekplatz_owned_spots';
const LOCAL_SAVED_KEY = 'spekplatz_local_saved';
const DELETED_SPOTS_KEY = 'spekplatz_deleted_spots';

const compressImage = (dataUrl: string, maxPx = 1200, quality = 0.75): Promise<string> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
};

const createCustomIcon = (categories: CategoryType[]) => {
  const primaryCat = categories[0] || 'Other';
  const cat = CATEGORIES.find(c => c.label === primaryCat) || CATEGORIES[CATEGORIES.length - 1];
  const hexMap: Record<string, string> = {
    'blue': '#3b82f6', 'emerald': '#10b981', 'orange': '#f97316', 'purple': '#a855f7',
    'cyan': '#06b6d4', 'gray': '#374151', 'indigo': '#6366f1', 'slate': '#64748b',
  };
  const colorName = cat.color.replace('bg-', '').replace('-500', '');
  const hex = hexMap[colorName] || '#10b981';

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="absolute inset-0 bg-white dark:bg-gray-800 rounded-full shadow-lg border-2 border-current" style="color: ${hex}"></div>
        <div class="relative w-2.5 h-2.5 rounded-full shadow-inner" style="background-color: ${hex}"></div>
        <div class="absolute -bottom-1 w-2 h-2 rotate-45" style="background-color: ${hex}"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

const MapController = ({
  onViewportChange,
  onMapClick,
  onLocationFound,
  onLocationError,
  onLongPress,
  onDragStart,
}: {
  onViewportChange: (bounds: L.LatLngBounds) => void;
  onMapClick: (lat: number, lng: number) => void;
  onLocationFound: (lat: number, lng: number) => void;
  onLocationError: () => void;
  onLongPress: (lat: number, lng: number) => void;
  onDragStart: () => void;
}) => {
  const timerRef = useRef<number | null>(null);
  const cancel = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  useMapEvents({
    moveend: (e) => onViewportChange(e.target.getBounds()),
    zoomend: (e) => onViewportChange(e.target.getBounds()),
    click: (e) => onMapClick(e.latlng.lat, e.latlng.lng),
    dragstart: () => onDragStart(),
    locationfound: (e) => onLocationFound(e.latlng.lat, e.latlng.lng),
    locationerror: () => onLocationError(),
    // Long press: touch only (mobile). Cancelled on move to avoid triggering during drag.
    touchstart: (e) => {
      cancel();
      timerRef.current = window.setTimeout(() => {
        // @ts-ignore
        if (e.latlng) onLongPress(e.latlng.lat, e.latlng.lng);
      }, 700);
    },
    touchmove: cancel,
    touchend: cancel,
  });
  return null;
};

const App: React.FC = () => {
  const [spots, setSpots] = useState<Spot[]>(PUBLIC_SPOTS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<MapSettings>({ mode: 'streets', theme: 'light' });
  const [activeCategories, setActiveCategories] = useState<CategoryType[]>([]);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleBounds, setVisibleBounds] = useState<L.LatLngBounds | null>(null);
  const [drawerState, setDrawerState] = useState<'hidden' | 'half' | 'full'>('hidden');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [ownedSpotIds, setOwnedSpotIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(OWNED_SPOTS_KEY) || '[]'); } catch { return []; }
  });
  const [savedSpotIds, setSavedSpotIds] = useState<string[]>(() => {
    try {
      const savedUser = localStorage.getItem(USER_SESSION_KEY);
      if (savedUser) { const u = JSON.parse(savedUser); return u.savedSpotIds || []; }
      return JSON.parse(localStorage.getItem(LOCAL_SAVED_KEY) || '[]');
    } catch { return []; }
  });
  const [locationStatus, setLocationStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');
  const [showLegalModal, setShowLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const markerRefs = useRef<{[key: string]: any}>({});
  const [showAddModal, setShowAddModal] = useState<{lat: number, lng: number} | null>(null);
  const [addMode, setAddMode] = useState<'options' | 'form'>('options');
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [filterSavedOnly, setFilterSavedOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState<'login' | 'signup' | null>(null);
  const [authError, setAuthError] = useState('');
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'rating' | 'distance'>('date');
  const [reviewText, setReviewText] = useState('');
  const [anonName, setAnonName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [isAddingSpot, setIsAddingSpot] = useState(false);
  const [addSpotError, setAddSpotError] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);
  const [reviewImage, setReviewImage] = useState<string | null>(null);
  const reviewImageRef = useRef<HTMLInputElement>(null);
  const [movingSpotId, setMovingSpotId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem(USER_SESSION_KEY);
    if (savedUser) setCurrentUser(JSON.parse(savedUser));
    
    const q = query(collection(db, 'spots'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbSpots = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Spot));
      
      // Firestore versions override public spots (allows admins to move/edit hardcoded spots)
      const merged = PUBLIC_SPOTS.map(ps => dbSpots.find(s => s.id === ps.id) || ps);
      dbSpots.forEach(s => {
        if (!merged.find(p => p.id === s.id)) merged.push(s);
      });
      setSpots(merged);
    }, (err) => {
      console.warn("Firestore error, showing public data.", err);
      setSpots(PUBLIC_SPOTS);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  useEffect(() => {
    if (mapInstance) {
      setTimeout(() => mapInstance.invalidateSize(), 100);
    }
  }, [mapInstance]);

  // Close selected spot when its marker scrolls out of the visible map area
  useEffect(() => {
    if (selectedSpotId && visibleBounds) {
      const spot = spots.find(s => s.id === selectedSpotId);
      if (spot && !visibleBounds.contains([spot.lat, spot.lng])) {
        setSelectedSpotId(null);
        mapInstance?.closePopup();
      }
    }
  }, [visibleBounds]);

  const handleLocationFound = useCallback((lat: number, lng: number) => {
    setUserLocation([lat, lng]);
    setLocationDenied(false);
    setLocationStatus('found');
    setTimeout(() => setLocationStatus('idle'), 2500);
  }, []);

  const handleLocationError = useCallback(() => {
    setLocationDenied(true);
    setLocationStatus('error');
    setTimeout(() => { setLocationDenied(false); setLocationStatus('idle'); }, 4000);
  }, []);

  const handleToggleSave = async (spotId: string) => {
    const isNowSaved = !savedSpotIds.includes(spotId);
    const newSaved = isNowSaved ? [...savedSpotIds, spotId] : savedSpotIds.filter(id => id !== spotId);
    setSavedSpotIds(newSaved);
    if (currentUser) {
      const updatedUser = { ...currentUser, savedSpotIds: newSaved };
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(updatedUser));
      try {
        const q = query(collection(db, 'users'), where('name', '==', currentUser.name), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, { savedSpotIds: isNowSaved ? arrayUnion(spotId) : arrayRemove(spotId) });
        }
      } catch (err) { console.error('Error saving spot:', err); }
    } else {
      localStorage.setItem(LOCAL_SAVED_KEY, JSON.stringify(newSaved));
    }
  };

  const handleLogout = () => {
    setSavedSpotIds([]);
    localStorage.removeItem(USER_SESSION_KEY);
    setCurrentUser(null);
  };

  const getAverageRating = (spot: Spot) => {
    if (!spot.reviews || !spot.reviews.length) return 0;
    return spot.reviews.reduce((acc, r) => acc + r.rating, 0) / spot.reviews.length;
  };

  // Map markers show all spots matching filters (never filtered by viewport)
  const mapMarkerSpots = useMemo(() => {
    return spots.filter(spot => {
      const avg = getAverageRating(spot);
      const matchesCategory = activeCategories.length === 0 || (spot.categories || []).some(c => activeCategories.includes(c));
      const matchesSearch = spot.name.toLowerCase().includes(searchQuery.toLowerCase());
      const isSavedFilter = filterSavedOnly ? savedSpotIds.includes(spot.id) : true;
      const matchesRating = !spot.reviews?.length || avg >= minRating; // no reviews = always show
      return matchesCategory && matchesSearch && isSavedFilter && matchesRating;
    });
  }, [spots, activeCategories, searchQuery, filterSavedOnly, minRating, savedSpotIds]);

  // Sidebar list is filtered to current viewport for performance
  const filteredSpots = useMemo(() => {
    let result = spots.filter(spot => {
      const avg = getAverageRating(spot);
      const matchesCategory = activeCategories.length === 0 || (spot.categories || []).some(c => activeCategories.includes(c));
      const matchesSearch = spot.name.toLowerCase().includes(searchQuery.toLowerCase());
      const isVisible = visibleBounds ? visibleBounds.contains([spot.lat, spot.lng]) : true;
      const isSavedFilter = filterSavedOnly ? savedSpotIds.includes(spot.id) : true;
      const matchesRating = !spot.reviews?.length || avg >= minRating; // no reviews = always show
      return matchesCategory && matchesSearch && isVisible && isSavedFilter && matchesRating;
    });

    result = [...result].sort((a, b) => {
      if (sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'rating') return getAverageRating(b) - getAverageRating(a);
      if (sortBy === 'distance' && userLocation) {
        return getDistance(userLocation[0], userLocation[1], a.lat, a.lng) - getDistance(userLocation[0], userLocation[1], b.lat, b.lng);
      }
      return 0;
    });

    return result;
  }, [spots, activeCategories, searchQuery, visibleBounds, filterSavedOnly, minRating, sortBy, userLocation, savedSpotIds]);

  const selectedSpot = useMemo(() => spots.find(s => s.id === selectedSpotId), [spots, selectedSpotId]);

  const handleSpotClick = (spot: Spot, fromMap = false) => {
    setSelectedSpotId(spot.id);
    if (mapInstance) {
      const targetZoom = Math.max(mapInstance.getZoom(), 16);
      mapInstance.flyTo([spot.lat, spot.lng], targetZoom);
      mapInstance.once('moveend', () => {
        markerRefs.current[spot.id]?.openPopup();
      });
    }
    if (window.innerWidth < 1024) {
      setDrawerState(fromMap ? 'half' : 'full');
    }
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (movingSpotId) {
      const spotData = spots.find(s => s.id === movingSpotId);
      if (!spotData) { setMovingSpotId(null); return; }
      const { id: _id, ...rest } = spotData;
      const targetId = movingSpotId;
      // Clear banner and re-open spot immediately; write to Firestore in background
      setMovingSpotId(null);
      setSelectedSpotId(targetId);
      setDoc(doc(db, 'spots', targetId), { ...rest, lat, lng })
        .catch(err => console.error('Error moving spot:', err));
      return;
    }
    if (window.innerWidth < 1024) setDrawerState('hidden');
    if (selectedSpotId) {
      setSelectedSpotId(null);
      mapInstance?.closePopup();
      return;
    }
    if (isPickingLocation) {
      setShowAddModal({ lat, lng });
      setAddMode('form');
      setIsPickingLocation(false);
    }
  }, [movingSpotId, spots, selectedSpotId, isPickingLocation, mapInstance]);

  const handleLongPress = useCallback((lat: number, lng: number) => {
    setShowAddModal({ lat, lng });
    setAddMode('form');
  }, []);

  const handleMapDragStart = useCallback(() => {
    if (window.innerWidth < 1024) setDrawerState('hidden');
  }, []);

  const handleEditSpot = async (data: Partial<Spot>, categories: CategoryType[], image: string | null) => {
    if (!editingSpot || !data.name || categories.length === 0) return;
    setIsAddingSpot(true);
    setAddSpotError('');
    try {
      await updateDoc(doc(db, 'spots', editingSpot.id), {
        name: data.name,
        description: data.description || '',
        categories,
        image,
      });
      setShowAddModal(null);
      setAddMode('options');
      setEditingSpot(null);
    } catch (err) {
      console.error("Error updating spot:", err);
      setAddSpotError('Failed to update spot. Check your connection and try again.');
    } finally {
      setIsAddingSpot(false);
    }
  };

  const handleAddSpot = async (data: Partial<Spot>, categories: CategoryType[], image: string | null) => {
    if (!showAddModal || !data.name || categories.length === 0) return;

    const creatorId = currentUser?.id || 'anon-' + Math.random().toString(36).substr(2, 5);
    setIsAddingSpot(true);
    setAddSpotError('');
    try {
      const docRef = await addDoc(collection(db, 'spots'), {
        name: data.name,
        description: data.description || '',
        categories,
        image,
        lat: showAddModal.lat,
        lng: showAddModal.lng,
        createdBy: creatorId,
        createdAt: new Date().toISOString(),
        reviews: [],
        isSaved: false
      });
      const newOwned = [...ownedSpotIds, docRef.id];
      setOwnedSpotIds(newOwned);
      localStorage.setItem(OWNED_SPOTS_KEY, JSON.stringify(newOwned));
      setShowAddModal(null);
      setAddMode('options');
      if (window.innerWidth < 1024) setDrawerState('half');
    } catch (err) {
      console.error("Error adding spot:", err);
      setAddSpotError('Failed to save spot. Check your connection and try again.');
    } finally {
      setIsAddingSpot(false);
    }
  };

  const handleAddReview = async (spotId: string) => {
    if (!reviewText.trim()) return;
    const authorName = currentUser?.name || anonName.trim() || 'Anonymous Explorer';
    const newReview: Review = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser?.id || 'anon',
      userName: authorName,
      rating: reviewRating,
      comment: reviewText,
      date: new Date().toISOString(),
      image: reviewImage || undefined
    };
    try {
      const spotRef = doc(db, 'spots', spotId);
      await updateDoc(spotRef, { reviews: arrayUnion(newReview) });
      // Auto-set cover photo from first review image if spot has none
      const spotForCover = spots.find(s => s.id === spotId);
      if (reviewImage && spotForCover && !spotForCover.image) {
        await updateDoc(spotRef, { image: reviewImage });
      }
      setReviewText('');
      setAnonName('');
      setReviewRating(5);
      setReviewImage(null);
    } catch (err) { console.error("Error adding review:", err); }
  };

  const handleAuth = async (type: 'login' | 'signup', e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const nickname = data.get('nickname') as string;
    const password = data.get('password') as string;

    try {
      if (type === 'signup') {
        const userQuery = query(collection(db, 'users'), where('name', '==', nickname), limit(1));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          setAuthError('Nickname already taken');
          return;
        }
        const newUser = {
          id: Math.random().toString(36).substr(2, 9),
          name: nickname,
          password: password,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${nickname}`,
          savedSpotIds: []
        };
        await addDoc(collection(db, 'users'), newUser);
        setSavedSpotIds([]);
        setCurrentUser(newUser);
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(newUser));
        setShowAuthModal(null);
      } else {
        const userQuery = query(collection(db, 'users'), where('name', '==', nickname), where('password', '==', password), limit(1));
        const userSnap = await getDocs(userQuery);
        if (userSnap.empty) {
          setAuthError('Invalid nickname or password');
          return;
        }
        const loggedUser = { ...userSnap.docs[0].data(), id: userSnap.docs[0].id } as User;
        // Merge locally saved spots into the account
        const localSaved: string[] = (() => { try { return JSON.parse(localStorage.getItem(LOCAL_SAVED_KEY) || '[]'); } catch { return []; } })();
        const userSaved: string[] = (loggedUser as any).savedSpotIds || [];
        const mergedSaved = Array.from(new Set([...userSaved, ...localSaved]));
        if (localSaved.length > 0) {
          try { await updateDoc(userSnap.docs[0].ref, { savedSpotIds: mergedSaved }); localStorage.removeItem(LOCAL_SAVED_KEY); } catch {}
        }
        setSavedSpotIds(mergedSaved);
        const sessionUser = { ...loggedUser, savedSpotIds: mergedSaved };
        setCurrentUser(loggedUser);
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionUser));
        setShowAuthModal(null);
      }
    } catch (err) {
      setAuthError('Authentication failed');
    }
  };

  const mainCategories = CATEGORIES.slice(0, 4);
  const moreCategories = CATEGORIES.slice(4);

  const renderSidebarContent = () => {
    if (selectedSpot) {
      const avg = getAverageRating(selectedSpot);
      const isAdmin = currentUser?.name === 'admin' || currentUser?.isAdmin;
      const isOwner = isAdmin || (currentUser && currentUser.id === selectedSpot.createdBy) || ownedSpotIds.includes(selectedSpot.id);

      return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden relative">
          <div className="p-3 md:p-4 flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <button onClick={() => { setSelectedSpotId(null); setConfirmDeleteId(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-600 dark:text-gray-400">
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-base md:text-lg font-semibold truncate flex-1 text-gray-900 dark:text-white">{selectedSpot.name}</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar pb-32">
            <div className="relative h-52 md:h-64 w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-slate-800 shrink-0">
              {selectedSpot.image ? (
                <img src={selectedSpot.image} className="w-full h-full object-cover cursor-zoom-in" alt={selectedSpot.name} onClick={() => setLightboxImage(selectedSpot.image!)} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 dark:text-slate-600">
                  <Camera size={48} className="opacity-30 mb-2" />
                  <p className="text-xs font-medium text-gray-400 dark:text-slate-500">No photo yet</p>
                </div>
              )}
              <div className="absolute top-3 right-3">
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleSave(selectedSpot.id); }}
                  className={`p-2.5 rounded-full shadow-lg backdrop-blur-sm transition-all active:scale-90 ${savedSpotIds.includes(selectedSpot.id) ? 'bg-red-500 text-white' : 'bg-white/90 dark:bg-slate-800/90 text-gray-500 dark:text-gray-400 hover:text-red-500'}`}
                >
                  <Heart size={18} fill={savedSpotIds.includes(selectedSpot.id) ? 'white' : 'none'} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(selectedSpot.categories || []).map(catLabel => {
                  const cInfo = CATEGORIES.find(c => c.label === catLabel);
                  return (
                    <button key={catLabel} onClick={() => { setActiveCategories([catLabel]); setSelectedSpotId(null); }} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1.5 ${cInfo?.color} text-white hover:opacity-80 transition-opacity active:scale-95`}>
                      {cInfo?.icon} {catLabel}
                    </button>
                  );
                })}
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} fill={i < Math.round(avg) ? 'currentColor' : 'none'} className="text-amber-400" strokeWidth={1.5} />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{avg > 0 ? avg.toFixed(1) : '—'}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">({selectedSpot.reviews?.length || 0})</span>
                </div>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSpot.lat},${selectedSpot.lng}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-emerald-600 text-white rounded-xl flex items-center gap-1.5 text-xs font-semibold hover:bg-emerald-700 dark:hover:bg-emerald-500 transition-colors">
                  <Navigation2 size={14} fill="white" /> Navigate
                </a>
              </div>

              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                {selectedSpot.description || "No description yet — be the first to explore and share your experience!"}
              </p>
            </div>
            
            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 flex items-center gap-2">
                <MessageSquare size={14} /> Reviews
              </h3>
              
              <div className="space-y-4">
                {selectedSpot.reviews?.map(rev => (
                  <div key={rev.id} className="bg-gray-50 dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50">
                    <div className="flex justify-between items-start mb-2 md:mb-3">
                      <div className="flex items-center gap-2 md:gap-3">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${rev.userName}`} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-emerald-100 shadow-inner" />
                        <div>
                          <p className="text-[11px] md:text-xs font-bold text-gray-900 dark:text-gray-100">{rev.userName}</p>
                          <div className="flex text-amber-500 mt-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={8} fill={i < rev.rating ? 'currentColor' : 'none'} strokeWidth={2} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500">{formatDistanceToNow(new Date(rev.date))} ago</span>
                    </div>
                    <p className="text-[11px] md:text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed">"{rev.comment}"</p>
                    {rev.image && <img src={rev.image} className="mt-2 w-full h-32 object-cover rounded-xl cursor-zoom-in" alt="review" onClick={() => setLightboxImage(rev.image!)} />}
                  </div>
                ))}
                {!selectedSpot.reviews?.length && (
                  <div className="text-center py-8 border border-dashed border-gray-200 dark:border-slate-700 rounded-2xl">
                    <MessageSquare size={28} className="mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                    <p className="text-xs text-gray-400 dark:text-slate-500">No reviews yet — be the first!</p>
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Leave a review</span>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(v => (
                      <button key={v} onClick={() => setReviewRating(v)} className={`transition-all ${reviewRating >= v ? 'text-amber-400' : 'text-gray-300 dark:text-slate-600 hover:text-amber-300'}`}>
                        <Star size={16} fill={reviewRating >= v ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </div>
                </div>
                {!currentUser && (
                  <input 
                    type="text" value={anonName} onChange={e => setAnonName(e.target.value)}
                    placeholder="Your nickname..."
                    className="w-full px-4 py-2.5 mb-2 bg-white dark:bg-gray-800 rounded-xl text-xs outline-none border border-gray-100 dark:border-gray-800 focus:ring-1 focus:ring-emerald-500"
                  />
                )}
                <div className="relative">
                  <textarea
                    value={reviewText} onChange={e => setReviewText(e.target.value)}
                    placeholder="Share your experience..."
                    className="w-full p-4 pr-12 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-emerald-500 border border-gray-100 dark:border-gray-700 h-20 resize-none transition-all shadow-inner"
                  />
                  <button
                    onClick={() => handleAddReview(selectedSpot.id)}
                    disabled={!reviewText.trim()}
                    className="absolute bottom-3 right-3 p-2 bg-emerald-600 text-white rounded-xl shadow-xl hover:scale-110 transition-transform disabled:opacity-50 disabled:scale-100"
                  >
                    <Send size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="file" hidden ref={reviewImageRef} accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setReviewImage(r.result as string); r.readAsDataURL(f); } }} />
                  <button type="button" onClick={() => reviewImageRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 text-[10px] font-medium border border-gray-200 dark:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                    <Camera size={13} /> {reviewImage ? 'Change Photo' : 'Add Photo'}
                  </button>
                  {reviewImage && (
                    <div className="relative">
                      <img src={reviewImage} className="h-8 w-8 rounded-lg object-cover" />
                      <button onClick={() => setReviewImage(null)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"><X size={8} /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isOwner && (
              <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
                {confirmDeleteId === selectedSpot.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">Delete this spot permanently?</span>
                    <button
                      onClick={() => {
                        deleteDoc(doc(db, 'spots', selectedSpot.id))
                          .then(() => { setSelectedSpotId(null); setConfirmDeleteId(null); })
                          .catch(err => console.error('Delete failed:', err));
                      }}
                      className="px-3 py-2 bg-red-500 text-white rounded-xl text-xs font-semibold hover:bg-red-600 transition-colors"
                    >Yes, delete</button>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 rounded-xl text-xs font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingSpot(selectedSpot); setShowAddModal({ lat: selectedSpot.lat, lng: selectedSpot.lng }); setAddMode('form'); }} className="flex-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"><Edit2 size={13}/> Edit</button>
                    <button onClick={() => { setMovingSpotId(selectedSpot.id); setSelectedSpotId(null); mapInstance?.closePopup(); }} className="flex-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"><Move size={13}/> Move</button>
                    <button onClick={() => setConfirmDeleteId(selectedSpot.id)} className="flex-1 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 py-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"><Trash2 size={13}/> Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-gray-100 dark:border-slate-800 overflow-hidden">
        <div className="px-4 pt-4 pb-3 md:px-5 md:pt-5 border-b border-gray-100 dark:border-slate-800 shrink-0 space-y-3 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center shadow-sm">
                <Cloud size={16} className="text-white fill-current" />
              </div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">SpekPlatz</h1>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))} className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                {settings.theme === 'light' ? <Moon size={16} className="text-gray-500" /> : <Sun size={16} className="text-amber-400" />}
              </button>
              <button onClick={() => currentUser ? handleLogout() : setShowAuthModal('login')} className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                {currentUser ? <LogOut size={16} className="text-red-400" /> : <UserIcon size={16} className="text-gray-400 dark:text-gray-500" />}
              </button>
            </div>
          </div>

          <div className="space-y-2 md:space-y-4">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={16} />
              <input
                type="text" placeholder="Search spots…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 border-none rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-gray-700"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterSavedOnly(!filterSavedOnly)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all ${filterSavedOnly ? 'bg-red-500 text-white border-red-400' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-700'}`}
              >
                <Heart size={12} fill={filterSavedOnly ? 'currentColor' : 'none'} /> Saved
              </button>
              <div className="flex items-center gap-0.5 ml-1">
                <span className="text-[10px] text-gray-400 dark:text-slate-500 mr-1">Min</span>
                {[1,2,3,4,5].map(v => (
                  <button key={v} onClick={() => setMinRating(minRating === v ? 0 : v)} className={`p-0.5 transition-all ${minRating >= v ? 'text-amber-400' : 'text-gray-300 dark:text-slate-600 hover:text-amber-300'}`}>
                    <Star size={14} fill={minRating >= v ? 'currentColor' : 'none'} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(showAllCategories ? CATEGORIES : mainCategories).map(cat => (
                <button
                  key={cat.label}
                  onClick={() => setActiveCategories(prev => prev.includes(cat.label) ? prev.filter(c => c !== cat.label) : [...prev, cat.label])}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border ${activeCategories.includes(cat.label) ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:border-emerald-400 dark:hover:border-emerald-600'}`}
                >
                  <span className={activeCategories.includes(cat.label) ? 'text-white' : 'text-emerald-500'}>{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
              <button
                onClick={() => setShowAllCategories(!showAllCategories)}
                className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 border bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:text-emerald-500 border-gray-200 dark:border-slate-700"
              >
                {showAllCategories ? <ChevronDown size={12} /> : <MoreHorizontal size={12} />}
                {showAllCategories ? 'Less' : 'More'}
              </button>
            </div>
            
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[10px] text-gray-400 dark:text-slate-500 shrink-0 mr-1">Sort</span>
              {(['date', 'rating', 'distance'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize ${sortBy === s ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 no-scrollbar pb-16">
          {filteredSpots.length > 0 ? filteredSpots.map(spot => {
            const avg = getAverageRating(spot);
            const isSelected = selectedSpotId === spot.id;
            const dist = userLocation ? getDistance(userLocation[0], userLocation[1], spot.lat, spot.lng) : null;
            return (
              <motion.div
                key={spot.id} onClick={() => handleSpotClick(spot)}
                whileTap={{ scale: 0.99 }}
                className={`group bg-white dark:bg-slate-800 p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'ring-2 ring-emerald-500 border-transparent shadow-md z-10' : 'border-gray-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-700/50 hover:shadow-sm'}`}
              >
                <div className="flex gap-3">
                  <div className="w-[72px] h-[72px] rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-slate-700">
                    {spot.image ? <img src={spot.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-600"><MapPin size={22} /></div>}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <h3 className="font-semibold text-sm leading-tight text-gray-900 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">{spot.name}</h3>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Star size={10} className="text-amber-400 fill-current" />
                          <span className="text-xs text-amber-500 font-medium">{avg > 0 ? avg.toFixed(1) : '—'}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {(spot.categories || []).slice(0, 2).map(c => {
                          const ci = CATEGORIES.find(x => x.label === c);
                          return <span key={c} className={`px-2 py-0.5 rounded-full text-[9px] font-semibold text-white ${ci?.color}`}>{c}</span>;
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      {spot.description && <p className="text-[11px] text-gray-400 dark:text-slate-500 line-clamp-1 flex-1 mr-2">{spot.description}</p>}
                      {dist !== null && (
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500 shrink-0">{dist < 1 ? `${(dist*1000).toFixed(0)}m` : `${dist.toFixed(1)}km`}</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          }) : (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Ghost size={48} className="text-gray-200 dark:text-slate-700 mb-4" />
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">Nothing here yet</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mb-5">No spots match your current filters.</p>
              <button onClick={() => { setSearchQuery(''); setActiveCategories([]); setFilterSavedOnly(false); setMinRating(0); }} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-medium hover:bg-emerald-700 transition-colors">Clear filters</button>
            </div>
          )}
        </div>
        <div className="shrink-0 px-4 py-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-center gap-3 bg-white dark:bg-slate-900 flex-wrap">
          <button onClick={() => setShowLegalModal('terms')} className="text-[10px] text-gray-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors">Terms</button>
          <span className="text-gray-200 dark:text-slate-700 text-[10px]">·</span>
          <button onClick={() => setShowLegalModal('privacy')} className="text-[10px] text-gray-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors">Privacy</button>
          <span className="text-gray-200 dark:text-slate-700 text-[10px]">·</span>
          <a href="https://resonantlabs.online" target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-300 dark:text-slate-600 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors">A ResonantLabs app · resonantlabs.online</a>
        </div>
      </div>
    );
  };

  const handleAddLiveLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        console.log("Found location:", latitude, longitude);
        setShowAddModal({ lat: latitude, lng: longitude });
        setAddMode('form');
      }, (error) => {
        console.error("Geo error:", error);
        alert("Unable to retrieve location. Please check your browser permissions.");
      });
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 font-sans">
      <div className="hidden lg:block w-[28rem] h-full z-[1001] shrink-0">
        {renderSidebarContent()}
      </div>

      <div className="flex-1 relative h-full min-h-0">
        <MapContainer center={INITIAL_CENTER} zoom={INITIAL_ZOOM} scrollWheelZoom={true} ref={setMapInstance} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            url={settings.mode === 'satellite'
              ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              : (settings.theme === 'dark'
                  ? 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png'
                  : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png')
            }
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          <MapController onViewportChange={setVisibleBounds} onLocationFound={handleLocationFound} onLocationError={handleLocationError} onMapClick={handleMapClick} onLongPress={handleLongPress} onDragStart={handleMapDragStart} />
          
          {userLocation && <CircleMarker center={userLocation} radius={10} pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.8, color: '#fff', weight: 4 }} />}

          {mapMarkerSpots.map(spot => {
            const popupDist = userLocation ? getDistance(userLocation[0], userLocation[1], spot.lat, spot.lng) : null;
            return (
              <Marker
                key={spot.id}
                position={[spot.lat, spot.lng]}
                icon={createCustomIcon(spot.categories)}
                ref={(el) => { markerRefs.current[spot.id] = el; }}
                eventHandlers={{ click: () => handleSpotClick(spot, true) }}
              >
                <Popup minWidth={220} maxWidth={260} closeButton={false} autoPan={false}>
                  <div className="bg-white dark:bg-gray-900 overflow-hidden cursor-default w-[220px]">
                    <div className="relative h-32 w-full bg-gray-100 dark:bg-gray-800">
                      {spot.image
                        ? <img src={spot.image} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightboxImage(spot.image!)} />
                        : <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600"><MapPin size={32} /></div>
                      }
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedSpotId(null); mapInstance?.closePopup(); }}
                        className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 transition-colors"
                      >
                        <X size={12} />
                      </button>
                      <div className="absolute bottom-2 left-2 flex gap-1">
                        {(spot.categories||[]).slice(0,2).map(c => {
                          const ci = CATEGORIES.find(x=>x.label===c);
                          return <span key={c} className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white ${ci?.color}`}>{c}</span>;
                        })}
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-black text-[13px] tracking-tight leading-tight text-gray-900 dark:text-gray-100 mb-1">{spot.name}</h3>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-1 text-amber-500 text-xs font-bold">
                          <Star size={11} fill="currentColor" />
                          <span>{getAverageRating(spot) > 0 ? getAverageRating(spot).toFixed(1) : 'New'}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-[10px]">({spot.reviews?.length || 0})</span>
                        </div>
                        {popupDist !== null && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {popupDist < 1 ? `${(popupDist*1000).toFixed(0)}m` : `${popupDist.toFixed(1)}km`}
                          </span>
                        )}
                      </div>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white w-full py-2 rounded-lg text-[11px] font-bold tracking-wide transition-colors"
                      >
                        <Navigation2 size={13} fill="white" /> Navigate
                      </a>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        <div className="absolute top-5 right-5 z-[1000] flex flex-col gap-2">
          <button
            onClick={() => setSettings(s => ({ ...s, mode: s.mode === 'streets' ? 'satellite' : 'streets' }))}
            className={`w-10 h-10 rounded-xl shadow-md flex items-center justify-center transition-all active:scale-90 border ${settings.mode === 'satellite' ? 'bg-emerald-500 border-emerald-400/50 text-white shadow-emerald-500/20' : 'bg-white/90 dark:bg-slate-800/90 border-gray-200/60 dark:border-slate-700/60 text-gray-500 dark:text-gray-400 backdrop-blur-sm'}`}
          ><Layers size={17} /></button>
          <button
            onClick={() => { setLocationDenied(false); setSelectedSpotId(null); mapInstance?.closePopup(); setLocationStatus('searching'); mapInstance?.locate({ setView: true, maxZoom: 16 }); }}
            className={`w-10 h-10 rounded-xl shadow-md flex items-center justify-center transition-all active:scale-90 border ${locationDenied ? 'bg-red-500 border-red-400/50 text-white shadow-red-500/20' : 'bg-white/90 dark:bg-slate-800/90 border-gray-200/60 dark:border-slate-700/60 text-emerald-500 dark:text-emerald-400 backdrop-blur-sm'}`}
          ><LocateFixed size={17} /></button>
          <button
            onClick={() => { setShowAddModal({ lat: mapInstance?.getCenter().lat || 0, lng: mapInstance?.getCenter().lng || 0 }); setAddMode('options'); }}
            className="w-10 h-10 bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-500/25 flex items-center justify-center active:scale-90 transition-all border border-emerald-400/40"
          ><Plus size={19} strokeWidth={2.5} /></button>
        </div>

        {isPickingLocation && (
          <div className="absolute top-10 left-0 right-0 z-[2000] flex justify-center px-4 pointer-events-none">
            <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-black text-xs border-2 border-white/30 backdrop-blur-lg pointer-events-auto animate-pulse">
              <MapPin size={20} /> Select Location
              <button onClick={() => setIsPickingLocation(false)} className="p-1.5 bg-black/10 rounded-full ml-2"><X size={16} /></button>
            </div>
          </div>
        )}

        {movingSpotId && (
          <div className="absolute top-10 left-0 right-0 z-[2000] flex justify-center px-4 pointer-events-none">
            <div className="bg-amber-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-black text-xs border-2 border-white/30 backdrop-blur-lg pointer-events-auto animate-pulse">
              <Move size={18} /> Tap the new location on the map
              <button onClick={() => setMovingSpotId(null)} className="p-1.5 bg-black/10 rounded-full ml-2"><X size={16} /></button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {locationStatus !== 'idle' && (
            <motion.div
              key={locationStatus}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="absolute top-6 left-1/2 -translate-x-1/2 z-[2000] pointer-events-none"
            >
              <div className={`px-4 py-2.5 rounded-full shadow-xl text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap ${locationStatus === 'searching' ? 'bg-blue-600' : locationStatus === 'found' ? 'bg-emerald-600' : 'bg-red-500'}`}>
                {locationStatus === 'searching' && <><LocateFixed size={14} className="animate-spin" /> Finding your location…</>}
                {locationStatus === 'found' && <><CheckCircle2 size={14} /> Location found</>}
                {locationStatus === 'error' && <><AlertCircle size={14} /> Location unavailable — check browser permissions</>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile drawer backdrop — tap map area to close */}
      {drawerState !== 'hidden' && (
        <div
          className="lg:hidden absolute inset-0 z-[1498] pointer-events-auto"
          onClick={() => setDrawerState('hidden')}
        />
      )}

      <div className="lg:hidden absolute bottom-0 left-0 right-0 z-[1500] pointer-events-none">
        <motion.div
          animate={{ y: drawerState === 'full' ? '0%' : drawerState === 'half' ? '50%' : '92%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          className="bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-2xl h-[94vh] flex flex-col pointer-events-auto border-t border-gray-100 dark:border-slate-800"
        >
          {/* Drag handle — the only draggable area */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.12}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.velocity.y < -300 || info.offset.y < -40)
                setDrawerState(prev => prev === 'hidden' ? 'half' : 'full');
              else if (info.velocity.y > 300 || info.offset.y > 40)
                setDrawerState(prev => prev === 'full' ? 'half' : 'hidden');
            }}
            onClick={() => {
              if (drawerState === 'hidden') setDrawerState('half');
              else if (drawerState === 'half') setDrawerState('full');
              else setDrawerState('hidden');
            }}
            className="h-12 w-full flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}
          >
            <div className="w-10 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </motion.div>

          {/* Content — stops drag events from propagating to the drawer */}
          <div
            className="flex-1 overflow-hidden relative"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {renderSidebarContent()}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => { if (isAddingSpot) return; setShowAddModal(null); setAddSpotError(''); setEditingSpot(null); }} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 30 }} className="relative w-full max-w-sm lg:max-w-4xl bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl shadow-2xl p-6 md:p-10 space-y-6 md:space-y-8 max-h-[95vh] overflow-y-auto no-scrollbar border border-gray-100 dark:border-slate-800">
              {addMode === 'options' ? (
                <div className="space-y-6 max-w-sm mx-auto">
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Add a Spot</h2>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Share a hidden gem with the community</p>
                  </div>
                  <div className="grid gap-4">
                    <button onClick={handleAddLiveLocation} className="w-full p-5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl flex items-center gap-4 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all active:scale-95">
                      <div className="w-11 h-11 bg-emerald-600 text-white rounded-xl flex items-center justify-center"><Navigation size={20} /></div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-gray-800 dark:text-emerald-100">Use my location</p>
                        <p className="text-xs text-gray-500 dark:text-emerald-300/60 mt-0.5">Add a spot where you are now</p>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 dark:text-emerald-700" />
                    </button>
                    <button onClick={() => { setShowAddModal(null); setIsPickingLocation(true); }} className="w-full p-5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl flex items-center gap-4 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all active:scale-95">
                      <div className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center"><MapIcon size={20} /></div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-gray-800 dark:text-blue-100">Pick on map</p>
                        <p className="text-xs text-gray-500 dark:text-blue-300/60 mt-0.5">Tap to choose any location</p>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 dark:text-blue-700" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{editingSpot ? 'Edit Spot' : 'New Spot'}</h2>
                    <button onClick={() => { setAddMode('options'); setAddSpotError(''); setEditingSpot(null); }} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-xl text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"><ArrowLeft size={18} /></button>
                  </div>
                  <SpotForm onSubmit={(d, cats, img) => editingSpot ? handleEditSpot(d, cats, img) : handleAddSpot(d, cats, img)} initialData={editingSpot} isSubmitting={isAddingSpot} submitError={addSpotError} />
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showAuthModal && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" onClick={() => setShowAuthModal(null)} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl text-center border border-gray-100 dark:border-slate-800">
               <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/20">
                 <UserIcon size={26} />
               </div>
               <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{showAuthModal === 'login' ? 'Welcome back' : 'Create account'}</h2>
               <p className="text-xs text-gray-400 dark:text-slate-500 mb-6">{showAuthModal === 'login' ? 'Sign in to your SpekPlatz account' : 'Join the SpekPlatz community'}</p>
               <form onSubmit={(e) => handleAuth(showAuthModal!, e)} className="space-y-3 text-left">
                 <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Nickname</label>
                    <input name="nickname" placeholder="Your nickname" required className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl font-medium outline-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-sm" />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Password</label>
                    <input type="password" name="password" placeholder="••••••••" required className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 rounded-xl font-medium outline-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-sm" />
                 </div>
                 {authError && <p className="text-xs text-red-500 dark:text-red-400 text-center">{authError}</p>}
                 <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors active:scale-95 mt-2">
                   {showAuthModal === 'login' ? 'Sign in' : 'Create account'}
                 </button>
               </form>
               <button onClick={() => setShowAuthModal(showAuthModal === 'login' ? 'signup' : 'login')} className="mt-4 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                 {showAuthModal === 'login' ? 'New here? Create account' : 'Already have one? Sign in'}
               </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Legal Modal */}
      <AnimatePresence>
        {showLegalModal && (
          <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowLegalModal(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-slate-800 max-h-[85vh] overflow-y-auto no-scrollbar">
              <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 pt-6 pb-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => setShowLegalModal('terms')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${showLegalModal === 'terms' ? 'bg-emerald-600 text-white' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'}`}>Terms & Conditions</button>
                  <button onClick={() => setShowLegalModal('privacy')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${showLegalModal === 'privacy' ? 'bg-emerald-600 text-white' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'}`}>Privacy Policy</button>
                </div>
                <button onClick={() => setShowLegalModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><X size={18} /></button>
              </div>
              <div className="px-6 py-5 space-y-4 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                {showLegalModal === 'terms' ? (
                  <>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Terms & Conditions</p>
                    <p>Last updated: February 2026</p>
                    <p>By using SpekPlatz, you agree to these terms. SpekPlatz is a community platform for discovering and sharing hidden spots. It is provided as-is for personal, non-commercial use.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Content Guidelines</p>
                    <p>You are responsible for all content you submit. Do not post illegal content, private property locations without permission, dangerous or restricted areas, or content that violates others' privacy.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Liability</p>
                    <p>SpekPlatz is not responsible for the accuracy of user-submitted locations, safety conditions at any spot, or any harm arising from visiting spots listed on the platform. Always use your own judgment and respect local laws.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Your Account</p>
                    <p>Accounts are created with a nickname and password. You are responsible for keeping your credentials secure. We reserve the right to remove accounts or content that violates these terms.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Changes</p>
                    <p>We may update these terms at any time. Continued use of SpekPlatz after changes constitutes acceptance.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Privacy Policy</p>
                    <p>Last updated: February 2026</p>
                    <p>SpekPlatz takes your privacy seriously. Here's what we collect and how we use it.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">What We Collect</p>
                    <p>When you create an account: your chosen nickname and password (stored in our database). When you add spots or reviews: the content you submit, including any photos. Your approximate location is used only when you click "Use my location" and is never stored on our servers.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">How We Use It</p>
                    <p>Your data is used solely to operate the SpekPlatz platform — displaying spots, reviews, and personalising your saved spots. We do not sell, share, or monetise your data.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Data Storage</p>
                    <p>Data is stored securely in Google Firebase (Firestore). Your session is stored locally in your browser. Photos are stored as base64 inside Firestore documents.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Your Rights</p>
                    <p>You may request deletion of your account and all associated data at any time by contacting us. Spots and reviews you created can be deleted from within the app.</p>
                    <p className="font-medium text-gray-700 dark:text-gray-300">Contact</p>
                    <p>For any privacy questions, reach out via the SpekPlatz GitHub page.</p>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9000] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightboxImage(null)}
          >
            <motion.img
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              src={lightboxImage}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SpotForm = ({ onSubmit, initialData, isSubmitting, submitError }: { onSubmit: (data: any, cats: CategoryType[], img: string | null) => void, initialData?: Spot | null, isSubmitting?: boolean, submitError?: string }) => {
  const [cats, setCats] = useState<CategoryType[]>(initialData?.categories || []);
  const [img, setImg] = useState<string | null>(initialData?.image || null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Spot name *</label>
          <input id="f-name" defaultValue={initialData?.name} placeholder="e.g. Rooftop at Sunset…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl outline-none font-medium text-sm border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Category * <span className="font-normal text-gray-400 dark:text-slate-500">(pick one or more)</span></label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.label}
                type="button"
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
          <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Cover photo</label>
          <button onClick={() => fileRef.current?.click()} type="button" className="w-full h-32 md:h-40 bg-gray-50 dark:bg-slate-800 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600 hover:text-emerald-500 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all overflow-hidden relative">
            {img ? (
              <img src={img} className="w-full h-full object-cover" />
            ) : <><Camera size={28} /><span className="text-xs font-medium mt-2 text-gray-400 dark:text-slate-500">Tap to add a photo</span></>}
          </button>
          <input type="file" hidden ref={fileRef} accept="image/*" onChange={e => {
            const f = e.target.files?.[0];
            if(f) { const r = new FileReader(); r.onloadend = () => compressImage(r.result as string).then(setImg); r.readAsDataURL(f); }
          }} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Description</label>
          <textarea id="f-desc" defaultValue={initialData?.description} placeholder="Best time to visit, how to get there, vibes…" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl outline-none text-sm h-24 md:h-32 resize-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      <div className="lg:col-span-2 pt-2">
        {(error || submitError) && <p className="text-xs text-red-500 dark:text-red-400 text-center mb-3">{error || submitError}</p>}
        <button disabled={isSubmitting} onClick={(e) => {
          e.stopPropagation();
          const n = (document.getElementById('f-name') as HTMLInputElement).value;
          const d = (document.getElementById('f-desc') as HTMLTextAreaElement).value;
          if(!n || cats.length === 0) {
            setError('Please add a name and at least one category.');
            return;
          }
          setError('');
          onSubmit({ name: n, description: d }, cats, img);
        }} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-semibold text-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100">
          {isSubmitting ? 'Saving…' : (initialData ? 'Save changes' : 'Add this spot')}
        </button>
      </div>
    </div>
  );
};

export default App;
