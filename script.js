import { createPendingOrder, getCurrentStock, isFirebaseConfigured, subscribeStock } from "./firebase-service.js";

const STORE_CONFIG = {
  whatsappNumber: "51906615728",
  defaultMessage: "Hola, quiero hacer una consulta sobre Pericotitos Bellos.",
  businessHours: "Lunes a sábado de 8:00 a.m. a 8:00 p.m.",
  storageKey: "pericotitos-bellos-cart",
};

const products = [
  { id: "suplex", name: "Suplex grueso premium", price: 15, priceLabel: "S/15 unidad / 2 por S/25", pairPrice: 25, image: "assets/suplex-grueso-premium.jpg", detailImage: "assets/promo-suplex-grueso-premium.jpg", sizes: ["S", "M", "L"], colors: ["Negro", "Lila"] },
  { id: "capa-dakota", name: "Capa Dakota", price: 20, priceLabel: "S/20", image: "assets/capa-dakota-nueva.jpg", detailImage: "assets/promo-capa-dakota.jpg", sizes: ["S", "M", "L"], colors: ["Negro", "Azul noche", "Azulino", "Rojo", "Rosado", "Beige", "Topo", "Plomo claro", "Plomo oscuro", "Camel"] },
  { id: "polera-rick", name: "Polera Rick Panameño", price: 20, priceLabel: "S/20", image: "assets/polera-rick-panameno.jpg", detailImage: "assets/promo-polera-rick-panameno.png", sizes: ["S", "M", "L"], colors: ["Lila"] },
  { id: "pantalon-bonnie", name: "Pantalón Bonnie corte sirena", price: 25, priceLabel: "S/25", image: "assets/pantalon-bonnie.jpg", detailImage: "assets/promo-pantalon-bonnie.jpg", sizes: ["Talla única"], colors: ["Beige"] },
  { id: "conjunto-catania", name: "Conjunto Catania", price: 38, priceLabel: "S/38", image: "assets/conjunto-catania.jpg", detailImage: "assets/promo-conjunto-catania.jpg", sizes: ["S", "M", "L"], colors: ["Verde", "Negro"] },
  { id: "pantalon-celeste", name: "Pantalón celeste bebé", price: 23, priceLabel: "S/23", image: "assets/pantalon-celeste-bebe-nuevo.jpg", detailImage: "assets/promo-pantalon-celeste-bebe.jpg", sizes: ["S", "M", "L"], colors: ["Celeste bebé"] },
];

const elements = {
  productsGrid: document.querySelector("#productsGrid"),
  productModal: document.querySelector("#productModal"),
  modalImage: document.querySelector("#modalProductImage"),
  modalName: document.querySelector("#modalProductName"),
  modalPrice: document.querySelector("#modalProductPrice"),
  modalStock: document.querySelector("#modalProductStock"),
  modalSize: document.querySelector("#modalSize"),
  modalColor: document.querySelector("#modalColor"),
  modalAdd: document.querySelector("#modalAddToCart"),
  cartToggle: document.querySelector("#cartToggle"),
  cartCount: document.querySelector("#cartCount"),
  cartDrawer: document.querySelector("#cartDrawer"),
  cartItems: document.querySelector("#cartItems"),
  cartEmpty: document.querySelector("#cartEmpty"),
  cartTotal: document.querySelector("#cartTotal"),
  payNow: document.querySelector("#payNowButton"),
  paymentModal: document.querySelector("#paymentModal"),
  paymentTotal: document.querySelector("#paymentTotal"),
  paymentStatus: document.querySelector("#paymentStatus"),
  sendReceipt: document.querySelector("#sendReceiptButton"),
  shopNotice: document.querySelector("#shopNotice"),
  menuToggle: document.querySelector(".menu-toggle"),
  navLinks: document.querySelector(".nav-links"),
};

let cart = loadCart();
let stockByProduct = {};
let activeProductIndex = null;
let lastFocusedElement = null;

