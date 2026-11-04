import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
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
  Ghost,
  Layers,
  LocateFixed,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  MoreHorizontal,
  Move,
  Crosshair,
  Eye,
  EyeOff,
  Sparkles,
  Lock,
  Flag,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  linkWithCredential,
  signOut,
  onAuthStateChanged,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import {
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
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';

import { Spot, CategoryType, User, MapSettings, Review } from './types';
import { CATEGORIES, INITIAL_CENTER, INITIAL_ZOOM } from './constants';
import { PUBLIC_SPOTS } from './publicData';
import { formatDistanceToNow } from 'date-fns';
import { auth, db, isAdminName, nicknameToEmail, NICKNAME_PATTERN } from './lib/firebase';
import { getTileSource, hasMapyKey } from './lib/tiles';
import {
  REVIEW_IMAGE,
  compressImageFile,
  formatDistance,
  getAverageRating,
  getDistance,
  randomId,
  readJson,
  reviewAvatar,
  safeImageSrc,
} from './lib/utils';
import SpotForm, { SpotFormData } from './components/SpotForm';
import CoordinatesForm from './components/CoordinatesForm';
import LegalModal, { LegalTab } from './components/LegalModal';

const LOCAL_SAVED_KEY = 'spekplatz_local_saved';
const THEME_KEY = 'spekplatz_theme';
const REVIEW_MAX = 1000;
const NAME_MAX = 40;
const CONTACT_EMAIL = 'contactme@resonantlabs.online';

// Cut to max UTF-16 units without leaving half of an emoji (a lone surrogate breaks encodeURIComponent).
const clip = (s: string, max: number) => s.slice(0, max).replace(/[\uD800-\uDBFF]$/, '');

const AVATAR_SEEDS = ['maple', 'luna', 'pixel', 'nova', 'river', 'echo', 'sage', 'atlas', 'felix', 'mochi', 'zara', 'indigo'];
const AVATAR_OPTIONS = AVATAR_SEEDS.map(s => `https://api.dicebear.com/7.x/avataaars/svg?seed=${s}`);

const errorCode = (err: unknown) => err instanceof FirebaseError ? err.code : '';
const SESSION_ERROR = 'Could not connect to SpekPlatz. Check your connection and try again.';

const writeLocal = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
};

const CATEGORY_LABELS = new Set<string>(CATEGORIES.map(c => c.label));

const inRange = (v: unknown, limit: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

// Firestore data is written by anyone; drop malformed values so one bad
// document cannot crash rendering for every visitor. Spots without a valid
// position are dropped entirely (Leaflet throws on them).
const normalizeSpot = (raw: Record<string, unknown> & { id: string }): Spot | null => {
  const spot = raw as unknown as Spot;
  if (!inRange(spot.lat, 90) || !inRange(spot.lng, 180)) return null;
  return {
    ...spot,
    name: typeof spot.name === 'string' ? spot.name : '',
    description: typeof spot.description === 'string' ? spot.description : '',
    createdAt: typeof spot.createdAt === 'string' ? spot.createdAt : '',
    categories: Array.isArray(spot.categories)
      ? spot.categories.filter((c): c is CategoryType => typeof c === 'string' && CATEGORY_LABELS.has(c))
      : [],
    reviews: Array.isArray(spot.reviews)
      ? spot.reviews
          .filter(r => r && typeof r === 'object' && typeof r.comment === 'string' && typeof r.rating === 'number')
          .map((r, i) => ({
            ...r,
            id: typeof r.id === 'string' ? r.id : `review-${i}`,
            userName: typeof r.userName === 'string' ? r.userName : 'Anonymous Explorer',
            date: typeof r.date === 'string' ? r.date : '',
          }))
      : [],
  };
};

const timeAgo = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : formatDistanceToNow(date, { addSuffix: true });
};

const REPO_ISSUES_URL = 'https://github.com/sokiicz/SpekPlatz/issues';
const reportUrl = (spot: Spot) => {
  const params = new URLSearchParams({
    title: `Report: ${spot.name}`.slice(0, 120),
    body: `Spot: ${spot.name.slice(0, 200)}\nSpot ID: ${spot.id}\n\nWhat is wrong (illegal content, private property, a dangerous place, someone's privacy, other):\n`,
  });
  return `${REPO_ISSUES_URL}/new?${params}`;
};

const createCustomIcon = (categories: CategoryType[]) => {
  const primaryCat = categories[0] || 'Other';
  const cat = CATEGORIES.find(c => c.label === primaryCat) || CATEGORIES[CATEGORIES.length - 1];
  const hexMap: Record<string, string> = {
    'bg-blue-500': '#3b82f6', 'bg-emerald-500': '#10b981', 'bg-orange-500': '#f97316', 'bg-purple-500': '#a855f7',
    'bg-cyan-500': '#06b6d4', 'bg-gray-700': '#374151', 'bg-indigo-500': '#6366f1', 'bg-slate-500': '#64748b',
    'bg-sky-500': '#0ea5e9', 'bg-green-600': '#16a34a', 'bg-amber-700': '#b45309',
  };
  const hex = hexMap[cat.color] || '#10b981';

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

// Cache icons so createCustomIcon isn't called on every render
const iconCache = new Map<string, L.DivIcon>();
const getCachedIcon = (cats: CategoryType[] = []): L.DivIcon => {
  const key = [...cats].sort().join(',') || 'Other';
  if (!iconCache.has(key)) iconCache.set(key, createCustomIcon(cats));
  return iconCache.get(key)!;
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
  const map = useMap();
  const longPressRef = useRef(onLongPress);
  longPressRef.current = onLongPress;
  const lastLongPressAt = useRef(0);

  const fireLongPress = useCallback((lat: number, lng: number) => {
    // Android fires both our touch timer and a native contextmenu — handle once.
    if (Date.now() - lastLongPressAt.current < 800) return;
    lastLongPressAt.current = Date.now();
    longPressRef.current(lat, lng);
  }, []);

  useMapEvents({
    moveend: (e) => onViewportChange(e.target.getBounds()),
    // wrap(): after panning across the antimeridian Leaflet reports lng outside −180…180.
    click: (e) => { const p = e.latlng.wrap(); onMapClick(p.lat, p.lng); },
    dragstart: () => onDragStart(),
    locationfound: (e) => onLocationFound(e.latlng.lat, e.latlng.lng),
    locationerror: () => onLocationError(),
    // Right click on desktop, long press on Android.
    contextmenu: (e) => { const p = e.latlng.wrap(); fireLongPress(p.lat, p.lng); },
  });

  // Leaflet has no touch long-press event (iOS fires no contextmenu), so track it on the container.
  useEffect(() => {
    const el = map.getContainer();
    let timer: number | null = null;
    let start: { x: number; y: number } | null = null;
    const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } start = null; };
    const onStart = (e: TouchEvent) => {
      cancel();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      timer = window.setTimeout(() => {
        if (!start) return;
        const rect = el.getBoundingClientRect();
        const latlng = map.containerPointToLatLng([start.x - rect.left, start.y - rect.top]).wrap();
        cancel();
        fireLongPress(latlng.lat, latlng.lng);
      }, 650);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) cancel();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);
    return () => {
      cancel();
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', cancel);
      el.removeEventListener('touchcancel', cancel);
    };
  }, [map, fireLongPress]);

  return null;
};

