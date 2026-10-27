// ============================================
// Medix Store - State Management
// ============================================
// Uses localStorage for persistence
// Will be migrated to Firebase Firestore later
// ============================================

const STORAGE_KEYS = {
  products: 'lr_products_v2',
  categories: 'lr_categories_v2',
  cart: 'lr_cart_v2',
  orders: 'lr_orders_v2',
  reviews: 'lr_reviews_v2',
  settings: 'lr_settings_v2',
  coupons: 'lr_coupons_v2',
  customers: 'lr_customers_v2',
  currentCustomer: 'lr_current_customer_v2',
  seeded: 'lr_seeded_v2',
  wishlist: 'lr_wishlist_v2',
  recent: 'lr_recent_v2'
};

// ===== EVENT SYSTEM =====
const listeners = {};

function on(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
}

function off(event, callback) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(cb => cb !== callback);
}

function emit(event, data) {
  if (!listeners[event]) return;
  listeners[event].forEach(cb => {
    try { cb(data); } catch (e) { console.error('Event handler error:', e); }
  });
}

// ===== HELPERS =====
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Detect if localStorage is available (blocked on file:// in some browsers)
const _memoryStore = {};
let _useLocalStorage = true;
try {
  const testKey = '__lr_test__';
  localStorage.setItem(testKey, '1');
  localStorage.removeItem(testKey);
} catch (e) {
  _useLocalStorage = false;
  console.warn('⚠️ localStorage unavailable — using in-memory storage. Data will NOT persist after refresh.');
}

function getFromStorage(key) {
  try {
    if (_useLocalStorage) {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    }
  } catch (e) {
    _useLocalStorage = false; // Disable for future calls
    console.warn("localStorage read failed, disabling and falling back to memory.");
  }
  return _memoryStore[key] !== undefined ? JSON.parse(JSON.stringify(_memoryStore[key])) : null;
}

let isFirebaseSyncing = false;

function saveToStorage(key, data) {
  try {
    if (_useLocalStorage) {
      localStorage.setItem(key, JSON.stringify(data));
    } else {
      _memoryStore[key] = JSON.parse(JSON.stringify(data));
    }
  } catch (e) {
    // Last resort fallback to memory
    _memoryStore[key] = JSON.parse(JSON.stringify(data));
  }

  saveHistoryState();
}

// ===== UNDO / REDO HISTORY =====
let historyStack = [];
let historyIndex = -1;
let isUndoRedoAction = false;

function saveHistoryState() {
  if (isUndoRedoAction || !_useLocalStorage) return;
  const state = {};
  const settingsStr = localStorage.getItem(STORAGE_KEYS.settings);
  if (settingsStr) {
    state[STORAGE_KEYS.settings] = settingsStr;
  }
  
  // Don't save if state is identical to last state
  if (historyIndex >= 0) {
    const lastState = historyStack[historyIndex];
    let identical = true;
    for(const key in state) {
      if(state[key] !== lastState[key]) identical = false;
    }
    if (identical) return;
  }

  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(state);
  if (historyStack.length > 50) {
    historyStack.shift();
  } else {
    historyIndex++;
  }
  emit('history-changed', { canUndo: historyIndex > 0, canRedo: historyIndex < historyStack.length - 1 });
}

function storeUndo() {
  if (historyIndex > 0) {
    isUndoRedoAction = true;
    historyIndex--;
    const state = historyStack[historyIndex];
    Object.keys(state).forEach(key => saveToStorage(key, state[key]));
    isUndoRedoAction = false;
    emit('history-changed', { canUndo: historyIndex > 0, canRedo: historyIndex < historyStack.length - 1 });
    // Trigger storage event so admin/app redraws
    window.dispatchEvent(new StorageEvent('storage', { key: 'lr_history_undo' }));
    return true;
  }
  return false;
}

function storeRedo() {
  if (historyIndex < historyStack.length - 1) {
    isUndoRedoAction = true;
    historyIndex++;
    const state = historyStack[historyIndex];
    Object.keys(state).forEach(key => saveToStorage(key, state[key]));
    isUndoRedoAction = false;
    emit('history-changed', { canUndo: historyIndex > 0, canRedo: historyIndex < historyStack.length - 1 });
    window.dispatchEvent(new StorageEvent('storage', { key: 'lr_history_redo' }));
    return true;
  }
  return false;
}

// ===== SETTINGS =====
const DEFAULT_SETTINGS = {
  storeName: 'Medix',
  subtitle_ar: 'تسوق بأناقة وراحة',
  subtitle_en: 'Shop with Elegance & Comfort',
  fontHeading: 'Playfair Display',
  fontBody: 'Inter',
  fontArabicHeading: 'Tajawal',
  fontArabicBody: 'Cairo',
  accentColor: '#000000',
  welcomePopupActive: false,
  welcomePopupTitle_ar: 'أهلاً بك في ميدكس! ✨',
  welcomePopupTitle_en: 'Welcome to Medix! ✨',
  welcomePopupSubtitle_ar: 'استخدم كود الخصم WELCOME10 للحصول على خصم 10% على طلبك الأول!',
  welcomePopupSubtitle_en: 'Use coupon code WELCOME10 to get 10% off on your first order!',
  welcomePopupCoupon: 'WELCOME10',
  welcomePopupImage: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=2070&auto=format&fit=crop',
  contactPhone: '01557019571',
  contactWhatsapp: '+201557019571',
  contactEmail: 'info@medix.com',
  socialFacebook: 'https://www.facebook.com/profile.php?id=61591348060610',
  socialInstagram: 'https://www.instagram.com/medix.eg5/',
  shippingCost: 110,
  freeShippingActive: false,
  freeShippingThreshold: 500,
  shippingRates: {
    'الغربية': 65,
    'القاهرة': 110,
    'الجيزة': 110,
    'الإسكندرية': 110,
    'القليوبية': 110,
    'المنوفية': 110,
    'الدقهلية': 110,
    'الشرقية': 110,
    'البحيرة': 110,
    'دمياط': 110,
    'كفر الشيخ': 110,
    'بورسعيد': 110,
    'السويس': 110,
    'الإسماعيلية': 110,
    'الفيوم': 110,
    'بني سويف': 110,
    'المنيا': 110,
    'أسيوط': 110,
    'سوهاج': 110,
    'قنا': 110,
    'الأقصر': 110,
    'أسوان': 110,
    'البحر الأحمر': 110,
    'الوادي الجديد': 110,
    'مطروح': 110,
    'شمال سيناء': 110,
    'جنوب سيناء': 110
  },
  aboutText_ar: 'Medix-ميدكس\n - متجرك المفضل للتسوق أونلاين. نقدم لك أفضل المنتجات بأعلى جودة وأفضل الأسعار مع توصيل سريع لجميع أنحاء مصر.',
  aboutText_en: 'Medix-ميدكس\n  - Your favorite online shopping destination. We offer the best products with highest quality and best prices with fast delivery Egypt.',
  address_ar: 'طنطا- مصر ',
  address_en: 'Tanta-Egypt',
  currency_ar: 'ج.م',
  currency_en: 'EGP',
  emailjs_service_id: 'service_vzxl9nt',
  emailjs_template_id: 'template_yyswrc8',
  emailjs_public_key: 'jSDRF1NnEfotwWpgC',
  sliderInterval: 6, // in seconds
  heroTitleSize: '4rem',
  heroSubtitleSize: '1.5rem',
  heroBtnSize: '1.1rem',
  heroTitleBold: true,
  heroSubtitleBold: true,
  heroBtnBold: true,
  announcementActive: false,
  announcementText_ar: 'خصم 50% علي كل المنتجات  ',
  announcementText_en: '50% off on all products',
  announcementBgColor: '#ff9500',
  announcementTextColor: '#000000',
  heroSlider: [
    {
      buttonText: "#000000",
      buttonText_en: "Shop Now",
      subtitleColor: "#ffffff",
      textColor: "#ffaa00",
      title_en: "Comfort, quality, and style all in one scrub",
      title_ar: "راحة، جودة، وأناقة في اسكراب واحد",
      image: "https://i.postimg.cc/4NYYzXRQ/photo-2026-07-02-17-16-11.jpg",
      subtitle_ar: "الراحة تبدأ من اختيار الاسكراب المناسب.",
      buttonBg: "#ffffff",
      buttonLink: "#/products",
      subtitle_en: "Comfort starts with choosing the right scrub.",
      buttonText_ar: "تسوق الآن"
    },
    {
      textColor: "#ffaa00",
      title_en: "Special Discounts",
      buttonText_ar: "تسوق الآن",
      buttonLink: "#/products",
      subtitleColor: "#ffffff",
      buttonText_en: "Shop Now",
      buttonBg: "#ffffff",
      buttonText: "#000000",
      title_ar: "خصومات مميزة",
      subtitle_en: "Comfort, quality, and style all in one scrub",
      subtitle_ar: "راحة، جودة، وأناقة في اسكراب واحد",
      image: "https://i.postimg.cc/sxqGD8tJ/photo-2026-07-05-20-53-03.jpg"
    }
  ],
  navBgColor: '#ffffff',
  navTextColor: '#000000',
  btnBgColor: '#000000',
  btnTextColor: '#ffffff',
  footerBgColor: '#f8f8f8',
  footerTextColor: '#333333',
  headingColor: '#000000',
  bodyBgColor: '#ffffff',
  textColor: '#111111',
  customBanners: [
    {
      active: true,
      position: 'middle',
      text_en: 'Special discounts of up to 50% for the grand opening, lasting for two weeks or more',
      bgColor: '#000000',
      text_ar: 'خصومات مميزة تصل الي 50%  ممتدة الي اسبوعين او اكثر 😍',
      textColor: '#f0f0f5',
      align: 'center',
      size: 'medium'
    }
  ],
  sizeGuideActive: true,
  sizeGuideTitle_ar: '📏 دليل المقاسات طبقا للوزن',
  sizeGuideTitle_en: '📏 Size Guide (By Weight)',
  sizeGuideTip_ar: 'نصيحة: إذا كان وزنك بين مقاسين، ننصح باختيار المقاس الأكبر لحرية وراحة حركة أكبر أثناء ساعات العمل والمناوبات.',
  sizeGuideTip_en: 'Tip: If your weight falls between two sizes, choose the larger size for extra comfort during long shifts.',
  sizeGuide: [
    { size: 'L', weight: '70- 80 كجم' },
    { size: 'XL', weight: '80- 90 كجم' },
    { size: '2XL', weight: '90- 100 كجم' },
    { size: '3XL', weight: '100- 110 كجم' }
  ]
};

function getSettings() {
  const stored = getFromStorage(STORAGE_KEYS.settings) || {};
  const settings = { ...DEFAULT_SETTINGS, ...stored };

  // Guard: If heroSlider is empty or not an array, fall back to DEFAULT_SETTINGS
  if (!settings.heroSlider || !Array.isArray(settings.heroSlider) || settings.heroSlider.length === 0) {
    settings.heroSlider = DEFAULT_SETTINGS.heroSlider;
  }

  // Guard: If customBanners is empty or not an array, fall back to DEFAULT_SETTINGS
  if (!settings.customBanners || !Array.isArray(settings.customBanners) || settings.customBanners.length === 0) {
    settings.customBanners = DEFAULT_SETTINGS.customBanners;
  }

  // Guard: If sizeGuide is empty or not an array, fall back to DEFAULT_SETTINGS
  if (!settings.sizeGuide || !Array.isArray(settings.sizeGuide) || settings.sizeGuide.length === 0) {
    settings.sizeGuide = DEFAULT_SETTINGS.sizeGuide;
  }

  // Guard: Preserve real store contacts if empty or placeholder
  if (!settings.contactWhatsapp || settings.contactWhatsapp === '+201234567890') {
    settings.contactWhatsapp = DEFAULT_SETTINGS.contactWhatsapp;
  }
  if (!settings.contactPhone || settings.contactPhone === '+20 123 456 7890') {
    settings.contactPhone = DEFAULT_SETTINGS.contactPhone;
  }
  if (!settings.socialFacebook) {
    settings.socialFacebook = DEFAULT_SETTINGS.socialFacebook;
  }
  if (!settings.socialInstagram) {
    settings.socialInstagram = DEFAULT_SETTINGS.socialInstagram;
  }
  if (!settings.emailjs_service_id) {
    settings.emailjs_service_id = DEFAULT_SETTINGS.emailjs_service_id;
  }
  if (!settings.emailjs_template_id) {
    settings.emailjs_template_id = DEFAULT_SETTINGS.emailjs_template_id;
  }
  if (!settings.emailjs_public_key) {
    settings.emailjs_public_key = DEFAULT_SETTINGS.emailjs_public_key;
  }
  if (!settings.announcementText_ar && DEFAULT_SETTINGS.announcementText_ar) {
    settings.announcementText_ar = DEFAULT_SETTINGS.announcementText_ar;
  }

  return settings;
}

function saveSettings(settings) {
  const current = getSettings();
  const updated = { ...current, ...settings };

  // Guard: Preserve heroSlider if settings did not contain a populated slider
  if ((!updated.heroSlider || updated.heroSlider.length === 0) && (current.heroSlider && current.heroSlider.length > 0)) {
    updated.heroSlider = current.heroSlider;
  }

  // Guard: Preserve customBanners if settings did not contain populated banners
  if ((!updated.customBanners || updated.customBanners.length === 0) && (current.customBanners && current.customBanners.length > 0)) {
    updated.customBanners = current.customBanners;
  }

  saveToStorage(STORAGE_KEYS.settings, updated);
  emit('settings-updated', updated);

  // Broadcast to other open tabs immediately (Instant Local Real-Time)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bc = new BroadcastChannel('medix_realtime_sync');
      bc.postMessage({ type: 'settings-updated', data: updated });
      bc.close();
    } catch(e) {}
  }
  
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, setDoc } = window.FirebaseDB;
      setDoc(doc(window.FirebaseDB.db, "store_data", STORAGE_KEYS.settings), updated, { merge: true })
        .catch(e => console.error("Settings cloud update failed:", e));
    } catch(e) {}
  }
  
  return updated;
}

