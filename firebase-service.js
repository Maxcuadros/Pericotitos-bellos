import { firebaseConfig, ADMIN_EMAIL, ADMIN_UID,AUTH_USERS} from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const PRODUCT_IDS = ["suplex", "capa-dakota", "polera-rick", "pantalon-bonnie", "conjunto-catania", "pantalon-celeste"];
const LOCAL_STOCK_KEY = "pericotitos-bellos-stock-demo";
const LOCAL_ORDERS_KEY = "pericotitos-bellos-orders-demo";

export const isFirebaseConfigured = !Object.values(firebaseConfig).some((value) => String(value).startsWith("REEMPLAZAR"));
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

function normalizeStock(value) {
  const stock = Number(value);
  return Number.isInteger(stock) && stock >= 0 ? stock : 0;
}

function loadLocalStock() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_STOCK_KEY)) || {};
    return Object.fromEntries(PRODUCT_IDS.map((id) => [id, normalizeStock(saved[id])]));
  } catch {
    return Object.fromEntries(PRODUCT_IDS.map((id) => [id, 0]));
  }
}

function saveLocalStock(stock) {
  localStorage.setItem(LOCAL_STOCK_KEY, JSON.stringify(stock));
  window.dispatchEvent(new CustomEvent("pericotitos-stock-change"));
}

function loadLocalOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveLocalOrders(orders) {
  localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));
  window.dispatchEvent(new CustomEvent("pericotitos-orders-change"));
}

function groupOrderQuantities(items) {
  return items.reduce((grouped, item) => {
    const quantity = normalizeStock(item.quantity);
    const current = grouped.get(item.productId) || { name: item.name, quantity: 0 };
    current.quantity += quantity;
    grouped.set(item.productId, current);
    return grouped;
  }, new Map());
}

export function subscribeStock(callback, onError = console.error) {
  if (db) {
    return onSnapshot(collection(db, "products"), (snapshot) => {
      const stock = Object.fromEntries(PRODUCT_IDS.map((id) => [id, 0]));
      snapshot.forEach((productDoc) => {
        stock[productDoc.id] = normalizeStock(productDoc.data().stock);
      });
      callback(stock);
    }, onError);
  }

  const emit = () => callback(loadLocalStock());
  const onStorage = (event) => {
    if (!event.key || event.key === LOCAL_STOCK_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("pericotitos-stock-change", emit);
  emit();
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pericotitos-stock-change", emit);
  };
}

export async function getCurrentStock(productIds) {
  if (!db) {
    const stock = loadLocalStock();
    return Object.fromEntries(productIds.map((id) => [id, normalizeStock(stock[id])]));
  }

  const entries = await Promise.all(productIds.map(async (id) => {
    const snapshot = await getDoc(doc(db, "products", id));
    return [id, snapshot.exists() ? normalizeStock(snapshot.data().stock) : 0];
  }));
  return Object.fromEntries(entries);
}

export async function createPendingOrder(order) {
  if (db) {
    const result = await addDoc(collection(db, "orders"), {
      ...order,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    return result.id;
  }

  const orders = loadLocalOrders();
  const id = `LOCAL-${Date.now()}`;
  orders.unshift({ id, ...order, status: "pending", createdAt: new Date().toISOString() });
  saveLocalOrders(orders);
  return id;
}

export async function adminSignIn(email, password) {
  if (!auth) {
    if (!email || !password) throw new Error("Ingresa correo y contrasena.");
    return { uid: "local-admin", email };
  }
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (!AUTH_USERS.some(x => x.email ==email)) {
    await signOut(auth);
    throw new Error("Este usuario no tiene permisos de administrador.");
  }
  return credential.user;
}

export function observeAdminSession(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    callback(user?.uid === ADMIN_UID ? user : null);
  });
}

export async function adminSignOut() {
  if (auth) await signOut(auth);
}

export async function updateProductStock(productId, stock, metadata = {}) {
  const normalized = normalizeStock(stock);
  if (db) {
    await setDoc(doc(db, "products", productId), {
      ...metadata,
      stock: normalized,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return;
  }
  const current = loadLocalStock();
  current[productId] = normalized;
  saveLocalStock(current);
}

export function subscribePendingOrders(callback, onError = console.error) {
  if (db) {
    return onSnapshot(query(collection(db, "orders"), where("status", "==", "pending")), (snapshot) => {
      callback(snapshot.docs.map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() })));
    }, onError);
  }

  const emit = () => callback(loadLocalOrders().filter((order) => order.status === "pending"));
  window.addEventListener("pericotitos-orders-change", emit);
  emit();
  return () => window.removeEventListener("pericotitos-orders-change", emit);
}

export async function markOrderPaid(orderId) {
  if (!db) {
    const orders = loadLocalOrders();
    const order = orders.find((item) => item.id === orderId && item.status === "pending");
    if (!order) throw new Error("Pedido no encontrado o ya procesado.");
    const stock = loadLocalStock();
    const groupedItems = groupOrderQuantities(order.items);
    groupedItems.forEach((item, productId) => {
      if (normalizeStock(stock[productId]) < item.quantity) throw new Error(`Stock insuficiente para ${item.name}.`);
    });
    groupedItems.forEach((item, productId) => { stock[productId] -= item.quantity; });
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    saveLocalStock(stock);
    saveLocalOrders(orders);
    return;
  }

  await runTransaction(db, async (transaction) => {
    const orderRef = doc(db, "orders", orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists() || orderSnapshot.data().status !== "pending") throw new Error("Pedido no encontrado o ya procesado.");

    const order = orderSnapshot.data();
    const groupedItems = groupOrderQuantities(order.items);
    const productSnapshots = [];
    for (const [productId, item] of groupedItems) {
      const productRef = doc(db, "products", productId);
      const productSnapshot = await transaction.get(productRef);
      const stock = productSnapshot.exists() ? normalizeStock(productSnapshot.data().stock) : 0;
      if (stock < item.quantity) throw new Error(`Stock insuficiente para ${item.name}.`);
      productSnapshots.push({ productRef, stock, quantity: item.quantity });
    }

    productSnapshots.forEach(({ productRef, stock, quantity }) => {
      transaction.update(productRef, { stock: stock - quantity, updatedAt: serverTimestamp() });
    });
    transaction.update(orderRef, { status: "paid", paidAt: serverTimestamp() });
  });
}

export async function initializeProductDocuments(products) {
  if (!db) return;
  const existing = await getDocs(collection(db, "products"));
  const existingIds = new Set(existing.docs.map((item) => item.id));
  await Promise.all(products.filter((product) => !existingIds.has(product.id)).map((product) => (
    setDoc(doc(db, "products", product.id), { ...product, stock: 0, updatedAt: serverTimestamp() })
  )));
}