function whatsappLink(message) {
  return `https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function money(value) {
  return `S/${Number(value).toFixed(2).replace(".00", "")}`;
}

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_CONFIG.storageKey));
    return Array.isArray(saved) ? saved.filter((item) => products.some((product) => product.id === item.productId)) : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(STORE_CONFIG.storageKey, JSON.stringify(cart));
}

function getProduct(productId) {
  return products.find((product) => product.id === productId);
}

function itemSubtotal(item) {
  const product = getProduct(item.productId);
  if (!product) return 0;
  if (product.pairPrice) {
    return Math.floor(item.quantity / 2) * product.pairPrice + (item.quantity % 2) * product.price;
  }
  return product.price * item.quantity;
}

function cartTotalValue() {
  return cart.reduce((total, item) => total + itemSubtotal(item), 0);
}

function selectOptions(values) {
  return values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function availableStock(productId) {
  const stock = Number(stockByProduct[productId]);
  return Number.isInteger(stock) && stock > 0 ? stock : 0;
}

function stockState(productId) {
  const stock = availableStock(productId);
  if (stock === 0) return { label: "Agotado", className: "sold-out" };
  if (stock === 1) return { label: "Última unidad disponible", className: "low-stock" };
  if (stock <= 3) return { label: `Últimas ${stock} unidades`, className: "low-stock" };
  return { label: `Stock: ${stock} unidades`, className: "available" };
}

function cartQuantityForProduct(productId) {
  return cart.filter((item) => item.productId === productId).reduce((total, item) => total + item.quantity, 0);
}

function showNotice(message, type = "warning") {
  elements.shopNotice.textContent = message;
  elements.shopNotice.className = `shop-notice ${type}`;
  elements.shopNotice.hidden = false;
  window.clearTimeout(showNotice.timeoutId);
  showNotice.timeoutId = window.setTimeout(() => { elements.shopNotice.hidden = true; }, 6500);
}

function renderProducts() {
  elements.productsGrid.innerHTML = products.map((product, index) => {
    const state = stockState(product.id);
    const disabled = availableStock(product.id) === 0;
    return `
    <article class="product-card ${disabled ? "is-sold-out" : ""} reveal">
      <button class="product-image-button" type="button" data-detail-index="${index}" aria-label="Ver detalle de ${product.name}">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
      </button>
      <div class="product-content">
        <span class="product-category">Mujer</span>
        <span class="stock-badge ${state.className}">${state.label}</span>
        <h3>${product.name}</h3>
        <p class="product-price">${product.priceLabel}</p>
        <div class="product-options">
          <label for="size-${product.id}">Talla<select id="size-${product.id}" data-size-index="${index}">${selectOptions(product.sizes)}</select></label>
          <label for="color-${product.id}">Color<select id="color-${product.id}" data-color-index="${index}">${selectOptions(product.colors)}</select></label>
        </div>
        <div class="product-actions">
          <button class="btn btn-secondary" type="button" data-detail-index="${index}">Ver detalle</button>
          <button class="btn btn-primary" type="button" data-add-index="${index}" ${disabled ? "disabled" : ""}>${disabled ? "Agotado" : "Agregar al carrito"}</button>
        </div>
      </div>
    </article>
  `;
  }).join("");
}

function addToCart(productIndex, size, color) {
  const product = products[productIndex];
  if (!product) return;

  const stock = availableStock(product.id);
  const quantityInCart = cartQuantityForProduct(product.id);
  if (stock === 0) {
    showNotice(`${product.name} está agotado.`);
    return;
  }
  if (quantityInCart >= stock) {
    showNotice(`Solo quedan ${stock} unidades disponibles de ${product.name}.`);
    return;
  }

  const existing = cart.find((item) => item.productId === product.id && item.size === size && item.color === color);
  if (existing) existing.quantity += 1;
  else cart.push({ productId: product.id, size, color, quantity: 1 });

  saveCart();
  renderCart();
  openCart();
}

function addFromCard(index) {
  const size = document.querySelector(`[data-size-index="${index}"]`).value;
  const color = document.querySelector(`[data-color-index="${index}"]`).value;
  addToCart(index, size, color);
}

function renderCart() {
  const quantityTotal = cart.reduce((total, item) => total + item.quantity, 0);
  elements.cartCount.textContent = quantityTotal;
  elements.cartCount.hidden = quantityTotal === 0;
  elements.cartEmpty.hidden = cart.length > 0;
  elements.payNow.disabled = cart.length === 0;
  elements.cartTotal.textContent = money(cartTotalValue());

  elements.cartItems.innerHTML = cart.map((item, index) => {
    const product = getProduct(item.productId);
    const stock = availableStock(product.id);
    const productQuantity = cartQuantityForProduct(product.id);
    const stockWarning = stock === 0
      ? "Producto agotado. Elimínalo o actualiza el carrito."
      : productQuantity > stock
        ? `Solo quedan ${stock} unidades disponibles.`
        : stock <= 3
          ? `Quedan ${stock} unidades.`
          : "";
    return `
      <article class="cart-item">
        <img src="${product.image}" alt="${product.name}">
        <div class="cart-item-info">
          <div class="cart-item-heading">
            <h3>${product.name}</h3>
            <button class="icon-button remove-item" type="button" data-cart-action="remove" data-cart-index="${index}" aria-label="Eliminar ${product.name}" title="Eliminar">&times;</button>
          </div>
          <p>Talla: <strong>${item.size}</strong> · Color: <strong>${item.color}</strong></p>
          <p>Precio unitario: ${money(product.price)}</p>
          ${stockWarning ? `<p class="cart-stock-warning">${stockWarning}</p>` : ""}
          <div class="cart-item-bottom">
            <div class="quantity-control" aria-label="Cantidad de ${product.name}">
              <button type="button" data-cart-action="decrease" data-cart-index="${index}" aria-label="Disminuir cantidad" title="Disminuir">−</button>
              <span>${item.quantity}</span>
              <button type="button" data-cart-action="increase" data-cart-index="${index}" aria-label="Aumentar cantidad" title="Aumentar">+</button>
            </div>
            <strong>${money(itemSubtotal(item))}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function updateCartItem(index, action) {
  const item = cart[index];
  if (!item) return;
  if (action === "increase") {
    const product = getProduct(item.productId);
    const stock = availableStock(item.productId);
    if (cartQuantityForProduct(item.productId) >= stock) {
      showNotice(`Solo quedan ${stock} unidades disponibles de ${product.name}.`);
      return;
    }
    item.quantity += 1;
  }
  if (action === "decrease") item.quantity = Math.max(1, item.quantity - 1);
  if (action === "remove") cart.splice(index, 1);
  saveCart();
  renderCart();
}

function openProductModal(index, trigger) {
  const product = products[index];
  if (!product) return;
  activeProductIndex = index;
  lastFocusedElement = trigger;
  elements.modalImage.src = product.detailImage;
  elements.modalImage.alt = product.name;
  elements.modalName.textContent = product.name;
  elements.modalPrice.textContent = product.priceLabel;
  const state = stockState(product.id);
  elements.modalStock.textContent = state.label;
  elements.modalStock.className = `modal-stock ${state.className}`;
  elements.modalSize.innerHTML = selectOptions(product.sizes);
  elements.modalColor.innerHTML = selectOptions(product.colors);
  elements.modalAdd.disabled = availableStock(product.id) === 0;
  elements.modalAdd.textContent = availableStock(product.id) === 0 ? "Agotado" : "Agregar al carrito";
  elements.productModal.hidden = false;
  document.body.classList.add("modal-open");
  document.querySelector(".modal-close").focus();
}

function closeProductModal() {
  elements.productModal.hidden = true;
  document.body.classList.remove("modal-open");
  elements.modalImage.src = "";
  lastFocusedElement?.focus();
}

function openCart() {
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
}

function closeCart() {
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

async function openPayment() {
  if (cart.length === 0) return;
  elements.payNow.disabled = true;
  try {
    const currentStock = await getCurrentStock([...new Set(cart.map((item) => item.productId))]);
    stockByProduct = { ...stockByProduct, ...currentStock };
    const invalid = cart.find((item) => cartQuantityForProduct(item.productId) > availableStock(item.productId));
    if (invalid) {
      const product = getProduct(invalid.productId);
      renderProducts();
      renderCart();
      showNotice(`El stock de ${product.name} cambió. Actualiza el carrito antes de pagar.`, "error");
      return;
    }
  } catch {
    showNotice("No se pudo validar el stock. Revisa tu conexión e inténtalo nuevamente.", "error");
    return;
  } finally {
    elements.payNow.disabled = cart.length === 0;
  }
  closeCart();
  elements.paymentTotal.textContent = money(cartTotalValue());
  elements.paymentStatus.textContent = "";
  elements.paymentModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closePayment() {
  elements.paymentModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function buildOrderMessage(orderId = "") {
  const lines = [
    "Hola, acabo de realizar el pago de mi pedido en Pericotitos Bellos.",
    "",
    "Detalle del pedido:",
    "",
  ];

  cart.forEach((item, index) => {
    const product = getProduct(item.productId);
    lines.push(`${index + 1}. ${product.name}`);
    lines.push(`- Talla: ${item.size}`);
    lines.push(`- Color: ${item.color}`);
    lines.push(`- Cantidad: ${item.quantity}`);
    lines.push(`- Precio unitario: ${money(product.price)}`);
    lines.push(`- Subtotal: ${money(itemSubtotal(item))}`);
    lines.push(`- Referencia: ${product.image}`);
    lines.push("");
  });

  lines.push(`Total pagado: ${money(cartTotalValue())}`);
  lines.push("");
  lines.push("Adjunto evidencia del pago.");
  lines.push("");
  lines.push("Por favor, confirmar mi pedido.");
  if (orderId) lines.push(`Código de pedido: ${orderId}`);
  return lines.join("\n");
}

function orderPayload() {
  return {
    total: cartTotalValue(),
    items: cart.map((item) => {
      const product = getProduct(item.productId);
      return {
        productId: item.productId,
        name: product.name,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unitPrice: product.price,
        subtotal: itemSubtotal(item),
        image: product.image,
      };
    }),
  };
}

elements.productsGrid.addEventListener("click", (event) => {
  const detailTrigger = event.target.closest("[data-detail-index]");
  const addTrigger = event.target.closest("[data-add-index]");
  if (detailTrigger) openProductModal(Number(detailTrigger.dataset.detailIndex), detailTrigger);
  if (addTrigger) addFromCard(Number(addTrigger.dataset.addIndex));
});

elements.modalAdd.addEventListener("click", () => {
  addToCart(activeProductIndex, elements.modalSize.value, elements.modalColor.value);
  closeProductModal();
});

elements.productModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) closeProductModal();
});

elements.cartToggle.addEventListener("click", openCart);
elements.cartDrawer.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-cart]")) closeCart();
  const actionButton = event.target.closest("[data-cart-action]");
  if (actionButton) updateCartItem(Number(actionButton.dataset.cartIndex), actionButton.dataset.cartAction);
});