// ===== DEFAULT FALLBACK DATA (Protects against empty cloud sync / offline) =====
const DEFAULT_CATEGORIES = [
  {
    id: "mr8i5gizskep2zsd2",
    name_ar: "اسكراب",
    name_en: "Scrubs",
    icon: "<i class=\"ph ph-t-shirt\"></i>",
    image: "",
    order: 0,
    status: "active"
  },
  {
    id: "mr8i74suj9swg1hgi",
    name_ar: "بالطو",
    name_en: "Coats",
    icon: "<i class=\"ph ph-first-aid\"></i>",
    image: "",
    order: 1,
    status: "active"
  }
];

const DEFAULT_PRODUCTS = [
  {
    id: "mr3o692kp1xqtwhhk",
    name_ar: "اسكراب ميدكس  الطبي الازرق",
    name_en: "Medex Medical Scrub Blue",
    categoryId: "mr8i5gizskep2zsd2",
    price: 1200,
    salePrice: 600,
    discountPercentage: 50,
    stock: 9,
    status: "active",
    featured: false,
    showScarcityBadge: true,
    scarcityThreshold: 2,
    ratingAvg: 5,
    ratingCount: 2,
    sizes: ["L", "XL", "2XL", "3XL"],
    colors: [{ hex: "#323467", name_en: "blue", name_ar: "ازرق", image: "" }],
    images: [
      "https://i.postimg.cc/sxqGD8tJ/photo-2026-07-05-20-53-03.jpg",
      "https://i.postimg.cc/C5WbwgLW/photo-2026-07-05-20-53-04.jpg"
    ],
    description_ar: "اسكراب طبي بخامة مريحة لساعات طويله معالج ضد الوبر او الانكماش بجودة عاليه",
    description_en: "Medical scrubs made of comfortable material for long hours, treated to resist fuzz and shrinking, with high quality",
    note_ar: "للحفاظ على جودة الاسكراب: اغسله بماء بارد، وتجنب الكلور",
    note_en: "To maintain the quality of your scrubs: Wash in cold water and avoid bleach.",
    linkedProducts: ["mr8gv20ouczqu9iie"],
    createdAt: "2026-07-02T15:38:54.188Z",
    updatedAt: "2026-08-01T17:16:10.101Z"
  },
  {
    id: "mr8gv20ouczqu9iie",
    name_ar: "بالطو ميدكس الطبي",
    name_en: "Medex medical coat",
    categoryId: "mr8i74suj9swg1hgi",
    price: 900,
    salePrice: 450,
    discountPercentage: 50,
    stock: 6,
    status: "active",
    featured: false,
    showScarcityBadge: true,
    scarcityThreshold: 5,
    ratingAvg: 0,
    ratingCount: 0,
    sizes: ["L", "XL", "2XL", "3XL"],
    colors: [],
    images: [
      "https://i.postimg.cc/SQzrtTs4/Whats-App-Image-2026-07-06-at-2-33-52-AM.jpg"
    ],
    description_ar: "اسكراب طبي بخامة مريحة لساعات طويله معالج ضد الوبر او الانكماش بجودة عاليه",
    description_en: "Comfortable fabric for long hours, treated to resist pilling and shrinkage, with premium quality",
    note_ar: "للحفاظ على جودة البالطو: اغسله بماء بارد، وتجنب الكلور",
    note_en: "To maintain the quality of your coat: Wash in cold water and avoid bleach.",
    linkedProducts: ["mr3o692kp1xqtwhhk", "mr8i32vt6nypoyrbk", "mr8icowkpw3n9z32o"],
    createdAt: "2026-07-06T00:13:05.400Z",
    updatedAt: "2026-08-01T17:16:04.783Z"
  },
  {
    id: "mr8i32vt6nypoyrbk",
    name_ar: "اسكراب ميدكس  الطبي اسود",
    name_en: "Medix Medical Scrub Black",
    categoryId: "mr8i5gizskep2zsd2",
    price: 1200,
    salePrice: 600,
    discountPercentage: 50,
    stock: 8,
    status: "active",
    featured: true,
    showScarcityBadge: true,
    scarcityThreshold: 5,
    ratingAvg: 0,
    ratingCount: 0,
    sizes: ["L", "XL", "2XL", "3XL"],
    colors: [{ hex: "#000000", name_ar: "اسود ", image: "", name_en: "Black" }],
    images: [
      "https://i.postimg.cc/tJwRfRCt/Whats-App-Image-2026-07-06-at-3-44-53-AM.jpg",
      "https://i.postimg.cc/3R3kCwdY/Whats-App-Image-2026-07-06-at-1-27-34-AM.jpg"
    ],
    description_ar: "اسكراب طبي بخامة مريحة لساعات طويله معالج ضد الوبر او الانكماش بجودة عاليه",
    description_en: "Medical scrubs made of comfortable material for long hours, treated to resist fuzz and shrinking, with high quality",
    note_ar: "للحفاظ على جودة الاسكراب: اغسله بماء بارد، وتجنب الكلور",
    note_en: "To maintain the quality of your scrubs: Wash in cold water and avoid bleach.",
    linkedProducts: ["mr8gv20ouczqu9iie"],
    createdAt: "2026-07-06T00:47:19.385Z",
    updatedAt: "2026-08-09T13:37:10.226Z"
  },
  {
    id: "mr8icowkpw3n9z32o",
    name_ar: "اسكراب ميدكس  الطبي اخضر غامق",
    name_en: "Medix Medical Scrub Dark green",
    categoryId: "mr8i5gizskep2zsd2",
    price: 1200,
    salePrice: 600,
    discountPercentage: 50,
    stock: 10,
    status: "active",
    featured: false,
    showScarcityBadge: true,
    scarcityThreshold: 5,
    ratingAvg: 0,
    ratingCount: 0,
    sizes: ["L", "XL", "2XL", "3XL"],
    colors: [],
    images: [
      "https://i.postimg.cc/QMFDLGwP/Whats-App-Image-2026-07-06-at-3-53-20-AM.jpg",
      "https://i.postimg.cc/J0LCBynQ/Whats-App-Image-2026-07-06-at-3-53-12-AM.jpg"
    ],
    description_ar: "اسكراب طبي بخامة مريحة لساعات طويله معالج ضد الوبر او الانكماش بجودة عاليه",
    description_en: "Medical scrubs made of comfortable material for long hours, treated to resist fuzz and shrinking, with high quality",
    note_ar: "للحفاظ على جودة الاسكراب: اغسله بماء بارد، وتجنب الكلور",
    note_en: "To maintain the quality of your scrubs: Wash in cold water and avoid bleach.",
    linkedProducts: ["mr8gv20ouczqu9iie"],
    createdAt: "2026-07-06T00:54:47.828Z",
    updatedAt: "2026-08-01T17:16:18.746Z"
  },
  {
    id: "mslujvsimofw92rl8",
    name_ar: "اسكراب ميدكس  الطبي اسود",
    name_en: "Medix Medical Scrub Black",
    categoryId: "mr8i5gizskep2zsd2",
    price: 1500,
    salePrice: 750,
    discountPercentage: 50,
    stock: 8,
    status: "active",
    featured: true,
    showScarcityBadge: true,
    scarcityThreshold: 5,
    ratingAvg: 0,
    ratingCount: 0,
    sizes: ["L", "XL", "2XL", "3XL"],
    colors: [{ hex: "#000000", name_ar: "اسود ", name_en: "Black", image: "" }],
    images: [
      "https://i.postimg.cc/j5BMNtDn/f4526dbb-c2dc-4f6e-87c9-822804677612.png"
    ],
    description_ar: "اسكراب طبي بخامة مريحة لساعات طويله معالج ضد الوبر او الانكماش بجودة عاليه",
    description_en: "Medical scrubs made of comfortable material for long hours, treated to resist fuzz and shrinking, with high quality",
    note_ar: "للحفاظ على جودة الاسكراب: اغسله بماء بارد، وتجنب الكلور",
    note_en: "To maintain the quality of your scrubs: Wash in cold water and avoid bleach.",
    linkedProducts: ["mr8gv20ouczqu9iie"],
    createdAt: "2026-08-09T13:37:01.362Z",
    updatedAt: "2026-08-14T13:24:14.305Z"
  },
  {
    id: "mssy1gbjek2l18ts2",
    name_ar: "اسكراب ميدكس  الطبي اسود  (نسائي )",
    name_en: "Medical Medix Scrub Black (Women's)",
    categoryId: "mr8i5gizskep2zsd2",
    price: 1500,
    salePrice: 750,
    discountPercentage: 50,
    stock: 10,
    status: "active",
    featured: true,
    showScarcityBadge: true,
    scarcityThreshold: 5,
    ratingAvg: 0,
    ratingCount: 0,
    sizes: ["L", "XL", "2XL", "3XL"],
    colors: [],
    images: [
      "https://i.postimg.cc/2yRhDrSK/New-Project.png"
    ],
    description_ar: "اسكراب طبي بخامة مريحة لساعات طويله معالج ضد الوبر او الانكماش بجودة عاليه",
    description_en: "Medical scrubs made of comfortable material for long hours, treated to resist fuzz and shrinking, with high quality",
    note_ar: "للحفاظ على جودة الاسكراب: اغسله بماء بارد، وتجنب الكلور",
    note_en: "To maintain the quality of your scrubs: Wash in cold water and avoid bleach.",
    linkedProducts: ["mr8gv20ouczqu9iie"],
    createdAt: "2026-08-14T12:49:03.199Z",
    updatedAt: "2026-08-14T13:46:46.774Z"
  }
];

