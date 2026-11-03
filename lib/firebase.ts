import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
// Named database — never the default one.
export const db = getFirestore(app, 'spekplatz');
export const auth = getAuth(app);

// Accounts are nickname-based; Firebase Auth gets a synthetic email.
// Firestore rules recognise the admin by the same synthetic email.
const EMAIL_DOMAIN = 'spekplatz.local';
export const ADMIN_NICKNAME = 'admin';
export const nicknameToEmail = (nickname: string) => `${nickname.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
export const isAdminName = (name?: string | null) => name?.toLowerCase() === ADMIN_NICKNAME;

// Letters, digits, dot, dash, underscore — must survive as an email local part.
export const NICKNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
