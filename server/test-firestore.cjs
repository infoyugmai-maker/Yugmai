const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function test() {
  try {
    console.log("Testing Firestore connection...");
    const snap = await db.collection("users").limit(1).get();
    console.log("Success! Found", snap.size, "documents in users collection.");
    process.exit(0);
  } catch (err) {
    console.error("Firestore Error:", err);
    process.exit(1);
  }
}

test();