// ===== PRODUCTS =====
function getProducts() {
  const products = (getFromStorage(STORAGE_KEYS.products) || []).filter(p => p);
  return products.length > 0 ? products : DEFAULT_PRODUCTS;
}

function getActiveProducts() {
  return getProducts().filter(p => p.status === 'active');
}

function getProduct(id) {
  return getProducts().find(p => String(p.id) === String(id)) || null;
}

function saveProduct(product) {
  const products = getProducts();
  if (product.id) {
    const index = products.findIndex(p => p.id === product.id);
    if (index !== -1) {
      products[index] = { ...products[index], ...product, updatedAt: new Date().toISOString() };
    } else {
      product.createdAt = product.createdAt || new Date().toISOString();
      product.updatedAt = new Date().toISOString();
      products.push(product);
    }
  } else {
    product.id = generateId();
    product.createdAt = new Date().toISOString();
    product.updatedAt = new Date().toISOString();
    product.ratingAvg = product.ratingAvg || 0;
    product.ratingCount = product.ratingCount || 0;
    product.status = product.status || 'active';
    product.linkedProducts = product.linkedProducts || [];
    products.push(product);
  }
  
  saveToStorage(STORAGE_KEYS.products, products);
  emit('products-updated', products);
  
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, setDoc } = window.FirebaseDB;
      const savedProduct = products.find(p => p.id === product.id);
      if (savedProduct) {
        setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.products, savedProduct.id), savedProduct)
          .catch(e => console.error("Product cloud save failed:", e));
      }
    } catch(e) {}
  }
  
  return product.id;
}

