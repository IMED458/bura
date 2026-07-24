// Firebase initialisation. The web config is public by design — security is
// enforced entirely by Firestore rules (see firestore.rules).
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBuo94xljbJM9Cji_3HcFvlzN_4dj0pko4',
  authDomain: 'bura-f478a.firebaseapp.com',
  projectId: 'bura-f478a',
  storageBucket: 'bura-f478a.firebasestorage.app',
  messagingSenderId: '702644274821',
  appId: '1:702644274821:web:ab3fd49b6c012b1cb90bec',
  measurementId: 'G-D4Q33KZWM4',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let signInPromise: Promise<User> | null = null;

/** Ensure the browser is signed in anonymously; resolves with the stable uid. */
export function ensureSignedIn(): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (signInPromise) return signInPromise;
  signInPromise = new Promise<User>((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsub();
        resolve(user);
      }
    });
    signInAnonymously(auth).catch((err) => {
      unsub();
      signInPromise = null;
      reject(err);
    });
  });
  return signInPromise;
}
