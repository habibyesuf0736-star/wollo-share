import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  type User 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Cloud Firestore (specifying the databaseId if configured)
export const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Test connection on boot per Firebase guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface GoogleAuthResult {
  ok: boolean;
  user?: {
    id: string;
    uid: string;
    name: string;
    email: string;
    photoURL?: string;
    role: string;
    department: string;
    accountPlan: string;
    paymentStatus: string;
    category: string;
  };
  session?: {
    id: string;
    name: string;
    email: string;
    role: string;
    token?: string;
  };
  error?: string;
}

/**
 * Perform Sign In with Google via Firebase Auth popup
 */
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  try {
    const userCredential = await signInWithPopup(auth, googleProvider);
    const fbUser = userCredential.user;

    const email = (fbUser.email || '').trim().toLowerCase();
    const name = fbUser.displayName || 'Google Student';
    const photoURL = fbUser.photoURL || '';
    const uid = fbUser.uid;

    const isHabib = email === 'habibyesuf81@gmail.com';
    const role = isHabib ? 'admin' : 'user';

    const userProfile = {
      id: uid,
      uid,
      name,
      email,
      role,
      department: 'General Studies & Science',
      accountPlan: isHabib ? 'paid_lifetime' : 'free',
      paymentStatus: isHabib ? 'paid' : 'unpaid',
      category: isHabib ? 'Super Admin · Lifetime VIP Access' : 'Google Verified Student',
      photoURL,
      lastActiveAt: new Date().toISOString()
    };

    // Save/update user profile in Firestore
    try {
      await setDoc(doc(db, 'users', uid), userProfile, { merge: true });
    } catch (fsErr) {
      console.warn('Could not write profile to Firestore:', fsErr);
    }

    // Sync with backend API if available
    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          email,
          name,
          photoURL
        })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        return {
          ok: true,
          user: data.user || userProfile,
          session: data.session
        };
      }
    } catch (syncErr) {
      console.warn('Backend sync failed, using client session:', syncErr);
    }

    return {
      ok: true,
      user: userProfile,
      session: {
        id: uid,
        name,
        email,
        role
      }
    };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    let message = 'Failed to sign in with Google. Please try again.';
    if (error?.code === 'auth/popup-blocked') {
      message = 'Sign-in popup was blocked by browser. Please allow popups for this site.';
    } else if (error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/popup-closed-by-user') {
      message = 'Google Sign-in was cancelled.';
    } else if (error?.message) {
      message = error.message;
    }
    return {
      ok: false,
      error: message
    };
  }
}

/**
 * Sign out of Firebase Auth
 */
export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Firebase signOut error:', e);
  }
}

// Attach globally to window for consumption by index.html scripts
declare global {
  interface Window {
    signInWithGoogle: typeof signInWithGoogle;
    signOutFirebase: typeof signOutFirebase;
    firebaseAuthInstance: typeof auth;
    firestoreInstance: typeof db;
  }
}

if (typeof window !== 'undefined') {
  window.signInWithGoogle = signInWithGoogle;
  window.signOutFirebase = signOutFirebase;
  window.firebaseAuthInstance = auth;
  window.firestoreInstance = db;
}