function deleteProduct(id) {
  const products = getProducts().filter(p => p.id !== id);
  saveToStorage(STORAGE_KEYS.products, products);
  emit('products-updated', products);
  
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, deleteDoc } = window.FirebaseDB;
      deleteDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.products, String(id)))
        .catch(e => console.error("Product cloud delete failed:", e));
    } catch(e) {}
  }
}

function getFeaturedProducts() {
  return getActiveProducts().filter(p => p.featured);
}

function getProductsByCategory(categoryId) {
  return getActiveProducts().filter(p => p.categoryId === categoryId);
}

function searchProducts(query, lang = 'ar') {
  if (!query || !query.trim()) return getActiveProducts();
  const q = query.toLowerCase().trim();
  return getActiveProducts().filter(p => {
    const name = lang === 'ar' ? (p.name_ar || '') : (p.name_en || '');
    const desc = lang === 'ar' ? (p.description_ar || '') : (p.description_en || '');
    const nameAlt = lang === 'ar' ? (p.name_en || '') : (p.name_ar || '');
    return name.toLowerCase().includes(q) ||
           desc.toLowerCase().includes(q) ||
           nameAlt.toLowerCase().includes(q);
  });
}

function getDiscountedProducts() {
  return getActiveProducts().filter(p => p.discountPercentage > 0 || (p.salePrice !== undefined && p.salePrice > 0 && p.salePrice < p.price));
}

function getProductPrice(product) {
  if (!product) return 0;
  if (product.salePrice !== undefined && product.salePrice > 0 && product.salePrice < product.price) {
    return product.salePrice;
  }
  if (product.discountPercentage > 0) {
    return Math.round(product.price * (1 - product.discountPercentage / 100));
  }
  return product.price;
}

// ===== CATEGORIES =====
function getCategories() {
  const categories = (getFromStorage(STORAGE_KEYS.categories) || []).sort((a, b) => (a.order || 0) - (b.order || 0));
  return categories.length > 0 ? categories : DEFAULT_CATEGORIES;
}

function getActiveCategories() {
  return getCategories().filter(c => c.status === 'active');
}

function getCategory(id) {
  return getCategories().find(c => c.id === id) || null;
}

function saveCategory(category) {
  const categories = getFromStorage(STORAGE_KEYS.categories) || [];
  if (category.id) {
    const index = categories.findIndex(c => c.id === category.id);
    if (index !== -1) {
      categories[index] = { ...categories[index], ...category };
    } else {
      categories.push(category);
    }
  } else {
    category.id = generateId();
    category.status = category.status || 'active';
    categories.push(category);
  }
  
  saveToStorage(STORAGE_KEYS.categories, categories);
  emit('categories-updated', categories);
  
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, setDoc } = window.FirebaseDB;
      const savedCategory = categories.find(c => c.id === category.id);
      if (savedCategory) {
        setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.categories, savedCategory.id), savedCategory)
          .catch(e => console.error("Category cloud save failed:", e));
      }
    } catch(e) {}
  }
  
  return category.id;
}

function deleteCategory(id) {
  const categories = (getFromStorage(STORAGE_KEYS.categories) || []).filter(c => c.id !== id);
  saveToStorage(STORAGE_KEYS.categories, categories);
  emit('categories-updated', categories);
  
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, deleteDoc } = window.FirebaseDB;
      deleteDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.categories, String(id)))
        .catch(e => console.error("Category cloud delete failed:", e));
    } catch(e) {}
  }
}

function getCategoryProductCount(categoryId) {
  return getActiveProducts().filter(p => p.categoryId === categoryId).length;
}

// ===== CART =====
function getCart() {
  return getFromStorage(STORAGE_KEYS.cart) || [];
}

function addToCart(productId, quantity = 1, options = {}) {
  const cart = getCart();
  const product = getProduct(productId);
  if (!product || product.stock <= 0) return false;

  const { color = null, size = null } = options;
  const cartItemId = `${productId}_${color || 'none'}_${size || 'none'}`;

  const existing = cart.find(item => item.cartItemId === cartItemId || (item.productId === productId && item.color === color && item.size === size));
  if (existing) {
    const newQty = existing.quantity + quantity;
    existing.quantity = Math.min(newQty, product.stock);
    if (!existing.cartItemId) existing.cartItemId = cartItemId;
  } else {
    cart.push({ cartItemId, productId, quantity: Math.min(quantity, product.stock), color, size });
  }
  saveToStorage(STORAGE_KEYS.cart, cart);
  emit('cart-updated', cart);
  return true;
}

function removeFromCart(cartItemId) {
  const cart = getCart().filter(item => item.cartItemId !== cartItemId && item.productId !== cartItemId);
  saveToStorage(STORAGE_KEYS.cart, cart);
  emit('cart-updated', cart);
}

function updateCartQuantity(cartItemId, quantity) {
  if (quantity <= 0) {
    return removeFromCart(cartItemId);
  }
  const cart = getCart();
  const item = cart.find(i => i.cartItemId === cartItemId || i.productId === cartItemId);
  if (item) {
    const product = getProduct(item.productId);
    item.quantity = Math.min(quantity, product ? product.stock : quantity);
    saveToStorage(STORAGE_KEYS.cart, cart);
    emit('cart-updated', cart);
  }
}

function clearCart() {
  saveToStorage(STORAGE_KEYS.cart, []);
  emit('cart-updated', []);
}

function getShippingCost(city, subtotal) {
  const settings = getSettings();
  if (settings.freeShippingActive && subtotal >= settings.freeShippingThreshold) return 0;
  if (!city) return settings.shippingCost || 0;
  return settings.shippingRates && settings.shippingRates[city] !== undefined
    ? settings.shippingRates[city]
    : (settings.shippingCost || 0);
}

function getCartTotal(city = '') {
  const cart = getCart();
  const settings = getSettings();
  let subtotal = 0;
  let itemCount = 0;

  cart.forEach(item => {
    const product = getProduct(item.productId);
    if (product) {
      subtotal += getProductPrice(product) * item.quantity;
      itemCount += item.quantity;
    }
  });

  const shipping = subtotal > 0 ? getShippingCost(city, subtotal) : 0;

  return {
    subtotal,
    shipping,
    total: subtotal + shipping,
    itemCount
  };
}

