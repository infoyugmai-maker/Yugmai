import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCwoEXL2ow41crNUnjnzMofvgWaqNc8TXQ",
  authDomain: "yugmai.firebaseapp.com",
  projectId: "yugmai",
  storageBucket: "yugmai.firebasestorage.app",
  messagingSenderId: "718033571268",
  appId: "1:718033571268:web:86ef1fef9887e878f9e891",
  measurementId: "G-F1KR2CP23Q",
};

console.log("Initializing Firebase Client SDK...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function test() {
  try {
    console.log("Testing Firestore connection via Web SDK...");
    const q = query(collection(db, "users"), limit(1));
    const snap = await getDocs(q);
    console.log("Success! Found", snap.size, "documents in users collection.");
    process.exit(0);
  } catch (err) {
    console.error("Firestore Client SDK Error:", err);
    process.exit(1);
  }
}

test();