const Toast = ({ toast, onClose }: { toast: { message: string; kind: 'error' | 'success' }; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 16 }}
    role={toast.kind === 'error' ? 'alert' : 'status'}
    className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9500] px-4 py-2.5 rounded-full shadow-xl text-white text-xs font-semibold flex items-center gap-2 max-w-[90vw] ${toast.kind === 'error' ? 'bg-red-500' : 'bg-emerald-600'}`}
  >
    {toast.kind === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
    <span>{toast.message}</span>
    <button onClick={onClose} aria-label="Dismiss" className="ml-1 p-0.5 rounded-full hover:bg-white/20"><X size={12} /></button>
  </motion.div>
);

const App: React.FC = () => {
  const [spots, setSpots] = useState<Spot[]>(PUBLIC_SPOTS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Firebase uid of whoever is signed in, including anonymous sessions — the server-side owner id.
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [isAnonSession, setIsAnonSession] = useState(false);
  const [settings, setSettings] = useState<MapSettings>(() => ({
    mode: 'streets',
    theme: readJson<'light' | 'dark' | null>(THEME_KEY, null)
      ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  }));
  const [toast, setToast] = useState<{ message: string; kind: 'error' | 'success' } | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [activeCategories, setActiveCategories] = useState<CategoryType[]>([]);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleBounds, setVisibleBounds] = useState<L.LatLngBounds | null>(null);
  const [drawerState, setDrawerState] = useState<'hidden' | 'half' | 'full'>('half');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [savedSpotIds, setSavedSpotIds] = useState<string[]>(() => readJson<string[]>(LOCAL_SAVED_KEY, []));
  const [locationStatus, setLocationStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');
  const [showLegalModal, setShowLegalModal] = useState<LegalTab | null>(null);
  const markerRefs = useRef<{ [key: string]: L.Marker | null }>({});
  const [showAddModal, setShowAddModal] = useState<{lat: number, lng: number} | null>(null);
  const [addMode, setAddMode] = useState<'options' | 'form' | 'coordinates'>('options');
  const [editingSpot, setEditingSpot] = useState<Spot | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [filterSavedOnly, setFilterSavedOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState<'login' | 'signup' | null>(null);
  const [authError, setAuthError] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupAvatar, setSignupAvatar] = useState(AVATAR_OPTIONS[0]);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'rating' | 'distance'>('date');
  const [reviewText, setReviewText] = useState('');
  const [anonName, setAnonName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [isAddingSpot, setIsAddingSpot] = useState(false);
  const [addSpotError, setAddSpotError] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);
  const [reviewImage, setReviewImage] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const reviewImageRef = useRef<HTMLInputElement>(null);
  const [movingSpotId, setMovingSpotId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const toastTimer = useRef<number | null>(null);
  const notify = useCallback((message: string, kind: 'error' | 'success' = 'error') => {
    setToast({ message, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  // Restore auth session via Firebase Auth. Anonymous sessions are created lazily
  // on the first write (see ensureSession), never just for visiting.
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthUid(firebaseUser?.uid ?? null);
      setIsAnonSession(!!firebaseUser?.isAnonymous);
      if (!firebaseUser) {
        setCurrentUser(null);
        return;
      }
      if (firebaseUser.isAnonymous) {
        setCurrentUser(null);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setCurrentUser({ id: firebaseUser.uid, name: data.name, avatar: data.avatar });
          setSavedSpotIds(data.savedSpotIds || []);
        }
      } catch (err) {
        console.warn('Failed to load user profile', err);
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'spots'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbSpots = snapshot.docs
        .map(d => normalizeSpot({ ...d.data(), id: d.id }))
        .filter((s): s is Spot => s !== null);
      // Firestore versions override public spots (allows admins to move/edit hardcoded spots)
      const merged = PUBLIC_SPOTS.map(ps => dbSpots.find(s => s.id === ps.id) || ps);
      dbSpots.forEach(s => { if (!merged.find(p => p.id === s.id)) merged.push(s); });
      setSpots(merged);
    }, (err) => {
      console.warn("Firestore error, showing public data.", err);
      setSpots(PUBLIC_SPOTS);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    writeLocal(THEME_KEY, settings.theme);
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
      try {
        await updateDoc(doc(db, 'users', currentUser.id), {
          savedSpotIds: isNowSaved ? arrayUnion(spotId) : arrayRemove(spotId),
        });
      } catch (err) {
        console.error('Error saving spot:', err);
        setSavedSpotIds(savedSpotIds);
        notify('Could not update your saved spots. Try again.');
      }
    } else {
      writeLocal(LOCAL_SAVED_KEY, newSaved);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setSavedSpotIds([]);
    setCurrentUser(null);
    setShowProfileModal(false);
    setConfirmDeleteAccount(false);
  };

  const isAdmin = isAdminName(currentUser?.name);
  const canManageSpot = (spot: Spot) => isAdmin || (!!authUid && spot.createdBy === authUid);
  // Spots owned by the current anonymous session; signing in (not signing up) would orphan them.
  const anonSpotCount = isAnonSession && authUid ? spots.filter(s => s.createdBy === authUid).length : 0;

  // Map markers show all spots matching filters (never filtered by viewport)
  const mapMarkerSpots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return spots.filter(spot => {
      const matchesCategory = activeCategories.length === 0 || (spot.categories || []).some(c => activeCategories.includes(c));
      const matchesSearch = !q || spot.name.toLowerCase().includes(q) || (spot.description || '').toLowerCase().includes(q);
      const isSavedFilter = filterSavedOnly ? savedSpotIds.includes(spot.id) : true;
      const matchesRating = !spot.reviews?.length || getAverageRating(spot) >= minRating; // no reviews = always show
      return matchesCategory && matchesSearch && isSavedFilter && matchesRating;
    });
  }, [spots, activeCategories, searchQuery, filterSavedOnly, minRating, savedSpotIds]);

  // Sidebar list is additionally filtered to the current viewport
  const filteredSpots = useMemo(() => {
    const result = mapMarkerSpots.filter(spot => visibleBounds ? visibleBounds.contains([spot.lat, spot.lng]) : true);

    return result.sort((a, b) => {
      if (sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'rating') return getAverageRating(b) - getAverageRating(a);
      if (sortBy === 'distance' && userLocation) {
        return getDistance(userLocation[0], userLocation[1], a.lat, a.lng) - getDistance(userLocation[0], userLocation[1], b.lat, b.lng);
      }
      return 0;
    });
  }, [mapMarkerSpots, visibleBounds, sortBy, userLocation]);

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

  // Stable refs so map callbacks never need to be re-registered
  const spotsRef = useRef<Spot[]>(spots);
  useEffect(() => { spotsRef.current = spots; }, [spots]);
  const selectedSpotIdRef = useRef<string | null>(null);
  useEffect(() => { selectedSpotIdRef.current = selectedSpotId; }, [selectedSpotId]);
  const isPickingLocationRef = useRef(false);
  useEffect(() => { isPickingLocationRef.current = isPickingLocation; }, [isPickingLocation]);
  const mapInstanceRef = useRef<L.Map | null>(null);
  useEffect(() => { mapInstanceRef.current = mapInstance; }, [mapInstance]);
  const movingSpotIdRef = useRef<string | null>(null);
  useEffect(() => { movingSpotIdRef.current = movingSpotId; }, [movingSpotId]);
  const drawerStateRef = useRef<'hidden' | 'half' | 'full'>('half');
  useEffect(() => { drawerStateRef.current = drawerState; }, [drawerState]);
  const notifyRef = useRef(notify);

  // Fully stable — never re-registers Leaflet events
  const handleMapClick = useCallback((lat: number, lng: number) => {
    const moving = movingSpotIdRef.current;
    if (moving) {
      const spotData = spotsRef.current.find(s => s.id === moving);
      if (!spotData) { setMovingSpotId(null); return; }
      setMovingSpotId(null);
      setSelectedSpotId(moving);
      // Only touch the coordinates, so a review added meanwhile is not overwritten.
      // Hardcoded public spots have no Firestore doc until first moved.
      updateDoc(doc(db, 'spots', moving), { lat, lng })
        .catch(err => {
          if (errorCode(err) !== 'not-found') throw err;
          const { id: _id, isSaved: _saved, ...rest } = spotData;
          return setDoc(doc(db, 'spots', moving), { ...rest, lat, lng });
        })
        .catch(err => { console.error('Error moving spot:', err); notifyRef.current('Could not move the spot. Try again.'); });
      return;
    }
    if (window.innerWidth < 1024 && drawerStateRef.current !== 'hidden') setDrawerState('hidden');
    if (selectedSpotIdRef.current) {
      setSelectedSpotId(null);
      mapInstanceRef.current?.closePopup();
      return;
    }
    if (isPickingLocationRef.current) {
      setShowAddModal({ lat, lng });
      setAddMode('form');
      setIsPickingLocation(false);
    }
  }, []);

  const handleLongPress = useCallback((lat: number, lng: number) => {
    if (movingSpotIdRef.current) return;
    setIsPickingLocation(false);
    setShowAddModal({ lat, lng });
    setAddMode('form');
  }, []);

  const handleMapDragStart = useCallback(() => {
    if (window.innerWidth < 1024 && drawerStateRef.current === 'full') setDrawerState('half');
  }, []);

  // Drawer gesture detection — track inner scroll via capture-phase listener
  const drawerContentRef = useRef<HTMLDivElement>(null);
  const innerScrollTop = useRef(0);
  const touchStart = useRef<{ y: number; scrollTop: number } | null>(null);
  useEffect(() => {
    const el = drawerContentRef.current;
    if (!el) return;
    const handler = (e: Event) => { innerScrollTop.current = (e.target as HTMLElement).scrollTop ?? 0; };
    el.addEventListener('scroll', handler, { capture: true, passive: true });
    return () => el.removeEventListener('scroll', handler, { capture: true });
  }, []);

  const handleDrawerTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { y: e.touches[0].clientY, scrollTop: innerScrollTop.current };
  }, []);

  const handleDrawerTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dy = touchStart.current.y - e.changedTouches[0].clientY; // positive = swipe up
    const startedAtTop = touchStart.current.scrollTop <= 2;
    const stillAtTop = innerScrollTop.current <= 2;
    touchStart.current = null;
    if (Math.abs(dy) < 40) return;
    if (dy > 40 && startedAtTop) {
      // Swipe up from top → open fully
      setDrawerState('full');
    } else if (dy < -40 && startedAtTop && stillAtTop) {
      // Swipe down, wasn't scrolling content → close
      setDrawerState('hidden');
    }
  }, []);

  const handleEditSpot = async (data: SpotFormData, categories: CategoryType[], image: string | null) => {
    if (!editingSpot || !data.name || categories.length === 0) return;
    setIsAddingSpot(true);
    setAddSpotError('');
    try {
      await updateDoc(doc(db, 'spots', editingSpot.id), {
        name: data.name,
        description: data.description,
        categories,
        image,
      });
      setShowAddModal(null);
      setAddMode('options');
      setEditingSpot(null);
      notify('Spot updated', 'success');
    } catch (err) {
      console.error("Error updating spot:", err);
      setAddSpotError(errorCode(err) === 'permission-denied'
        ? 'You can only edit spots you added.'
        : 'Failed to update spot. Check your connection and try again.');
    } finally {
      setIsAddingSpot(false);
    }
  };

  const handleAddSpot = async (data: SpotFormData, categories: CategoryType[], image: string | null) => {
    if (!showAddModal || !data.name || categories.length === 0) return;

    setIsAddingSpot(true);
    setAddSpotError('');
    try {
      const creatorId = await ensureSession();
      if (!creatorId) {
        setAddSpotError(SESSION_ERROR);
        return;
      }
      const docRef = await addDoc(collection(db, 'spots'), {
        name: data.name,
        description: data.description,
        categories,
        image,
        lat: showAddModal.lat,
        lng: showAddModal.lng,
        createdBy: creatorId,
        createdAt: new Date().toISOString(),
        reviews: [],
      });
      setShowAddModal(null);
      setAddMode('options');
      setSelectedSpotId(docRef.id);
      if (window.innerWidth < 1024) setDrawerState('half');
      notify('Spot added — thanks for sharing!', 'success');
    } catch (err) {
      console.error("Error adding spot:", err);
      setAddSpotError('Failed to save spot. Check your connection and try again.');
    } finally {
      setIsAddingSpot(false);
    }
  };

  // Anonymous session on first write, so owners can later edit their spots.
  // Every write needs a session (Firestore rules); null means none could be started.
  const ensureSession = async (): Promise<string | null> => {
    if (auth.currentUser) return auth.currentUser.uid;
    try {
      return (await signInAnonymously(auth)).user.uid;
    } catch (err) {
      console.info('Anonymous session unavailable:', errorCode(err));
      return null;
    }
  };

  const handleReviewImage = async (file?: File) => {
    if (!file) return;
    try {
      setReviewImage(await compressImageFile(file, REVIEW_IMAGE.maxPx, REVIEW_IMAGE.quality));
    } catch {
      notify('This photo could not be read. Try a JPEG or PNG.');
    }
  };

  const handleAddReview = async (spot: Spot) => {
    const comment = reviewText.trim();
    if (!comment || isSubmittingReview) return;
    const authorName = clip(currentUser?.name || anonName.trim() || 'Anonymous Explorer', NAME_MAX);
    setIsSubmittingReview(true);
    try {
      const userId = await ensureSession();
      if (!userId) {
        notify(SESSION_ERROR);
        return;
      }
      // Firestore rejects `undefined` values, so optional fields are added only when set.
      const newReview: Review = {
        id: randomId(),
        userId,
        userName: authorName,
        rating: reviewRating,
        comment: clip(comment, REVIEW_MAX),
        date: new Date().toISOString(),
        ...(reviewImage ? { image: reviewImage } : {}),
      };
      // One write: the review, plus the review photo as cover if the spot has none.
      await updateDoc(doc(db, 'spots', spot.id), {
        reviews: arrayUnion(newReview),
        ...(reviewImage && !spot.image ? { image: reviewImage } : {}),
      });
      setReviewText('');
      setAnonName('');
      setReviewRating(5);
      setReviewImage(null);
      notify('Review posted', 'success');
    } catch (err) {
      console.error("Error adding review:", err);
      notify('Could not post your review. Try again.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleDeleteSpot = async (spotId: string) => {
    try {
      await deleteDoc(doc(db, 'spots', spotId));
      setSelectedSpotId(null);
      setConfirmDeleteId(null);
      notify('Spot deleted', 'success');
    } catch (err) {
      console.error('Delete failed:', err);
      notify(errorCode(err) === 'permission-denied' ? 'You can only delete spots you added.' : 'Could not delete the spot. Try again.');
    }
  };

  const takeLocalSaved = () => readJson<string[]>(LOCAL_SAVED_KEY, []);
  const clearLocalSaved = () => { try { localStorage.removeItem(LOCAL_SAVED_KEY); } catch { /* ignore */ } };

  const handleAuth = async (type: 'login' | 'signup', e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isAuthSubmitting) return;
    setAuthError('');
    const data = new FormData(e.currentTarget);
    const nickname = String(data.get('nickname') || '').trim();
    const password = String(data.get('password') || '');
    const email = nicknameToEmail(nickname);

    if (type === 'signup' && !NICKNAME_PATTERN.test(nickname)) {
      setAuthError('Nickname: 3–30 letters, digits, dots, dashes or underscores');
      return;
    }

    setIsAuthSubmitting(true);
    try {
      if (type === 'signup') {
        // Upgrade the anonymous session in place so spots added before signing up stay yours.
        const anonUser = auth.currentUser?.isAnonymous ? auth.currentUser : null;
        const cred = anonUser
          ? await linkWithCredential(anonUser, EmailAuthProvider.credential(email, password))
          : await createUserWithEmailAndPassword(auth, email, password);
        await cred.user.getIdToken(true); // Firestore rules read the email claim
        const avatar = signupAvatar;
        // Merge any locally saved spots into the new account
        const localSaved = takeLocalSaved();
        await setDoc(doc(db, 'users', cred.user.uid), { name: nickname, avatar, savedSpotIds: localSaved });
        clearLocalSaved();
        setSavedSpotIds(localSaved);
        setCurrentUser({ id: cred.user.uid, name: nickname, avatar });
        setShowAuthModal(null);
        setShowSignupPassword(false);
        setSignupAvatar(AVATAR_OPTIONS[0]);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const userRef = doc(db, 'users', cred.user.uid);
        let userData;
        try {
          const userDoc = await getDoc(userRef);
          // Recreate a profile lost to an interrupted signup instead of locking the account out.
          // The name comes from the account email, so it matches what the rules expect.
          userData = userDoc.exists()
            ? userDoc.data()
            : { name: (cred.user.email || email).split('@')[0], avatar: AVATAR_OPTIONS[0], savedSpotIds: [] as string[] };
          if (!userDoc.exists()) await setDoc(userRef, userData);
        } catch (profileErr) {
          // Signed in but without a usable profile: do not leave a half-signed-in session behind.
          console.error('Profile load failed:', profileErr);
          await signOut(auth);
          setAuthError('Your profile could not be loaded, so you were signed out again. Try again later.');
          return;
        }
        // Merge locally saved spots
        const localSaved = takeLocalSaved();
        const userSaved: string[] = userData.savedSpotIds || [];
        const mergedSaved = Array.from(new Set([...userSaved, ...localSaved]));
        let finalSaved = userSaved;
        if (localSaved.length > 0) {
          try {
            await updateDoc(doc(db, 'users', cred.user.uid), { savedSpotIds: mergedSaved });
            clearLocalSaved();
            finalSaved = mergedSaved;
          } catch (mergeErr) {
            // Keep the local list for the next sign-in instead of failing the whole login.
            console.warn('Could not merge saved spots:', mergeErr);
          }
        }
        setSavedSpotIds(finalSaved);
        setCurrentUser({ id: cred.user.uid, name: userData.name, avatar: userData.avatar });
        setShowAuthModal(null);
      }
    } catch (err) {
      const code = errorCode(err);
      if (['auth/email-already-in-use', 'auth/credential-already-in-use'].includes(code)) setAuthError('Nickname already taken');
      else if (['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-email'].includes(code)) setAuthError('Invalid nickname or password');
      else if (code === 'auth/weak-password') setAuthError('Password must be at least 6 characters');
      else if (code === 'auth/too-many-requests') setAuthError('Too many attempts. Wait a moment and try again.');
      else if (code === 'auth/network-request-failed') setAuthError('No connection. Check your internet and try again.');
      else setAuthError('Authentication failed. Please try again.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // React clears currentTarget after the handler returns, so grab the form before awaiting.
    const form = e.currentTarget;
    setProfileError('');
    setProfileSuccess(false);
    const formData = new FormData(form);
    const currentPwd = String(formData.get('currentPassword') || '');
    const newPwd = String(formData.get('newPassword') || '');
    const confirmPwd = String(formData.get('confirmPassword') || '');

    if (newPwd !== confirmPwd) { setProfileError('New passwords do not match'); return; }
    if (newPwd.length < 6) { setProfileError('Password must be at least 6 characters'); return; }

    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !currentUser) { setProfileError('Please sign in again.'); return; }
    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email || nicknameToEmail(currentUser.name), currentPwd);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPwd);
      setProfileSuccess(true);
      form.reset();
    } catch (err) {
      const code = errorCode(err);
      if (['auth/wrong-password', 'auth/invalid-credential'].includes(code)) setProfileError('Current password is incorrect');
      else if (code === 'auth/too-many-requests') setProfileError('Too many attempts. Wait a moment and try again.');
      else setProfileError('Failed to update password. Please try again.');
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !currentUser) return;
    const password = String(new FormData(e.currentTarget).get('deletePassword') || '');
    setProfileError('');
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email || nicknameToEmail(currentUser.name), password));
      await deleteDoc(doc(db, 'users', firebaseUser.uid));
      await deleteUser(firebaseUser);
      setSavedSpotIds([]);
      setCurrentUser(null);
      setShowProfileModal(false);
      setConfirmDeleteAccount(false);
      notify('Your account has been deleted', 'success');
    } catch (err) {
      const code = errorCode(err);
      setProfileError(['auth/wrong-password', 'auth/invalid-credential'].includes(code)
        ? 'Password is incorrect'
        : 'Could not delete your account. Please try again.');
    }
  };

  const handleAvatarChange = async (avatarUrl: string) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.id), { avatar: avatarUrl });
      setCurrentUser(prev => prev ? { ...prev, avatar: avatarUrl } : null);
    } catch (err) {
      console.error('Failed to update avatar', err);
      notify('Could not change your avatar. Try again.');
    }
  };

  const mainCategories = CATEGORIES.slice(0, 4);

  const renderSidebarContent = () => {
    if (selectedSpot) {
      const avg = getAverageRating(selectedSpot);
      const isOwner = canManageSpot(selectedSpot);
      const coverSrc = safeImageSrc(selectedSpot.image);

      return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden relative">
          <div className="p-3 md:p-4 flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <button onClick={() => { setSelectedSpotId(null); setConfirmDeleteId(null); }} aria-label="Back to list" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-gray-600 dark:text-gray-400">
              <ArrowLeft size={18} />
            </button>
            <h2 className="text-base md:text-lg font-semibold truncate flex-1 text-gray-900 dark:text-white">{selectedSpot.name}</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 no-scrollbar pb-32">
            <div className="relative h-52 md:h-64 w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-slate-800 shrink-0">
              {coverSrc ? (
                <img src={coverSrc} className="w-full h-full object-cover cursor-zoom-in" alt={selectedSpot.name} onClick={() => setLightboxImage(coverSrc)} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 dark:text-slate-600">
                  <Camera size={48} className="opacity-30 mb-2" />
                  <p className="text-xs font-medium text-gray-400 dark:text-slate-500">No photo yet</p>
                </div>
              )}
              <div className="absolute top-3 right-3">
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleSave(selectedSpot.id); }}
                  aria-label={savedSpotIds.includes(selectedSpot.id) ? 'Remove from saved' : 'Save spot'}
                  aria-pressed={savedSpotIds.includes(selectedSpot.id)}
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

              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed whitespace-pre-line break-words">
                {selectedSpot.description || "No description yet — be the first to explore and share your experience!"}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-slate-400">
                <a
                  href={reportUrl(selectedSpot)}
                  target="_blank" rel="noopener noreferrer"
                  title="Opens a public issue on GitHub (needs a free GitHub account)"
                  className="inline-flex items-center gap-1.5 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Flag size={12} /> Report this spot
                </a>
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Report: ${clip(selectedSpot.name, 120)} (${selectedSpot.id})`)}`}
                  className="underline hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  Report privately
                </a>
              </p>
            </div>
            
            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 flex items-center gap-2">
                <MessageSquare size={14} /> Reviews
              </h3>
              
              <div className="space-y-4">
                {selectedSpot.reviews?.map(rev => {
                  const revImg = safeImageSrc(rev.image);
                  return (
                  <div key={rev.id} className="bg-gray-50 dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700/50">
                    <div className="flex justify-between items-start mb-2 md:mb-3">
                      <div className="flex items-center gap-2 md:gap-3">
                        <img src={reviewAvatar(rev)} alt="" loading="lazy" className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-emerald-100 shadow-inner" />
                        <div>
                          <p className="text-[11px] md:text-xs font-bold text-gray-900 dark:text-gray-100">{rev.userName}</p>
                          <div className="flex text-amber-500 mt-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={8} fill={i < rev.rating ? 'currentColor' : 'none'} strokeWidth={2} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-slate-500">{timeAgo(rev.date)}</span>
                    </div>
                    <p className="text-[11px] md:text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed whitespace-pre-line break-words">"{rev.comment}"</p>
                    {revImg && <img src={revImg} loading="lazy" className="mt-2 w-full h-32 object-cover rounded-xl cursor-zoom-in" alt={`Photo by ${rev.userName}`} onClick={() => setLightboxImage(revImg)} />}
                  </div>
                  );
                })}
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
                      <button key={v} onClick={() => setReviewRating(v)} aria-label={`Rate ${v} of 5`} aria-pressed={reviewRating === v} className={`transition-all ${reviewRating >= v ? 'text-amber-400' : 'text-gray-300 dark:text-slate-600 hover:text-amber-300'}`}>
                        <Star size={16} fill={reviewRating >= v ? 'currentColor' : 'none'} />
                      </button>
                    ))}
                  </div>
                </div>
                {!currentUser && (
                  <input 
                    type="text" value={anonName} onChange={e => setAnonName(e.target.value)}
                    placeholder="Your nickname..." maxLength={NAME_MAX} aria-label="Your nickname"
                    className="w-full px-4 py-2.5 mb-2 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-xl text-base md:text-xs outline-none border border-gray-100 dark:border-gray-800 focus:ring-1 focus:ring-emerald-500"
                  />
                )}
                <div className="relative">
                  <textarea
                    value={reviewText} onChange={e => setReviewText(e.target.value)}
                    placeholder="Share your experience..." maxLength={REVIEW_MAX} aria-label="Your review"
                    className="w-full p-4 pr-12 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-2xl text-base md:text-xs outline-none focus:ring-2 focus:ring-emerald-500 border border-gray-100 dark:border-gray-700 h-20 resize-none transition-all shadow-inner"
                  />
                  <button
                    onClick={() => handleAddReview(selectedSpot)}
                    disabled={!reviewText.trim() || isSubmittingReview}
                    aria-label="Post review"
                    className="absolute bottom-3 right-3 p-2 bg-emerald-600 text-white rounded-xl shadow-xl hover:scale-110 transition-transform disabled:opacity-50 disabled:scale-100"
                  >
                    <Send size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="file" hidden ref={reviewImageRef} accept="image/*" onChange={e => { handleReviewImage(e.target.files?.[0]); e.target.value = ''; }} />
                  <button type="button" onClick={() => reviewImageRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-400 text-[10px] font-medium border border-gray-200 dark:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                    <Camera size={13} /> {reviewImage ? 'Change Photo' : 'Add Photo'}
                  </button>
                  {reviewImage && (
                    <div className="relative">
                      <img src={reviewImage} className="h-8 w-8 rounded-lg object-cover" alt="Selected review photo" />
                      <button onClick={() => setReviewImage(null)} aria-label="Remove photo" className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"><X size={8} /></button>
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
                      onClick={() => handleDeleteSpot(selectedSpot.id)}
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
              <button onClick={() => setSettings(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))} aria-label={settings.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                {settings.theme === 'light' ? <Moon size={16} className="text-gray-500" /> : <Sun size={16} className="text-amber-400" />}
              </button>
              <button
                onClick={() => currentUser ? setShowProfileModal(true) : setShowAuthModal('login')}
                className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                title={currentUser ? currentUser.name : 'Sign in'}
                aria-label={currentUser ? `Profile: ${currentUser.name}` : 'Sign in'}
              >
                {currentUser
                  ? <img src={currentUser.avatar} className="w-4 h-4 rounded-full" alt={currentUser.name} />
                  : <UserIcon size={16} className="text-gray-400 dark:text-gray-500" />}
              </button>
            </div>
          </div>

          <div className="space-y-2 md:space-y-4">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={16} />
              <input
                type="search" placeholder="Search spots…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Search spots"
                className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 border-none rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-base md:text-sm text-gray-700"
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
                  <button key={v} onClick={() => setMinRating(minRating === v ? 0 : v)} aria-label={`Minimum ${v} star${v > 1 ? 's' : ''}`} aria-pressed={minRating === v} className={`p-0.5 transition-all ${minRating >= v ? 'text-amber-400' : 'text-gray-300 dark:text-slate-600 hover:text-amber-300'}`}>
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
            const thumb = safeImageSrc(spot.image);
            return (
              <motion.div
                key={spot.id} onClick={() => handleSpotClick(spot)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSpotClick(spot); } }}
                whileTap={{ scale: 0.99 }}
                className={`group outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 bg-white dark:bg-slate-800 p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'ring-2 ring-emerald-500 border-transparent shadow-md z-10' : 'border-gray-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-700/50 hover:shadow-sm'}`}
              >
                <div className="flex gap-3">
                  <div className="w-[72px] h-[72px] rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-slate-700">
                    {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> :<div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-slate-600"><MapPin size={22} /></div>}
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
                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-500 shrink-0">{formatDistance(dist)}</span>
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
          <a href="https://buymeacoffee.com/sokii?utm_source=spekplatz&utm_medium=sidebar&utm_campaign=support" target="_blank" rel="noopener noreferrer" className="text-[10px] text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors">☕ Buy me a coffee</a>
          <span className="text-gray-200 dark:text-slate-700 text-[10px]">·</span>
          <a href="https://resonantlabs.online" target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-300 dark:text-slate-600 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors">A ResonantLabs app · resonantlabs.online</a>
        </div>
      </div>
    );
  };

  const handleAddLiveLocation = () => {
    if (!("geolocation" in navigator)) {
      notify("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      setShowAddModal({ lat: latitude, lng: longitude });
      setAddMode('form');
    }, () => {
      notify("Unable to retrieve location. Please check your browser permissions.");
    }, { enableHighAccuracy: true, timeout: 15000 });
  };

  const closeAddModal = () => {
    if (isAddingSpot) return;
    setShowAddModal(null);
    setAddSpotError('');
    setEditingSpot(null);
  };

  // Escape closes the topmost overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxImage) setLightboxImage(null);
      else if (showLegalModal) setShowLegalModal(null);
      else if (showAuthModal) { setShowAuthModal(null); setAuthError(''); }
      else if (showProfileModal) { setShowProfileModal(false); setConfirmDeleteAccount(false); }
      else if (showAddModal) closeAddModal();
      else if (showMapMenu) setShowMapMenu(false);
      else if (isPickingLocation) setIsPickingLocation(false);
      else if (movingSpotId) setMovingSpotId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tileSource = getTileSource(settings);
  const drawerMax = viewportHeight * 0.94;
  const mapModes = ([
    { id: 'streets', label: 'Streets' },
    { id: 'outdoor', label: 'Tourist' },
    { id: 'satellite', label: 'Satellite' },
  ] as const).filter(opt => opt.id !== 'outdoor' || hasMapyKey);

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 font-sans">
      <div className="hidden lg:block w-[28rem] h-full z-[1001] shrink-0">
        {renderSidebarContent()}
      </div>

      <div className="flex-1 relative h-full min-h-0">
        <MapContainer center={INITIAL_CENTER} zoom={INITIAL_ZOOM} scrollWheelZoom={true} ref={setMapInstance} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            key={tileSource.url + (tileSource.className || '')}
            url={tileSource.url}
            attribution={tileSource.attribution}
            maxZoom={tileSource.maxZoom}
            className={tileSource.className}
          />
          <MapController onViewportChange={setVisibleBounds} onLocationFound={handleLocationFound} onLocationError={handleLocationError} onMapClick={handleMapClick} onLongPress={handleLongPress} onDragStart={handleMapDragStart} />
          
          {userLocation && <CircleMarker center={userLocation} radius={10} pathOptions={{ fillColor: '#3b82f6', fillOpacity: 0.8, color: '#fff', weight: 4 }} />}

          {mapMarkerSpots.map(spot => {
            const popupDist = userLocation ? getDistance(userLocation[0], userLocation[1], spot.lat, spot.lng) : null;
            const popupImg = safeImageSrc(spot.image);
            const popupAvg = getAverageRating(spot);
            return (
              <Marker
                key={spot.id}
                position={[spot.lat, spot.lng]}
                icon={getCachedIcon(spot.categories)}
                ref={(el) => { markerRefs.current[spot.id] = el; }}
                eventHandlers={{ click: () => handleSpotClick(spot, true) }}
              >
                <Popup minWidth={220} maxWidth={260} closeButton={false} autoPan={false}>
                  <div className="bg-white dark:bg-gray-900 overflow-hidden cursor-default w-[220px]">
                    <div className="relative h-32 w-full bg-gray-100 dark:bg-gray-800">
                      {popupImg
                        ? <img src={popupImg} alt={spot.name} loading="lazy" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightboxImage(popupImg)} />
                        : <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600"><MapPin size={32} /></div>
                      }
                      <button
                        aria-label="Close"
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
                          <span>{popupAvg > 0 ? popupAvg.toFixed(1) : 'New'}</span>
                          <span className="text-gray-400 dark:text-gray-500 text-[10px]">({spot.reviews?.length || 0})</span>
                        </div>
                        {popupDist !== null && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {formatDistance(popupDist)}
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
          <div className="relative">
            <button
              onClick={() => setShowMapMenu(v => !v)}
              aria-label="Map style" aria-expanded={showMapMenu}
              className={`w-10 h-10 rounded-xl shadow-md flex items-center justify-center transition-all active:scale-90 border ${settings.mode !== 'streets' ? 'bg-emerald-500 border-emerald-400/50 text-white shadow-emerald-500/20' : 'bg-white/90 dark:bg-slate-800/90 border-gray-200/60 dark:border-slate-700/60 text-gray-500 dark:text-gray-400 backdrop-blur-sm'}`}
            ><Layers size={17} /></button>
            {showMapMenu && (
              <>
                <div className="fixed inset-0 z-[1000]" onClick={() => setShowMapMenu(false)} />
                <div className="absolute right-12 top-0 z-[1001] bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200/60 dark:border-slate-700/60 py-1 min-w-[160px] backdrop-blur-sm">
                  {mapModes.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => { setSettings(s => ({ ...s, mode: opt.id })); setShowMapMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors ${settings.mode === opt.id ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => { setLocationDenied(false); setSelectedSpotId(null); mapInstance?.closePopup(); setLocationStatus('searching'); mapInstance?.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 15000 }); }}
            aria-label="Show my location"
            className={`w-10 h-10 rounded-xl shadow-md flex items-center justify-center transition-all active:scale-90 border ${locationDenied ? 'bg-red-500 border-red-400/50 text-white shadow-red-500/20' : 'bg-white/90 dark:bg-slate-800/90 border-gray-200/60 dark:border-slate-700/60 text-emerald-500 dark:text-emerald-400 backdrop-blur-sm'}`}
          ><LocateFixed size={17} /></button>
          <button
            onClick={() => { setShowAddModal({ lat: mapInstance?.getCenter().lat || 0, lng: mapInstance?.getCenter().lng || 0 }); setAddMode('options'); }}
            aria-label="Add a spot"
            className="w-10 h-10 bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-500/25 flex items-center justify-center active:scale-90 transition-all border border-emerald-400/40"
          ><Plus size={19} strokeWidth={2.5} /></button>
        </div>

        {settings.mode === 'outdoor' && (
          <a
            href="https://mapy.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 left-2 z-[1000] bg-white/90 dark:bg-slate-800/90 rounded-md px-2 py-1 shadow-md backdrop-blur-sm text-[10px] font-semibold text-gray-700 dark:text-gray-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >Mapy.com</a>
        )}

        {isPickingLocation && (
          <div className="absolute top-10 left-0 right-0 z-[2000] flex justify-center px-4 pointer-events-none">
            <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-black text-xs border-2 border-white/30 backdrop-blur-lg pointer-events-auto animate-pulse">
              <MapPin size={20} /> Select Location
              <button onClick={() => setIsPickingLocation(false)} aria-label="Cancel" className="p-1.5 bg-black/10 rounded-full ml-2"><X size={16} /></button>
            </div>
          </div>
        )}

        {movingSpotId && (
          <div className="absolute top-10 left-0 right-0 z-[2000] flex justify-center px-4 pointer-events-none">
            <div className="bg-amber-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-black text-xs border-2 border-white/30 backdrop-blur-lg pointer-events-auto animate-pulse">
              <Move size={18} /> Tap the new location on the map
              <button onClick={() => setMovingSpotId(null)} aria-label="Cancel" className="p-1.5 bg-black/10 rounded-full ml-2"><X size={16} /></button>
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

      <div className="lg:hidden absolute bottom-0 left-0 right-0 z-[1500] pointer-events-none">
        <motion.div
          animate={{
            y: drawerState === 'full'
              ? 0
              : drawerState === 'half'
              ? drawerMax * 0.5
              : drawerMax - 220
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          style={{ height: drawerMax }}
          className="bg-white dark:bg-slate-900 rounded-t-[2rem] shadow-2xl flex flex-col pointer-events-auto border-t border-gray-100 dark:border-slate-800"
        >
          {/* Handle pill — drag or tap to open/close */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.velocity.y < -150 || info.offset.y < -30) setDrawerState('full');
              else if (info.velocity.y > 150 || info.offset.y > 30) setDrawerState('hidden');
            }}
            onClick={() => setDrawerState(prev => prev === 'full' ? 'hidden' : 'full')}
            role="button" aria-label={drawerState === 'full' ? 'Collapse list' : 'Expand list'}
            className="h-12 w-full flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}
          >
            <div className="w-10 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
          </motion.div>

          {/* Content — swipe anywhere to open/close; native scroll still works */}
          <div
            ref={drawerContentRef}
            className="flex-1 min-h-0 overflow-hidden"
            onTouchStart={handleDrawerTouchStart}
            onTouchEnd={handleDrawerTouchEnd}
          >
            {renderSidebarContent()}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={closeAddModal} />
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
                    <button onClick={() => setAddMode('coordinates')} className="w-full p-5 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-2xl flex items-center gap-4 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-all active:scale-95">
                      <div className="w-11 h-11 bg-violet-600 text-white rounded-xl flex items-center justify-center"><Crosshair size={20} /></div>
                      <div className="text-left flex-1">
                        <p className="font-semibold text-sm text-gray-800 dark:text-violet-100">Enter coordinates</p>
                        <p className="text-xs text-gray-500 dark:text-violet-300/60 mt-0.5">Type lat/lng manually</p>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 dark:text-violet-700" />
                    </button>
                  </div>
                </div>
              ) : addMode === 'coordinates' ? (
                <CoordinatesForm
                  onConfirm={(lat, lng) => { setShowAddModal({ lat, lng }); setAddMode('form'); }}
                  onBack={() => setAddMode('options')}
                />
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{editingSpot ? 'Edit Spot' : 'New Spot'}</h2>
                    <button onClick={() => { if (editingSpot) { closeAddModal(); return; } setAddMode('options'); setAddSpotError(''); }} aria-label="Back" className="p-2 bg-gray-100 dark:bg-slate-800 rounded-xl text-gray-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"><ArrowLeft size={18} /></button>
                  </div>
                  <SpotForm onSubmit={(d, cats, img) => editingSpot ? handleEditSpot(d, cats, img) : handleAddSpot(d, cats, img)} initialData={editingSpot} isSubmitting={isAddingSpot} submitError={addSpotError} />
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showAuthModal && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" onClick={() => { setShowAuthModal(null); setAuthError(''); setShowSignupPassword(false); }} />
            <motion.div
              key={showAuthModal}
              initial={{ scale: 0.9, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 16 }}
              className="relative w-full max-w-sm shadow-2xl rounded-3xl overflow-hidden border border-white/10"
            >
              {showAuthModal === 'login' ? (
                /* ── LOGIN ── */
                <div className="bg-slate-900 p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                      <Lock size={22} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white leading-tight">Welcome back</h2>
                      <p className="text-xs text-slate-400">Sign in to your SpekPlatz account</p>
                    </div>
                  </div>
                  <form onSubmit={(e) => handleAuth('login', e)} className="space-y-3">
                    <input
                      name="nickname" placeholder="Nickname" required autoComplete="username"
                      className="w-full px-4 py-3 bg-slate-800 text-gray-100 placeholder-slate-500 rounded-xl font-medium outline-none border border-slate-700 focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <input
                      type="password" name="password" placeholder="Password" required autoComplete="current-password"
                      className="w-full px-4 py-3 bg-slate-800 text-gray-100 placeholder-slate-500 rounded-xl font-medium outline-none border border-slate-700 focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    {anonSpotCount > 0 && (
                      <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                        You added {anonSpotCount === 1 ? 'a spot' : `${anonSpotCount} spots`} without an account. Signing in to an existing account means you can no longer edit {anonSpotCount === 1 ? 'it' : 'them'} (only on request via {CONTACT_EMAIL}). To keep {anonSpotCount === 1 ? 'it' : 'them'}, create a new account instead.
                      </p>
                    )}
                    {authError && <p role="alert" className="text-xs text-red-400 text-center">{authError}</p>}
                    <button type="submit" disabled={isAuthSubmitting} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors active:scale-95 mt-1 disabled:opacity-60">
                      {isAuthSubmitting ? 'Signing in…' : 'Sign in'}
                    </button>
                  </form>
                  <p className="mt-3 text-center text-[11px] text-slate-400">
                    See our{' '}
                    <button type="button" onClick={() => setShowLegalModal('terms')} className="underline hover:text-slate-200">Terms</button>
                    {' '}and{' '}
                    <button type="button" onClick={() => setShowLegalModal('privacy')} className="underline hover:text-slate-200">Privacy Policy</button>.
                  </p>
                  <p className="mt-5 text-center text-xs text-slate-500">
                    New to SpekPlatz?{' '}
                    <button onClick={() => { setShowAuthModal('signup'); setAuthError(''); }} className="text-emerald-400 hover:underline font-medium">Create account</button>
                  </p>
                </div>
              ) : (
                /* ── SIGNUP ── */
                <div className="bg-white dark:bg-slate-900 p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                      <Sparkles size={22} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Create account</h2>
                      <p className="text-xs text-gray-400 dark:text-slate-500">Join the SpekPlatz community</p>
                    </div>
                  </div>
                  <form onSubmit={(e) => handleAuth('signup', e)} className="space-y-3">
                    <input
                      name="nickname" placeholder="Choose a nickname" required autoComplete="username"
                      minLength={3} maxLength={30} pattern="[a-zA-Z0-9._\-]{3,30}" title="3–30 letters, digits, dots, dashes or underscores"
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-xl font-medium outline-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-sm"
                    />

                    {/* Avatar picker */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">Choose your avatar</label>
                      <div className="grid grid-cols-6 gap-1.5">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url} type="button" onClick={() => setSignupAvatar(url)}
                            aria-label="Choose avatar" aria-pressed={signupAvatar === url}
                            className={`w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${signupAvatar === url ? 'border-emerald-500 scale-105 shadow-md shadow-emerald-200 dark:shadow-emerald-900' : 'border-transparent hover:border-emerald-300 dark:hover:border-emerald-700'}`}
                          >
                            <img src={url} className="w-full h-full" alt="" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Password with show/hide + browser generation */}
                    <div className="relative">
                      <input
                        type={showSignupPassword ? 'text' : 'password'}
                        name="password" placeholder="Create a password" required
                        autoComplete="new-password" minLength={6}
                        className="w-full px-4 py-3 pr-11 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-slate-500 rounded-xl font-medium outline-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                      <button
                        type="button" onClick={() => setShowSignupPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                        aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                      >
                        {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {authError && <p role="alert" className="text-xs text-red-500 dark:text-red-400 text-center">{authError}</p>}
                    <button type="submit" disabled={isAuthSubmitting} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors active:scale-95 mt-1 disabled:opacity-60">
                      {isAuthSubmitting ? 'Creating…' : 'Create account'}
                    </button>
                  </form>
                  <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-slate-400">
                    By creating an account you confirm you are at least 16 and agree to the{' '}
                    <button type="button" onClick={() => setShowLegalModal('terms')} className="underline hover:text-emerald-600 dark:hover:text-emerald-400">Terms</button>
                    {' '}and{' '}
                    <button type="button" onClick={() => setShowLegalModal('privacy')} className="underline hover:text-emerald-600 dark:hover:text-emerald-400">Privacy Policy</button>.
                  </p>
                  <p className="mt-5 text-center text-xs text-gray-400 dark:text-slate-500">
                    Already have one?{' '}
                    <button onClick={() => { setShowAuthModal('login'); setAuthError(''); setShowSignupPassword(false); }} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Sign in</button>
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {showProfileModal && currentUser && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-2xl" onClick={() => { setShowProfileModal(false); setProfileError(''); setProfileSuccess(false); setConfirmDeleteAccount(false); }} />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl border border-gray-100 dark:border-slate-800 max-h-[92vh] overflow-y-auto no-scrollbar">
              <button onClick={() => { setShowProfileModal(false); setProfileError(''); setProfileSuccess(false); setConfirmDeleteAccount(false); }} aria-label="Close" className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><X size={18} /></button>

              {/* Avatar + name */}
              <div className="text-center mb-5">
                <img src={currentUser.avatar} className="w-16 h-16 mx-auto rounded-2xl mb-3 shadow-md" alt={currentUser.name} />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{currentUser.name}</h2>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">SpekPlatz member</p>
              </div>

              {/* Avatar picker */}
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-2 flex items-center gap-1.5"><Sparkles size={13} /> Change avatar</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {AVATAR_OPTIONS.map((url) => (
                    <button
                      key={url} type="button" onClick={() => handleAvatarChange(url)}
                      aria-label="Choose avatar" aria-pressed={currentUser.avatar === url}
                      className={`w-full aspect-square rounded-xl overflow-hidden border-2 transition-all ${currentUser.avatar === url ? 'border-emerald-500 scale-105 shadow-md shadow-emerald-200 dark:shadow-emerald-900' : 'border-transparent hover:border-emerald-300 dark:hover:border-emerald-700'}`}
                    >
                      <img src={url} className="w-full h-full" alt="" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Change password */}
              <form onSubmit={handleChangePassword} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-3 flex items-center gap-1.5"><ShieldCheck size={13} /> Change Password</h3>
                <input type="text" name="username" autoComplete="username" value={currentUser.name} readOnly hidden />
                <input type="password" name="currentPassword" placeholder="Current password" required autoComplete="current-password" aria-label="Current password" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl font-medium outline-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-sm" />
                <input type="password" name="newPassword" placeholder="New password" required minLength={6} autoComplete="new-password" aria-label="New password" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl font-medium outline-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-sm" />
                <input type="password" name="confirmPassword" placeholder="Confirm new password" required minLength={6} autoComplete="new-password" aria-label="Confirm new password" className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 dark:text-gray-100 dark:placeholder-slate-500 rounded-xl font-medium outline-none border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 text-sm" />
                {profileError && <p className="text-xs text-red-500 dark:text-red-400">{profileError}</p>}
                {profileSuccess && <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> Password updated successfully</p>}
                <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors active:scale-95">Update password</button>
              </form>

              {/* Sign out */}
              <button onClick={handleLogout} className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-red-100 dark:border-red-900/40">
                <LogOut size={15} /> Sign out
              </button>

              {/* Delete account */}
              {confirmDeleteAccount ? (
                <form onSubmit={handleDeleteAccount} className="mt-4 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 space-y-2">
                  <p className="text-xs text-red-600 dark:text-red-300">This permanently deletes your account and saved spots. Spots and reviews you posted stay on the map. Enter your password to confirm.</p>
                  <input type="password" name="deletePassword" placeholder="Password" required autoComplete="current-password" aria-label="Password" className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 dark:text-gray-100 rounded-xl outline-none border border-red-200 dark:border-red-900/60 focus:ring-2 focus:ring-red-500 text-sm" />
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 py-2 bg-red-500 text-white rounded-xl text-xs font-semibold hover:bg-red-600 transition-colors">Delete my account</button>
                    <button type="button" onClick={() => setConfirmDeleteAccount(false)} className="flex-1 py-2 bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">Cancel</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => { setConfirmDeleteAccount(true); setProfileError(''); }} className="w-full mt-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300 transition-colors">
                  Delete account
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLegalModal && (
          <LegalModal tab={showLegalModal} onTabChange={setShowLegalModal} onClose={() => setShowLegalModal(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
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
              alt=""
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxImage(null)}
              aria-label="Close photo"
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

export default App;