function getCartWithProducts() {
  const cart = getCart();
  return cart.map(item => {
    const product = getProduct(item.productId);
    return {
      ...item,
      product,
      unitPrice: product ? getProductPrice(product) : 0,
      totalPrice: product ? getProductPrice(product) * item.quantity : 0
    };
  }).filter(item => item.product);
}

// ===== ORDERS =====
function getOrders() {
  return (getFromStorage(STORAGE_KEYS.orders) || []).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getOrder(id) {
  return getOrders().find(o => o.id === id) || null;
}

function getOrderByNumber(orderNumber) {
  if (!orderNumber) return null;
  return getOrders().find(o => o.orderNumber.toUpperCase() === orderNumber.toUpperCase()) || null;
}

async function createOrder(orderData) {
  const cart = getCartWithProducts();
  const cartTotal = getCartTotal(orderData.city);

  if (cart.length === 0) return null;

  const discountAmount = orderData.discountAmount || 0;
  const finalTotal = Math.max(0, cartTotal.total - discountAmount);
  
  const customerId = getCurrentCustomer()?.id || null;

  const order = {
    id: generateId(),
    customerId: customerId,
    orderNumber: 'LR-' + String(Math.floor(10000 + Math.random() * 90000)),
    customerName: orderData.customerName,
    customerPhone: orderData.customerPhone,
    customerEmail: orderData.customerEmail || '',
    customerAddress: orderData.customerAddress,
    city: orderData.city || '',
    items: cart.map(item => ({
      productId: item.productId,
      name_ar: item.product.name_ar,
      name_en: item.product.name_en,
      price: item.product.price,
      discountedPrice: getProductPrice(item.product),
      quantity: item.quantity,
      image: item.product.images?.[0] || '',
      color: item.color || null,
      size: item.size || null
    })),
    subtotal: cartTotal.subtotal,
    shipping: cartTotal.shipping,
    discountAmount: discountAmount,
    couponCode: orderData.couponCode || '',
    total: finalTotal,
    status: 'new',
    notes: orderData.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  let cloudSynced = false;
  if (window.FirebaseDB && window.FirebaseDB.db) {
    try {
      const { db, runTransaction, doc } = window.FirebaseDB;
      await runTransaction(db, async (transaction) => {
        const productRefs = cart.map(item => doc(db, STORAGE_KEYS.products, String(item.productId)));
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
        
        const updates = [];
        for (let i = 0; i < cart.length; i++) {
          const pDoc = productDocs[i];
          const exists = typeof pDoc.exists === 'function' ? pDoc.exists() : pDoc.exists;
          if (!exists) throw new Error("عذراً، أحد المنتجات لم يعد متاحاً.");
          
          const pData = pDoc.data();
          const newStock = pData.stock - cart[i].quantity;
          
          if (newStock < 0) {
            throw new Error(`نفدت الكمية للمنتج: ${pData.name_ar}`);
          }
          updates.push({ ref: productRefs[i], stock: newStock });
        }
        
        updates.forEach(u => transaction.update(u.ref, { stock: u.stock }));
        
        const orderRef = doc(db, STORAGE_KEYS.orders, String(order.id));
        transaction.set(orderRef, order);
      });
      cloudSynced = true;
    } catch (e) {
      console.warn("Order cloud transaction failed, falling back to local storage:", e);
      // If it's a genuine out-of-stock validation error, rethrow so UI displays friendly toast
      if (e.message && (e.message.includes('نفدت الكمية') || e.message.includes('لم يعد متاحاً'))) {
        throw e;
      }
      // Otherwise (e.g. offline / permission / network glitch), save locally and try non-blocking setDoc
      try {
        const { doc, setDoc } = window.FirebaseDB;
        setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.orders, String(order.id)), order).catch(()=>{});
      } catch(err) {}
    }
  }

  // Always update stock locally to keep UI consistent
  cart.forEach(item => {
    const product = getProduct(item.productId);
    if (product) {
      saveProduct({ ...product, stock: Math.max(0, product.stock - item.quantity) });
    }
  });

  const orders = getFromStorage(STORAGE_KEYS.orders) || [];
  orders.push(order);
  saveToStorage(STORAGE_KEYS.orders, orders);
  clearCart();
  emit('orders-updated', orders);
  return order;
}

function updateOrderStatus(id, status) {
  const orders = getFromStorage(STORAGE_KEYS.orders) || [];
  const order = orders.find(o => o.id === id);
  if (order) {
    order.status = status;
    order.updatedAt = new Date().toISOString();
    saveToStorage(STORAGE_KEYS.orders, orders);
    emit('orders-updated', orders);
    if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
      try {
        const { doc, setDoc } = window.FirebaseDB;
        setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.orders, order.id), order)
          .catch(e => console.error("Order cloud save failed:", e));
      } catch(e) {}
    }
  }
  return order;
}

function deleteOrder(id) {
  const orders = (getFromStorage(STORAGE_KEYS.orders) || []).filter(o => o.id !== id);
  saveToStorage(STORAGE_KEYS.orders, orders);
  emit('orders-updated', orders);
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, deleteDoc } = window.FirebaseDB;
      deleteDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.orders, String(id)))
        .catch(e => console.error("Order cloud delete failed:", e));
    } catch(e) {}
  }
}

function getOrderStats() {
  const orders = getOrders();
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o => o?.createdAt?.startsWith(today));
  const totalRevenue = orders.filter(o => o?.status === 'delivered').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const pendingOrders = orders.filter(o => ['new', 'confirmed', 'preparing', 'shipping'].includes(o.status));

  return {
    totalOrders: orders.length,
    todayOrders: todayOrders.length,
    totalRevenue,
    pendingOrders: pendingOrders.length,
    deliveredOrders: orders.filter(o => o.status === 'delivered').length,
    cancelledOrders: orders.filter(o => o.status === 'cancelled').length
  };
}

const DEFAULT_REVIEWS = [
  {
    id: "msaek9q1ub5eg6ush",
    productId: "mr3o692kp1xqtwhhk",
    customerName: "د تامر نصر",
    rating: 5,
    comment: "خامة جميله جدا وسرعة في التوصيل شكرا",
    approved: true,
    createdAt: "2026-08-01T13:23:57.625Z"
  },
  {
    id: "msaekx80udasi40xo",
    productId: "mr3o692kp1xqtwhhk",
    customerName: "ام مريم",
    rating: 5,
    comment: "ماشاء الله خامة جميله واكيد هطلب ثاني",
    approved: true,
    createdAt: "2026-08-01T13:24:28.080Z"
  }
];

// ===== REVIEWS =====
function getReviews(productId) {
  let reviews = getFromStorage(STORAGE_KEYS.reviews) || [];
  if (reviews.length === 0) reviews = DEFAULT_REVIEWS;
  return reviews.filter(r => r.productId === productId).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getApprovedReviews(productId) {
  return getReviews(productId).filter(r => r.approved);
}

function getAllReviews() {
  const reviews = getFromStorage(STORAGE_KEYS.reviews) || [];
  return (reviews.length > 0 ? reviews : DEFAULT_REVIEWS).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function addReview(review) {
  const reviews = getFromStorage(STORAGE_KEYS.reviews) || [];
  review.id = generateId();
  review.approved = false;
  review.createdAt = new Date().toISOString();
  reviews.push(review);
  saveToStorage(STORAGE_KEYS.reviews, reviews);
  emit('reviews-updated', reviews);
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, setDoc } = window.FirebaseDB;
      setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.reviews, review.id), review)
        .catch(e => console.error("Review cloud save failed:", e));
    } catch(e) {}
  }
  return review.id;
}

function approveReview(id) {
  const reviews = getFromStorage(STORAGE_KEYS.reviews) || [];
  const review = reviews.find(r => r.id === id);
  if (review) {
    review.approved = true;
    saveToStorage(STORAGE_KEYS.reviews, reviews);
    updateProductRating(review.productId);
    emit('reviews-updated', reviews);
    if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
      try {
        const { doc, setDoc } = window.FirebaseDB;
        setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.reviews, review.id), review)
          .catch(e => console.error("Review cloud save failed:", e));
      } catch(e) {}
    }
  }
}

