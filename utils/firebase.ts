import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Configuration for Firebase
// IMPORTANT: In a real deployment, these should be environment variables.
// Since we are in a demo environment, the user must supply these values for the database connection to work.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY_HERE",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.FIREBASE_APP_ID || "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const saveTranscript = async (role: 'user' | 'model', text: string, sessionId: string) => {
  if (!text || text.trim() === '') return;
  
  try {
    // We use a 'transcripts' collection
    await addDoc(collection(db, 'transcripts'), {
      sessionId,
      role,
      text: text.trim(),
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    });
    console.log(`[Firebase] Saved ${role} transcript`);
  } catch (e) {
    // Suppress errors in the console if config is missing, to keep the demo clean
    if ((e as any).code === 'permission-denied' || (e as any).code === 'unavailable') {
        console.warn("[Firebase] Connection failed. Check your Firebase configuration.");
    } else {
        console.error("[Firebase] Error adding document: ", e);
    }
  }
};