elements.payNow.addEventListener("click", openPayment);
elements.paymentModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-payment]")) closePayment();
});

elements.sendReceipt.addEventListener("click", async () => {
  if (cart.length === 0) return;
  elements.sendReceipt.disabled = true;
  try {
    const currentStock = await getCurrentStock([...new Set(cart.map((item) => item.productId))]);
    stockByProduct = { ...stockByProduct, ...currentStock };
    const invalid = cart.find((item) => cartQuantityForProduct(item.productId) > availableStock(item.productId));
    if (invalid) throw new Error(`El stock de ${getProduct(invalid.productId).name} cambió. Actualiza el carrito.`);
    const orderId = await createPendingOrder(orderPayload());
    elements.paymentStatus.textContent = "Tu pedido fue preparado para enviarse por WhatsApp. Adjunta tu comprobante para confirmar la compra.";
    window.open(whatsappLink(buildOrderMessage(orderId)), "_blank", "noopener");
  } catch (error) {
    elements.paymentStatus.textContent = error.message || "No se pudo preparar el pedido.";
  } finally {
    elements.sendReceipt.disabled = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!elements.paymentModal.hidden) closePayment();
  else if (!elements.productModal.hidden) closeProductModal();
  else closeCart();
});

elements.menuToggle.addEventListener("click", () => {
  const isOpen = elements.navLinks.classList.toggle("open");
  elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
});

elements.navLinks.addEventListener("click", () => {
  elements.navLinks.classList.remove("open");
  elements.menuToggle.setAttribute("aria-expanded", "false");
});

function observeReveals() {
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

const defaultWhatsapp = whatsappLink(STORE_CONFIG.defaultMessage);
document.querySelector("#heroWhatsapp").href = defaultWhatsapp;
document.querySelector("#contactWhatsapp").href = defaultWhatsapp;
document.querySelector("#floatingWhatsapp").href = defaultWhatsapp;
document.querySelector("#businessHours").textContent = STORE_CONFIG.businessHours;

renderProducts();
renderCart();
observeReveals();

subscribeStock((stock) => {
  stockByProduct = stock;
  renderProducts();
  renderCart();
  observeReveals();
}, () => showNotice("No se pudo sincronizar el stock en tiempo real.", "error"));

if (!isFirebaseConfigured) {
  showNotice("Modo local de prueba: configura Firebase para sincronizar el stock entre dispositivos.", "info");
}