function deleteReview(id) {
  const reviews = getFromStorage(STORAGE_KEYS.reviews) || [];
  const review = reviews.find(r => r.id === id);
  const filtered = reviews.filter(r => r.id !== id);
  saveToStorage(STORAGE_KEYS.reviews, filtered);
  if (review) updateProductRating(review.productId);
  emit('reviews-updated', filtered);
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, deleteDoc } = window.FirebaseDB;
      deleteDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.reviews, String(id)))
        .catch(e => console.error("Review cloud delete failed:", e));
    } catch(e) {}
  }
}

function updateProductRating(productId) {
  const approved = getApprovedReviews(productId);
  const products = getProducts();
  const product = products.find(p => p.id === productId);
  if (product) {
    if (approved.length > 0) {
      product.ratingAvg = Math.round((approved.reduce((sum, r) => sum + r.rating, 0) / approved.length) * 10) / 10;
      product.ratingCount = approved.length;
    } else {
      product.ratingAvg = 0;
      product.ratingCount = 0;
    }
    saveToStorage(STORAGE_KEYS.products, products);
    emit('products-updated', products);
  }
}

// ===== WISHLIST =====
function getWishlist() {
  return getFromStorage(STORAGE_KEYS.wishlist) || [];
}

function toggleWishlist(productId) {
  let wishlist = getWishlist();
  const index = wishlist.indexOf(productId);
  let added = false;
  if (index !== -1) {
    wishlist.splice(index, 1);
  } else {
    wishlist.push(productId);
    added = true;
  }
  saveToStorage(STORAGE_KEYS.wishlist, wishlist);
  emit('wishlist-updated', wishlist);
  return added;
}

function isInWishlist(productId) {
  return getWishlist().includes(productId);
}

// ===== RECENTLY VIEWED =====
function getRecentlyViewed() {
  return getFromStorage(STORAGE_KEYS.recent) || [];
}

function addRecentlyViewed(productId) {
  let recent = getRecentlyViewed();
  // Remove if already exists to move to the front
  recent = recent.filter(id => id !== productId);
  recent.unshift(productId);
  // Keep last 10
  if (recent.length > 10) {
    recent = recent.slice(0, 10);
  }
  saveToStorage(STORAGE_KEYS.recent, recent);
  emit('recent-updated', recent);
}

// ===== ADMIN AUTH (Firebase Auth Integrated) =====
function adminLogin(email, password) {
  if (!window.FirebaseAuth) return Promise.resolve(false);
  
  return window.FirebaseAuth.signInWithEmailAndPassword(window.FirebaseAuth.auth, email, password)
    .then((userCredential) => {
      // Set a local flag so the synchronous UI knows to show the dashboard
      try { localStorage.setItem('lr_admin', 'true'); } catch(e) { _memoryStore['_admin'] = true; }
      return true;
    })
    .catch((error) => {
      console.error("Admin Login failed:", error.message);
      let errorMsg = error.message;
      if (error.code === 'auth/invalid-email') errorMsg = "صيغة الإيميل خاطئة.";
      else if (error.code === 'auth/user-not-found') errorMsg = "هذا الإيميل غير مسجل كأدمن.";
      else if (error.code === 'auth/wrong-password') errorMsg = "كلمة المرور خاطئة.";
      return errorMsg;
    });
}

function isAdminLoggedIn() {
  try { return localStorage.getItem('lr_admin') === 'true'; } catch(e) { return _memoryStore['_admin'] === true; }
}

function adminLogout() {
  if (window.FirebaseAuth) {
    window.FirebaseAuth.signOut(window.FirebaseAuth.auth).catch(e => console.error("Logout error", e));
  }
  try { localStorage.removeItem('lr_admin'); } catch(e) {}
  _memoryStore['_admin'] = false;
}

function changeAdminPassword(oldPassword, newPassword) {
  // Passwords are now managed in the Firebase Console
  alert("عذراً، يجب تغيير كلمة المرور من داخل لوحة تحكم Firebase (Authentication) لضمان أقصى درجات الأمان.");
  return false;
}

// ===== CUSTOMERS & AUTH =====
function getCustomers() {
  return getFromStorage(STORAGE_KEYS.customers) || [];
}

function getCurrentCustomer() {
  return getFromStorage(STORAGE_KEYS.currentCustomer) || null;
}

// ------------------------------------
// Google Firebase Auth
// ------------------------------------
async function loginWithGoogle() {
  if (!window.FirebaseAuth) {
    return { success: false, message: 'firebase_not_loaded' };
  }
  
  if (window.location.protocol === 'file:') {
    alert("تنبيه: تسجيل الدخول بواسطة جوجل (Google Sign-In) لا يعمل عند فتح الملف محلياً من الجهاز (file://) بسبب حماية جوجل. يرجى تجربة هذه الميزة بعد رفع الموقع على السحابة (GitHub).");
    return { success: false, message: 'unsupported_environment' };
  }
  
  try {
    const result = await window.FirebaseAuth.signInWithPopup(window.FirebaseAuth.auth, window.FirebaseAuth.provider);
    const user = result.user;
    
    // Check if customer exists in our storage, otherwise create
    let customers = getCustomers();
    let customer = customers.find(c => c.email === user.email);
    
    if (!customer) {
      customer = {
        id: user.uid,
        name: user.displayName || 'Google User',
        email: user.email,
        phone: user.phoneNumber || '',
        password: '', // Google users don't have a local password
        createdAt: new Date().toISOString()
      };
      customers.push(customer);
      saveToStorage(STORAGE_KEYS.customers, customers);
      if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
        try {
          const { doc, setDoc } = window.FirebaseDB;
          setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.customers, customer.id), customer)
            .catch(e => console.error("Customer cloud save failed:", e));
        } catch(e) {}
      }
    }
    
    const sessionData = { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone };
    saveToStorage(STORAGE_KEYS.currentCustomer, sessionData);
    emit('auth-changed', sessionData);
    
    return { success: true, customer };
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    return { success: false, message: error.message };
  }
}

// Automatically sync with Firebase Auth state and Firestore
document.addEventListener('DOMContentLoaded', () => {
  // Listen to changes in localStorage from other tabs for instant sync
  window.addEventListener('storage', (e) => {
    if (Object.values(STORAGE_KEYS).includes(e.key)) {
      emit('data-synced', null);
    }
  });

  if (window.FirebaseAuth) {
    window.FirebaseAuth.onAuthStateChanged(window.FirebaseAuth.auth, (user) => {
      if (!user && getCurrentCustomer()) {
        // If logged out from Firebase but local shows logged in, sync it (if it's a Google user)
        // For simplicity, we won't auto logout unless explicitly clicked
      }
    });
  }
});
// ------------------------------------

async function registerCustomer(customerData) {
  if (!window.FirebaseAuth) return { success: false, message: 'firebase_not_loaded' };
  
  try {
    const userCredential = await window.FirebaseAuth.createUserWithEmailAndPassword(
      window.FirebaseAuth.auth, 
      customerData.email, 
      customerData.password
    );
    const user = userCredential.user;
    
    const newCustomer = {
      id: user.uid,
      name: customerData.name,
      email: customerData.email,
      phone: customerData.phone,
      createdAt: new Date().toISOString()
    };

    const customers = getCustomers();
    customers.push(newCustomer);
    saveToStorage(STORAGE_KEYS.customers, customers);
    
    if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
      try {
        const { doc, setDoc } = window.FirebaseDB;
        setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.customers, newCustomer.id), newCustomer)
          .catch(e => console.error("Customer cloud save failed:", e));
      } catch(e) {}
    }

    const sessionData = { id: newCustomer.id, name: newCustomer.name, email: newCustomer.email, phone: newCustomer.phone };
    saveToStorage(STORAGE_KEYS.currentCustomer, sessionData);
    emit('auth-changed', sessionData);

    return { success: true, customer: newCustomer };
  } catch (error) {
    console.error("Registration failed:", error);
    if (error.code === 'auth/email-already-in-use') return { success: false, message: 'email_exists' };
    return { success: false, message: error.message };
  }
}

