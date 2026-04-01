import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, onValue, push, update } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAbkKacS7czEA3Nez68sZ6PNZQ0rmTyfQA",
    authDomain: "atsmodel-e038c.firebaseapp.com",
    projectId: "atsmodel-e038c",
    storageBucket: "atsmodel-e038c.firebasestorage.app",
    messagingSenderId: "662518539494",
    appId: "1:662518539494:web:efccc44b04f6851fc8c727",
    measurementId: "G-4G1JVWERRZ",
    databaseURL: "https://atsmodel-e038c-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    ref, 
    set, 
    get, 
    child, 
    onValue, 
    push, 
    update 
};
