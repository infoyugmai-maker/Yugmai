// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
apiKey: "AIzaSyCwoEXL2ow41crNUnjnzMofvgWaqNc8TXQ",
authDomain: "yugmai.firebaseapp.com",
projectId: "yugmai",
storageBucket: "yugmai.firebasestorage.app",
messagingSenderId: "718033571268",
appId: "1:718033571268:web:86ef1fef9887e878f9e891",
measurementId: "G-F1KR2CP23Q"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);





admin email
info.yugmai@gmail.com
yugmai123@#
google login + mail + password



SUpabse
project name
infoyugmai-maker's Project

Project ID
iveqxwjpxejimcbzaczo
Project region
ap-south-1
Url
https://supabase.com/dashboard/project/iveqxwjpxejimcbzaczo/storage/files/buckets/filess
Bucktes name - files
service key - eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2ZXF4d2pweGVqaW1jYnphY3pvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjA0NjkwMSwiZXhwIjoyMDk3NjIyOTAxfQ.hZ2RNYbkiYkGcH11hovzgLqMAnXnRkgZTQzueRky9uU

SUPABASE\_URL=https://iveqxwjpxejimcbzaczo.supabase.co


from openai import OpenAI



client = OpenAI(

&#x20; base\_url = "https://integrate.api.nvidia.com/v1",

&#x20; api\_key = "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"

)





completion = client.chat.completions.create(

&#x20; model="nvidia/nemotron-3-ultra-550b-a55b",

&#x20; messages=\[{"role":"user","content":""}],

&#x20; temperature=1,

&#x20; top\_p=0.95,

&#x20; max\_tokens=16384,

&#x20; extra\_body={"chat\_template\_kwargs":{"enable\_thinking":True},"reasoning\_budget":16384},

&#x20; stream=True

)



for chunk in completion:

&#x20; if not chunk.choices:

&#x20;   continue

&#x20; reasoning = getattr(chunk.choices\[0].delta, "reasoning\_content", None)

&#x20; if reasoning:

&#x20;   print(reasoning, end="")

&#x20; if chunk.choices\[0].delta.content is not None:

&#x20;   print(chunk.choices\[0].delta.content, end="")


Resend api key 
re\_UPpAq9i9\_NAh5RRY6dmL9d5ZDmYJzeX9H