async function loginCustomer(email, password) {
  if (!window.FirebaseAuth) return { success: false, message: 'firebase_not_loaded' };
  
  try {
    const userCredential = await window.FirebaseAuth.signInWithEmailAndPassword(
      window.FirebaseAuth.auth, 
      email, 
      password
    );
    const user = userCredential.user;
    
    let customers = getCustomers();
    let customer = customers.find(c => c.id === user.uid || c.email === email);
    
    if (!customer) {
      // Reconstruct profile if missing locally
      customer = {
        id: user.uid,
        name: user.displayName || 'Customer',
        email: user.email,
        phone: user.phoneNumber || '',
        createdAt: new Date().toISOString()
      };
      customers.push(customer);
      saveToStorage(STORAGE_KEYS.customers, customers);
    }
    
    const sessionData = { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone };
    saveToStorage(STORAGE_KEYS.currentCustomer, sessionData);
    emit('auth-changed', sessionData);
    return { success: true, customer };
  } catch (error) {
    console.error("Login failed:", error);
    return { success: false, message: 'invalid_credentials' };
  }
}

function logoutCustomer() {
  if (window.FirebaseAuth) {
    window.FirebaseAuth.signOut(window.FirebaseAuth.auth).catch(e => console.error("SignOut error", e));
  }
  if (_useLocalStorage) {
    try { localStorage.removeItem(STORAGE_KEYS.currentCustomer); } catch(e) {}
  }
  delete _memoryStore[STORAGE_KEYS.currentCustomer];
  emit('auth-changed', null);
}

function getCustomerOrders(customerId) {
  const orders = getFromStorage(STORAGE_KEYS.orders) || [];
  return orders.filter(o => o.customerId === customerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

const DEFAULT_COUPONS = [
  {
    id: "mshdgvb3concflk1y",
    code: "MEDIX.EG",
    discountType: "fixed",
    discountValue: 150,
    minOrderAmount: 1050,
    expiryDate: "2026-12-31",
    status: "active"
  }
];

// ===== COUPONS =====
function getCoupons() {
  const coupons = getFromStorage(STORAGE_KEYS.coupons) || [];
  return coupons.length > 0 ? coupons : DEFAULT_COUPONS;
}

function getCoupon(code) {
  if (!code) return null;
  return getCoupons().find(c => c.code.toUpperCase() === code.toUpperCase()) || null;
}

function saveCoupon(coupon) {
  const coupons = getCoupons();
  coupon.code = coupon.code.toUpperCase();
  if (coupon.id) {
    const index = coupons.findIndex(c => c.id === coupon.id);
    if (index !== -1) {
      coupons[index] = { ...coupons[index], ...coupon };
    } else {
      coupons.push(coupon);
    }
  } else {
    coupon.id = generateId();
    coupon.status = coupon.status || 'active';
    coupons.push(coupon);
  }
  saveToStorage(STORAGE_KEYS.coupons, coupons);
  emit('coupons-updated', coupons);
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, setDoc } = window.FirebaseDB;
      const savedCoupon = coupons.find(c => c.id === coupon.id);
      if (savedCoupon) {
        setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.coupons, savedCoupon.id), savedCoupon)
          .catch(e => console.error("Coupon cloud save failed:", e));
      }
    } catch(e) {}
  }
  return coupon.id;
}

function deleteCoupon(id) {
  const coupons = getCoupons().filter(c => c.id !== id);
  saveToStorage(STORAGE_KEYS.coupons, coupons);
  emit('coupons-updated', coupons);
  if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
    try {
      const { doc, deleteDoc } = window.FirebaseDB;
      deleteDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.coupons, String(id)))
        .catch(e => console.error("Coupon cloud delete failed:", e));
    } catch(e) {}
  }
}

function validateCoupon(code, cartSubtotal) {
  const coupon = getCoupon(code);
  if (!coupon || coupon.status !== 'active') return { valid: false, message: 'Invalid or inactive coupon' };
  
  if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
    return { valid: false, message: 'Coupon expired' };
  }
  if (coupon.minOrderAmount && cartSubtotal < coupon.minOrderAmount) {
    return { valid: false, message: `Minimum order amount is ${coupon.minOrderAmount}` };
  }
  
  let discountAmount = 0;
  if (coupon.discountType === 'percentage') {
    discountAmount = Math.round((cartSubtotal * coupon.discountValue) / 100);
  } else {
    discountAmount = coupon.discountValue;
  }
  
  // Cap discount if maxDiscountAmount is set
  if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
    discountAmount = coupon.maxDiscountAmount;
  }
  
  return { valid: true, discountAmount, coupon };
}

// ===== SEED DATA =====
function seedData() {
  if (getFromStorage(STORAGE_KEYS.seeded)) return;

  // If Firebase is available, DO NOT seed empty data.
  // Wait for Firestore to populate the store!
  if (window.FirebaseDB && window.FirebaseDB.db) {
    return;
  }

  saveToStorage(STORAGE_KEYS.categories, []);
  saveToStorage(STORAGE_KEYS.products, []);
  saveToStorage(STORAGE_KEYS.reviews, []);
  saveToStorage(STORAGE_KEYS.orders, []);
  saveToStorage(STORAGE_KEYS.coupons, []);

  saveToStorage(STORAGE_KEYS.seeded, true);
  console.log('✅ Medix: Store initialized with empty data!');
}

// ===== IMPORT BACKUP =====
function importBackup(data) {
  if (data.products) saveToStorage(STORAGE_KEYS.products, data.products);
  if (data.categories) saveToStorage(STORAGE_KEYS.categories, data.categories);
  if (data.settings) saveToStorage(STORAGE_KEYS.settings, data.settings);
  if (data.orders) saveToStorage(STORAGE_KEYS.orders, data.orders);
  if (data.coupons) saveToStorage(STORAGE_KEYS.coupons, data.coupons);
  if (data.reviews) saveToStorage(STORAGE_KEYS.reviews, data.reviews);
  return true;
}

// ===== RESET DATA (for testing) =====
function resetAllData() {
  if (!_useLocalStorage) {
    Object.keys(_memoryStore).forEach(k => delete _memoryStore[k]);
  } else {
    Object.keys(STORAGE_KEYS).forEach(k => {
      localStorage.removeItem(STORAGE_KEYS[k]);
    });
  }
  historyStack = [];
  historyIndex = -1;
  seedData();
}

function autoRecoverLocalOrders() {
  if (typeof localStorage === 'undefined') return;
  try {
    const v1Orders = JSON.parse(localStorage.getItem('lr_orders') || '[]');
    const v2OrdersLocal = JSON.parse(localStorage.getItem('lr_orders_v2') || '[]');
    const currentOrders = getFromStorage(STORAGE_KEYS.orders) || [];
    let recovered = false;
    
    [...v1Orders, ...v2OrdersLocal].forEach(o => {
      if (o && o.id && !currentOrders.find(co => co.id === o.id)) {
        currentOrders.push(o);
        recovered = true;
        
        // Sync back to Firebase if possible
        if (window.FirebaseDB && window.FirebaseDB.db && !isFirebaseSyncing) {
           try {
             const { doc, setDoc } = window.FirebaseDB;
             setDoc(doc(window.FirebaseDB.db, STORAGE_KEYS.orders, String(o.id)), o).catch(()=>{});
           } catch(e){}
        }
      }
    });
    
    if (recovered) {
      saveToStorage(STORAGE_KEYS.orders, currentOrders);
      emit('orders-updated', currentOrders);
      console.log('✅ Recovered missing local orders!');
    }
  } catch (e) {
    console.error('Failed to recover orders:', e);
  }
}

