import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function deleteCollection(collectionPath) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`Collection ${collectionPath} is already empty.`);
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`Deleted all documents in collection: ${collectionPath}`);
}

async function run() {
  try {
    console.log('Starting database cleanup...');
    const collectionsToClear = [
      'projects',
      'participations',
      'submissions',
      'contacts',
      'notifications',
      'payments',
      'announcements'
    ];
    
    for (const col of collectionsToClear) {
      await deleteCollection(col);
    }
    
    console.log('Done cleaning testing data. Left users intact so you do not lose your Admin role.');
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
