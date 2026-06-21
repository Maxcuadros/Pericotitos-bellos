import {
  adminSignIn,
  adminSignOut,
  initializeProductDocuments,
  isFirebaseConfigured,
  markOrderPaid,
  observeAdminSession,
  subscribePendingOrders,
  subscribeStock,
  updateProductStock,
} from "./firebase-service.js";

const products = [
  { id: "suplex", name: "Suplex grueso premium", price: 15, image: "assets/suplex-grueso-premium.jpg" },
  { id: "capa-dakota", name: "Capa Dakota", price: 20, image: "assets/capa-dakota-nueva.jpg" },
  { id: "polera-rick", name: "Polera Rick Panameño", price: 20, image: "assets/polera-rick-panameno.jpg" },
  { id: "pantalon-bonnie", name: "Pantalón Bonnie corte sirena", price: 25, image: "assets/pantalon-bonnie.jpg" },
  { id: "conjunto-catania", name: "Conjunto Catania", price: 38, image: "assets/conjunto-catania.jpg" },
  { id: "pantalon-celeste", name: "Pantalón celeste bebé", price: 23, image: "assets/pantalon-celeste-bebe-nuevo.jpg" },
];

const elements = {
  loginSection: document.querySelector("#loginSection"),
  dashboard: document.querySelector("#dashboardSection"),
  loginForm: document.querySelector("#loginForm"),
  email: document.querySelector("#adminEmail"),
  password: document.querySelector("#adminPassword"),
  loginMessage: document.querySelector("#loginMessage"),
  adminMessage: document.querySelector("#adminMessage"),
  connectionMode: document.querySelector("#connectionMode"),
  stockGrid: document.querySelector("#stockGrid"),
  ordersList: document.querySelector("#ordersList"),
  logout: document.querySelector("#logoutButton"),
  initialize: document.querySelector("#initializeProducts"),
};

let stockByProduct = {};
let stopStock = () => {};
let stopOrders = () => {};

function showMessage(message, error = false) {
  elements.adminMessage.textContent = message;
  elements.adminMessage.className = `admin-message ${error ? "error" : "success"}`;
}

function stockLabel(stock) {
  if (stock <= 0) return "Agotado";
  if (stock === 1) return "Última unidad";
  if (stock <= 3) return "Últimas unidades";
  return "Disponible";
}

function renderStock() {
  elements.stockGrid.innerHTML = products.map((product) => {
    const stock = Number(stockByProduct[product.id]) || 0;
    return `
      <article class="stock-item">
        <img src="${product.image}" alt="${product.name}">
        <div class="stock-item-info">
          <h3>${product.name}</h3>
          <span class="admin-status ${stock <= 0 ? "sold-out" : stock <= 3 ? "low-stock" : "available"}">${stockLabel(stock)}</span>
          <label>Stock actual<input type="number" min="0" step="1" value="${stock}" data-stock-input="${product.id}"></label>
          <div class="stock-actions">
            <button class="btn btn-primary" type="button" data-stock-action="save" data-product-id="${product.id}">Guardar</button>
            <button class="btn btn-secondary" type="button" data-stock-action="sold-out" data-product-id="${product.id}">Agotar</button>
            ${stock <= 0 ? `<button class="btn btn-secondary" type="button" data-stock-action="reactivate" data-product-id="${product.id}">Reactivar</button>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderOrders(orders) {
  if (!orders.length) {
    elements.ordersList.innerHTML = '<p class="orders-empty">No hay pedidos pendientes.</p>';
    return;
  }

  elements.ordersList.innerHTML = orders.map((order) => `
    <article class="order-item">
      <div class="order-heading">
        <div><span>Pedido</span><strong>${order.id}</strong></div>
        <strong>S/${Number(order.total).toFixed(2).replace(".00", "")}</strong>
      </div>
      <div class="order-lines">
        ${(order.items || []).map((item) => `<p>${item.quantity} × ${item.name} · ${item.size} · ${item.color}</p>`).join("")}
      </div>
      <button class="btn btn-primary" type="button" data-order-paid="${order.id}">Marcar como pagado y descontar stock</button>
    </article>
  `).join("");
}

function openDashboard() {
  elements.loginSection.hidden = true;
  elements.dashboard.hidden = false;
  elements.connectionMode.textContent = isFirebaseConfigured
    ? "Conectado a Firebase Firestore."
    : "Modo local de prueba. Completa firebase-config.js para usar Firestore.";
  stopStock();
  stopOrders();
  stopStock = subscribeStock((stock) => {
    stockByProduct = stock;
    renderStock();
  }, () => showMessage("No se pudo leer el stock.", true));
  stopOrders = subscribePendingOrders(renderOrders, () => showMessage("No se pudieron leer los pedidos.", true));
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginMessage.textContent = "Ingresando...";
  try {
    await adminSignIn(elements.email.value.trim(), elements.password.value);
    elements.loginMessage.textContent = "";
    openDashboard();
  } catch (error) {
    elements.loginMessage.textContent = error.message || "No se pudo iniciar sesión.";
  }
});

elements.logout.addEventListener("click", async () => {
  await adminSignOut();
  stopStock();
  stopOrders();
  elements.dashboard.hidden = true;
  elements.loginSection.hidden = false;
});

elements.initialize.addEventListener("click", async () => {
  try {
    await initializeProductDocuments(products);
    showMessage(isFirebaseConfigured ? "Productos inicializados con stock 0." : "En modo local, guarda el stock de cada producto manualmente.");
  } catch (error) {
    showMessage(error.message || "No se pudieron inicializar los productos.", true);
  }
});

elements.stockGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-stock-action]");
  if (!button) return;
  const product = products.find((item) => item.id === button.dataset.productId);
  const input = document.querySelector(`[data-stock-input="${product.id}"]`);
  let stock = Number(input.value);
  if (button.dataset.stockAction === "sold-out") stock = 0;
  if (button.dataset.stockAction === "reactivate") stock = 1;
  if (!Number.isInteger(stock) || stock < 0) {
    showMessage("El stock debe ser un número entero igual o mayor que cero.", true);
    return;
  }
  try {
    await updateProductStock(product.id, stock, { name: product.name, price: product.price, image: product.image });
    showMessage(`Stock de ${product.name} actualizado a ${stock}.`);
  } catch (error) {
    showMessage(error.message || "No se pudo actualizar el stock.", true);
  }
});

elements.ordersList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-order-paid]");
  if (!button) return;
  button.disabled = true;
  try {
    await markOrderPaid(button.dataset.orderPaid);
    showMessage("Pedido marcado como pagado. El stock fue descontado.");
  } catch (error) {
    showMessage(error.message || "No se pudo confirmar el pedido.", true);
    button.disabled = false;
  }
});

observeAdminSession((user) => {
  if (user) openDashboard();
});