// ===== FIREBASE REAL-TIME SYNC =====
function initFirebaseSync() {
  if (!window.FirebaseDB || !window.FirebaseDB.db) return;
  const { db, doc, collection, onSnapshot } = window.FirebaseDB;

  const collectionsToSync = [
    STORAGE_KEYS.products, 
    STORAGE_KEYS.categories, 
    STORAGE_KEYS.orders,
    STORAGE_KEYS.coupons,
    STORAGE_KEYS.reviews,
    STORAGE_KEYS.customers
  ];

  const docsToSync = [
    STORAGE_KEYS.settings
  ];

  const criticalKeys = [STORAGE_KEYS.products, STORAGE_KEYS.categories, STORAGE_KEYS.settings];
  let criticalSyncedCount = 0;
  let initialSyncDone = false;

  const checkInitialSync = (key) => {
    if (!initialSyncDone && criticalKeys.includes(key)) {
      criticalSyncedCount++;
      if (criticalSyncedCount >= criticalKeys.length) {
        initialSyncDone = true;
        window.isFirebaseInitialSyncDone = true;
        window.dispatchEvent(new CustomEvent('firebase-initial-sync-done'));
      }
    }
  };

  const applyLocalData = (key, payload) => {
    if (!payload) return;
    const newPayloadStr = JSON.stringify(payload);
    let isDifferent = true;
    
    if (_useLocalStorage) {
      try {
        if (localStorage.getItem(key) === newPayloadStr) {
          isDifferent = false;
        } else {
          localStorage.setItem(key, newPayloadStr);
        }
      } catch (e) {
        console.warn(`LocalStorage error for ${key}, falling back to memory store:`, e);
        _useLocalStorage = false; // Disable globally for future calls
        if (JSON.stringify(_memoryStore[key]) === newPayloadStr) {
          isDifferent = false;
        } else {
          _memoryStore[key] = JSON.parse(newPayloadStr);
        }
      }
    } else {
      if (JSON.stringify(_memoryStore[key]) === newPayloadStr) {
        isDifferent = false;
      } else {
        _memoryStore[key] = JSON.parse(newPayloadStr);
      }
    }

    if (isDifferent) {
      if (key === STORAGE_KEYS.settings) {
        emit('settings-updated', getSettings());
      } else if (key === STORAGE_KEYS.products) {
        emit('products-updated', payload);
      } else if (key === STORAGE_KEYS.categories) {
        emit('categories-updated', payload);
      } else if (key === STORAGE_KEYS.orders) {
        emit('orders-updated', payload);
      } else if (key === STORAGE_KEYS.reviews) {
        emit('reviews-updated', payload);
      }
      emit('data-synced', { key, payload });
      
      try {
        window.dispatchEvent(new StorageEvent('storage', { key: key }));
      } catch(e) {}
      window.dispatchEvent(new CustomEvent('firebase-data-synced', { detail: { key: key } }));
    }
  };

  // Sync Collections
  collectionsToSync.forEach(key => {
    onSnapshot(collection(db, key), (snapshot) => {
      const payload = [];
      snapshot.forEach(docSnap => {
        payload.push(docSnap.data());
      });
      applyLocalData(key, payload);
      checkInitialSync(key);
    }, (error) => {
      console.error(`Error syncing collection ${key}:`, error);
      checkInitialSync(key);
    });
  });

  // Sync Single Documents (Settings)
  docsToSync.forEach(key => {
    onSnapshot(doc(db, "store_data", key), (docSnap) => {
      const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : docSnap.exists;
      if (exists && docSnap.data()) {
        const raw = docSnap.data();
        const nested = (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) ? raw.data : {};
        
        // Merge nested legacy data with root data
        const payload = { ...nested, ...raw };
        delete payload.data;

        // Restore any populated arrays or strings from nested if raw has empty ones (e.g. heroSlider, customBanners)
        for (const k in nested) {
          const rootVal = raw[k];
          const nestedVal = nested[k];
          const rootEmpty = rootVal === undefined || rootVal === null || (Array.isArray(rootVal) && rootVal.length === 0) || rootVal === '';
          const nestedHasData = nestedVal !== undefined && nestedVal !== null && (!Array.isArray(nestedVal) || nestedVal.length > 0) && nestedVal !== '';
          if (rootEmpty && nestedHasData) {
            payload[k] = nestedVal;
          }
        }

        applyLocalData(key, payload);
      }
      checkInitialSync(key);
    }, (error) => {
      console.error(`Error syncing document ${key}:`, error);
      checkInitialSync(key);
    });
  });
}

// Cross-tab real-time sync via BroadcastChannel
if (typeof BroadcastChannel !== 'undefined') {
  try {
    const syncChannel = new BroadcastChannel('medix_realtime_sync');
    syncChannel.onmessage = (event) => {
      if (!event.data) return;
      const { type, data } = event.data;
      if (type === 'settings-updated' && data) {
        saveToStorage(STORAGE_KEYS.settings, data);
        emit('settings-updated', getSettings());
        window.dispatchEvent(new CustomEvent('firebase-data-synced', { detail: { key: STORAGE_KEYS.settings } }));
      }
    };
  } catch(e) {}
}

window.addEventListener('firebase-ready', initFirebaseSync);
if (window.FirebaseDB) initFirebaseSync();

// Initialize
seedData();
autoRecoverLocalOrders();

// ===== FORMAT HELPERS =====
function formatPrice(price, lang = 'ar') {
  const settings = getSettings();
  const currency = lang === 'ar' ? settings.currency_ar : settings.currency_en;
  const formatted = price.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG');
  return lang === 'ar' ? `${formatted} ${currency}` : `${currency} ${formatted}`;
}

function formatDate(dateStr, lang = 'ar') {
  const date = new Date(dateStr);
  return date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatDateTime(dateStr, lang = 'ar') {
  const date = new Date(dateStr);
  return date.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getStatusColor(status) {
  const colors = {
    new: '#3498db',
    confirmed: '#9b59b6',
    preparing: '#f39c12',
    shipping: '#e67e22',
    delivered: '#2ecc71',
    cancelled: '#e74c3c'
  };
  return colors[status] || '#888';
}

function getStatusIcon(status) {
  const icons = {
    new: '<i class="ph ph-sparkle"></i>',
    confirmed: '<i class="ph ph-check-circle"></i>',
    preparing: '<i class="ph ph-package"></i>',
    shipping: '<i class="ph ph-truck"></i>',
    delivered: '<i class="ph ph-check-square"></i>',
    cancelled: '<i class="ph ph-x-circle"></i>'
  };
  return icons[status] || '•';
}

window.Store = {
  on, off, emit, getSettings, saveSettings, getProducts, getActiveProducts, getProduct, saveProduct, deleteProduct, getFeaturedProducts, getProductsByCategory, searchProducts, getDiscountedProducts, getProductPrice, getCategories, getActiveCategories, getCategory, saveCategory, deleteCategory, getCategoryProductCount, getCart, addToCart, removeFromCart, updateCartQuantity, clearCart, getCartTotal, getCartWithProducts, getOrders, getOrder, getOrderByNumber, createOrder, updateOrderStatus, deleteOrder, getOrderStats, getReviews, getApprovedReviews, getAllReviews, addReview, approveReview, deleteReview, adminLogin, isAdminLoggedIn, adminLogout, changeAdminPassword, getCoupons, getCoupon, saveCoupon, deleteCoupon, validateCoupon, seedData, resetAllData, formatPrice, formatDate, formatDateTime, getStatusColor, getStatusIcon, getCustomers, getCurrentCustomer, registerCustomer, loginCustomer, loginWithGoogle, logoutCustomer, getCustomerOrders, storeUndo, storeRedo, getWishlist, toggleWishlist, isInWishlist, getRecentlyViewed, addRecentlyViewed, getShippingCost, importBackup
};
