import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
// Public Firebase web-app configuration. Never store cafe24 secrets here.
const config = {
  "apiKey": "AIzaSyCGAcOL7VrS0sLbn6WUxbgeDInTr9N9yA4",
  "authDomain": "ggmapi-e15be.firebaseapp.com",
  "projectId": "ggmapi-e15be",
  "storageBucket": "ggmapi-e15be.firebasestorage.app",
  "messagingSenderId": "683663876311",
  "appId": "1:683663876311:web:f995832f3cd8d1a1b95092"
};
export const firebaseReady = true;
export const firebaseProjectId = config.projectId;
export const firebaseApp = getApps()[0] ?? initializeApp(config);
export const auth = getAuth(firebaseApp);
