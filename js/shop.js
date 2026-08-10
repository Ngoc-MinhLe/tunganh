import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    doc, 
    setDoc, 
    getDoc,
    Timestamp 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // Config Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyDosCykP-rrTVAlwfAOXDGgGioxtt-VrOs",
        authDomain: "quanlykinhdoanh-cb2b1.firebaseapp.com",
        projectId: "quanlykinhdoanh-cb2b1",
        storageBucket: "quanlykinhdoanh-cb2b1.appspot.com",
        messagingSenderId: "478736931655",
        appId: "1:478736931655:web:b216ac919d9aeca334ca62"
    };

    if (!firebaseConfig.apiKey) {
        document.getElementById('shop-loader').innerHTML = `<p class="text-red-500 font-bold">Chưa có Cấu hình Firebase!</p>`;
        return;
    }

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const googleProvider = new GoogleAuthProvider();

    const storeId = "Mèo thần tài Lợn đất";
    let currentUser = null;
    let customerProfile = { phone: "", address: "" };

    let products = [];
    let inventory = [];
    let categories = [];
    let businessConfig = { fixedCost: 0, profitMargin: 20, storeAddress: '', storePhone: '' };
    let computedProducts = {}; // Bảng lưu thông tin chi tiết của SP sau khi tính giá/kho: { productId: { name, stock, price } }

    let cart = [];
    let productsLoaded = false;
    let inventoryLoaded = false;
    let configLoaded = false;
    let categoriesLoaded = false;
    let listenersStarted = false;
    let activeCategory = 'all'; 

    // --- DOM Elements ---
    const shopLoader = document.getElementById('shop-loader');
    const shopContent = document.getElementById('shop-content');
    const productGrid = document.getElementById('product-grid');
    
    // Auth UI
    const googleLoginBtn = document.getElementById('google-login-btn');
    const customerInfo = document.getElementById('customer-info');
    const customerAvatar = document.getElementById('customer-avatar');
    const logoutBtn = document.getElementById('logout-btn');
    const profileEditBtn = document.getElementById('profile-edit-btn');
    
    // Profile Modal
    const profileModal = document.getElementById('profile-modal');
    const profileForm = document.getElementById('profile-form');
    const profilePhone = document.getElementById('profile-phone');
    const profileAddress = document.getElementById('profile-address');
    const profileCloseBtn = document.getElementById('profile-close-btn');

    // Login Required Modal
    const loginRequiredModal = document.getElementById('login-required-modal');
    const loginModalGoogleBtn = document.getElementById('login-modal-google-btn');
    const loginModalCloseBtn = document.getElementById('login-modal-close-btn');

    // Cart UI
    const cartToggleBtn = document.getElementById('cart-toggle-btn');
    const cartCloseBtn = document.getElementById('cart-close-btn');
    const cartDrawer = document.getElementById('cart-drawer');
    const cartDrawerOverlay = document.getElementById('cart-drawer-overlay');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartCount = document.getElementById('cart-count');
    const cartTotalPrice = document.getElementById('cart-total-price');
    const cartLoginPrompt = document.getElementById('cart-login-prompt');
    const cartLoginBtn = document.getElementById('cart-login-btn');
    const checkoutForm = document.getElementById('checkout-form');
    
    const checkoutName = document.getElementById('checkout-name');
    const checkoutPhone = document.getElementById('checkout-phone');
    const checkoutAddress = document.getElementById('checkout-address');

    // Format tiền tệ Việt Nam
    const formatCurrency = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);

    // --- Authentication Logic ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            if (!user.isAnonymous) {
                // Đã đăng nhập bằng Google
                customerAvatar.src = user.photoURL || 'https://lh3.googleusercontent.com/a/default-user=s80-c';
                googleLoginBtn.classList.add('hidden');
                customerInfo.classList.remove('hidden');
                
                cartLoginPrompt.classList.add('hidden');
                checkoutForm.classList.remove('hidden');
                checkoutName.value = user.displayName || '';

                // Tải thông tin cá nhân khách hàng (địa chỉ, sđt) từ Firestore
                const profileRef = doc(db, `stores/${storeId}/customers`, user.uid);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    customerProfile = profileSnap.data();
                    checkoutPhone.value = customerProfile.phone || '';
                    checkoutAddress.value = customerProfile.address || '';
                    profilePhone.value = customerProfile.phone || '';
                    profileAddress.value = customerProfile.address || '';
                } else {
                    customerProfile = { phone: "", address: "" };
                }
            } else {
                // Đăng nhập ẩn danh (khách vãng lai chưa log Google)
                currentUser = null; // Coi như chưa đăng nhập để xử lý giao diện
                googleLoginBtn.classList.remove('hidden');
                customerInfo.classList.add('hidden');
                
                cartLoginPrompt.classList.remove('hidden');
                checkoutForm.classList.add('hidden');
                
                checkoutName.value = '';
                checkoutPhone.value = '';
                checkoutAddress.value = '';
                profilePhone.value = '';
                profileAddress.value = '';
            }
            
            // Bắt đầu đăng ký lắng nghe dữ liệu khi đã xác thực xong (ẩn danh hoặc Google)
            startListeningFirestore();
        } else {
            // Tự động đăng nhập ẩn danh khi chưa có phiên đăng nhập nào
            signInAnonymously(auth).catch(err => {
                console.error("Lỗi đăng nhập ẩn danh:", err);
                shopLoader.innerHTML = `<p class="text-red-500 font-bold">Không thể kết nối cơ sở dữ liệu. Vui lòng kiểm tra cấu hình Firebase hoặc rules.</p>`;
            });
        }
        updateCartDisplay();
    });

    // Login functions
    const loginGoogle = () => {
        signInWithPopup(auth, googleProvider)
            .then(() => {
                loginRequiredModal.classList.add('hidden');
            })
            .catch(err => {
                console.error("Lỗi đăng nhập Google:", err);
                alert("Đăng nhập thất bại, vui lòng thử lại.");
            });
    };

    googleLoginBtn.addEventListener('click', loginGoogle);
    loginModalGoogleBtn.addEventListener('click', loginGoogle);
    cartLoginBtn.addEventListener('click', loginGoogle);

    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            cart = [];
            updateCartDisplay();
            // Load lại trang để khởi tạo lại session ẩn danh sạch
            window.location.reload();
        });
    });

    // Profile Edit Modal toggle
    profileEditBtn.addEventListener('click', () => {
        profileModal.classList.remove('hidden');
    });
    profileCloseBtn.addEventListener('click', () => {
        profileModal.classList.add('hidden');
    });

    // Lưu thông tin hồ sơ
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user || user.isAnonymous) return;

        customerProfile = {
            name: user.displayName,
            email: user.email,
            phone: profilePhone.value.trim(),
            address: profileAddress.value.trim(),
            updatedAt: Timestamp.now()
        };

        try {
            const profileRef = doc(db, `stores/${storeId}/customers`, user.uid);
            await setDoc(profileRef, customerProfile, { merge: true });
            
            // Cập nhật lại form checkout
            checkoutPhone.value = customerProfile.phone;
            checkoutAddress.value = customerProfile.address;

            profileModal.classList.add('hidden');
            alert("Đã cập nhật thông tin thành công!");
        } catch (error) {
            console.error("Lỗi cập nhật thông tin:", error);
            alert("Lỗi: Không thể lưu thông tin.");
        }
    });

    // Modal Đăng nhập yêu cầu
    loginModalCloseBtn.addEventListener('click', () => {
        loginRequiredModal.classList.add('hidden');
    });

    // --- Giỏ Hàng Drawer Logic ---
    const toggleCart = (show) => {
        if (show) {
            cartDrawer.classList.remove('translate-x-full');
            cartDrawer.classList.add('translate-x-0');
            cartDrawerOverlay.classList.remove('hidden');
        } else {
            cartDrawer.classList.remove('translate-x-0');
            cartDrawer.classList.add('translate-x-full');
            cartDrawerOverlay.classList.add('hidden');
        }
    };

    cartToggleBtn.addEventListener('click', () => toggleCart(true));
    cartCloseBtn.addEventListener('click', () => toggleCart(false));
    cartDrawerOverlay.addEventListener('click', () => toggleCart(false));

    // --- Tải Sản Phẩm từ Firestore ---

    function checkAllLoaded() {
        if (productsLoaded && inventoryLoaded && configLoaded && categoriesLoaded) {
            computeStorefrontProducts();
            renderCategoryFilters();
            shopLoader.classList.add('hidden');
            shopContent.classList.remove('hidden');
            updateStoreContactInfo();
        }
    }

    function startListeningFirestore() {
        if (listenersStarted) return;
        listenersStarted = true;

        // 1. Lắng nghe products
        onSnapshot(collection(db, `stores/${storeId}/products`), (snapshot) => {
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            productsLoaded = true;
            checkAllLoaded();
        }, (error) => {
            console.error("Lỗi lắng nghe products:", error);
            shopLoader.innerHTML = `<p class="text-red-500 font-bold">Lỗi truy cập dữ liệu (Permission Denied). Vui lòng cấu hình Firestore rules.</p>`;
        });

        // 2. Lắng nghe inventoryBatches
        onSnapshot(collection(db, `stores/${storeId}/inventoryBatches`), (snapshot) => {
            inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            inventoryLoaded = true;
            checkAllLoaded();
        }, (error) => console.error("Lỗi lắng nghe inventory:", error));

        // 3. Lắng nghe config
        onSnapshot(doc(db, `stores/${storeId}/config/business`), (snapshot) => {
            if (snapshot.exists()) {
                businessConfig = snapshot.data();
            }
            configLoaded = true;
            checkAllLoaded();
        }, (error) => console.error("Lỗi cấu hình business:", error));

        // 4. Lắng nghe categories
        onSnapshot(collection(db, `stores/${storeId}/categories`), (snapshot) => {
            categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            categories.sort((a,b) => a.createdAt.seconds - b.createdAt.seconds);
            categoriesLoaded = true;
            checkAllLoaded();
        }, (error) => console.error("Lỗi lắng nghe categories:", error));
    }

    // Tính giá bán lẻ & tổng số lượng tồn kho từng SP
    function computeStorefrontProducts() {
        computedProducts = {};
        
        products.forEach(prod => {
            // Lọc các lô nhập kho còn hàng của sản phẩm
            const productBatches = inventory.filter(item => item.productId === prod.id && item.remainingQuantity > 0);
            const totalStock = productBatches.reduce((sum, item) => sum + item.remainingQuantity, 0);

            // Tính giá bán lẻ gợi ý (Giá vốn TB * (1 + margin / 100))
            let retailPrice = 0;
            if (productBatches.length > 0) {
                const totalValue = productBatches.reduce((sum, batch) => sum + (batch.remainingQuantity * batch.purchasePrice), 0);
                const averageCost = totalValue / totalStock;
                retailPrice = Math.round(averageCost * (1 + ((businessConfig.profitMargin || 20) / 100)));
            } else {
                // Lấy giá nhập từ lô hàng cũ nhất đã bán hết nếu có
                const oldBatches = inventory.filter(item => item.productId === prod.id);
                if (oldBatches.length > 0) {
                    oldBatches.sort((a,b) => b.purchaseDate.seconds - a.purchaseDate.seconds);
                    retailPrice = Math.round(oldBatches[0].purchasePrice * (1 + ((businessConfig.profitMargin || 20) / 100)));
                } else {
                    retailPrice = 0; // Chưa nhập kho bao giờ
                }
            }

            computedProducts[prod.id] = {
                id: prod.id,
                name: prod.name,
                category: prod.category || 'Khác',
                imageUrl: prod.imageUrl || '',
                stock: totalStock,
                price: retailPrice
            };
        });

        renderProductGrid();
    }

    // Render lưới sản phẩm
    function renderProductGrid() {
        productGrid.innerHTML = '';
        let items = Object.values(computedProducts);
        
        // Lọc sản phẩm theo phân loại được chọn
        if (activeCategory !== 'all') {
            items = items.filter(p => p.category === activeCategory);
        }

        if (items.length === 0) {
            productGrid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-12">Không có sản phẩm nào thuộc phân loại này.</div>';
            return;
        }

        items.forEach(prod => {
            const card = document.createElement('div');
            card.className = 'product-card bg-slate-800 rounded-xl overflow-hidden shadow-lg border border-slate-700/80 flex flex-col justify-between';
            
            const isOutOfStock = prod.stock <= 0;
            const priceDisplay = prod.price > 0 ? formatCurrency(prod.price) : 'Liên hệ';

            // Ảnh thực tế hoặc icon 🐷 mặc định
            const imageHtml = prod.imageUrl ? 
                `<img src="${prod.imageUrl}" alt="${prod.name}" class="w-full h-full object-cover select-none">` : 
                `<span class="text-7xl select-none">🐷</span>`;

            card.innerHTML = `
                <!-- Hình ảnh sản phẩm -->
                <div class="relative bg-slate-700/50 aspect-square flex items-center justify-center overflow-hidden">
                    ${imageHtml}
                    ${isOutOfStock ? `
                        <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <span class="bg-red-600 text-white font-bold text-xs uppercase py-1 px-3 rounded-full">Hết hàng</span>
                        </div>
                    ` : ''}
                </div>
                <!-- Nội dung card -->
                <div class="p-5 flex-grow flex flex-col justify-between gap-4">
                    <div>
                        <h3 class="font-bold text-white text-base line-clamp-2" title="${prod.name}">${prod.name}</h3>
                        <p class="text-xs text-slate-400 mt-1">Còn lại: <span class="font-bold text-slate-300 font-mono">${prod.stock}</span> chiếc</p>
                    </div>
                    <div class="flex items-center justify-between mt-auto">
                        <span class="text-amber-400 font-bold text-lg font-mono">${priceDisplay}</span>
                        <button data-id="${prod.id}" class="add-to-cart-btn bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center gap-1 transition-colors disabled:bg-slate-700 disabled:text-slate-500" ${isOutOfStock ? 'disabled' : ''}>
                            <i data-lucide="plus" class="w-4 h-4"></i> Mua
                        </button>
                    </div>
                </div>
            `;
            productGrid.appendChild(card);
        });

        lucide.createIcons();

        // Gán sự kiện click cho các nút "Mua"
        document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.currentTarget.dataset.id;
                addToCart(productId);
            });
        });
    }

    // Vẽ thanh bộ lọc danh mục
    function renderCategoryFilters() {
        const container = document.getElementById('category-filters-container');
        if (!container) return;
        container.innerHTML = '';

        // Nút lọc "Tất cả" mặc định
        const allBtn = document.createElement('button');
        allBtn.className = `px-4 py-2 rounded-full text-xs font-bold transition-all border ${
            activeCategory === 'all' 
                ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-500/20' 
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
        }`;
        allBtn.textContent = 'Tất cả';
        allBtn.addEventListener('click', () => {
            activeCategory = 'all';
            renderCategoryFilters();
            renderProductGrid();
        });
        container.appendChild(allBtn);

        // Nút lọc cho các danh mục load động từ Firestore
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                activeCategory === cat.name 
                    ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-500/20' 
                    : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
            }`;
            btn.textContent = cat.name;
            btn.addEventListener('click', () => {
                activeCategory = cat.name;
                renderCategoryFilters();
                renderProductGrid();
            });
            container.appendChild(btn);
        });
    }

    // Cập nhật thông tin liên hệ của cửa hàng
    function updateStoreContactInfo() {
        const container = document.getElementById('store-contact-info-container');
        if (container) {
            container.innerHTML = ''; // Xóa nội dung cũ

            if (businessConfig.storeAddress) {
                container.innerHTML += `
                    <div class="flex items-center gap-2">
                        <i data-lucide="map-pin" class="w-4 h-4 text-slate-400"></i>
                        <span>${businessConfig.storeAddress}</span>
                    </div>`;
            }
            if (businessConfig.storePhone) {
                container.innerHTML += `
                    <div class="flex items-center gap-2">
                        <i data-lucide="phone" class="w-4 h-4 text-slate-400"></i>
                        <span>SĐT: ${businessConfig.storePhone}</span>
                    </div>`;
            }
            lucide.createIcons();
        }
    }

    // --- Nghiệp Vụ Giỏ Hàng ---
    function addToCart(productId) {
        if (!currentUser) {
            // Hiển thị modal nhắc nhở đăng nhập Google
            loginRequiredModal.classList.remove('hidden');
            return;
        }

        const prodInfo = computedProducts[productId];
        if (!prodInfo || prodInfo.stock <= 0) return;

        const cartItem = cart.find(item => item.productId === productId);
        if (cartItem) {
            if (cartItem.quantity >= prodInfo.stock) {
                alert(`Xin lỗi! Không thể thêm thêm vì đã đạt số lượng tồn kho tối đa (${prodInfo.stock} chiếc).`);
                return;
            }
            cartItem.quantity++;
        } else {
            cart.push({
                productId: productId,
                name: prodInfo.name,
                quantity: 1,
                price: prodInfo.price
            });
        }

        updateCartDisplay();
        toggleCart(true); // Tự động mở giỏ hàng khi thêm sản phẩm thành công
    }

    function removeFromCart(productId) {
        cart = cart.filter(item => item.productId !== productId);
        updateCartDisplay();
    }

    function changeQuantity(productId, newQty) {
        const prodInfo = computedProducts[productId];
        const cartItem = cart.find(item => item.productId === productId);
        if (!cartItem || !prodInfo) return;

        if (newQty <= 0) {
            removeFromCart(productId);
            return;
        }

        if (newQty > prodInfo.stock) {
            alert(`Xin lỗi! Số lượng trong kho chỉ còn tối đa ${prodInfo.stock} sản phẩm.`);
            cartItem.quantity = prodInfo.stock;
        } else {
            cartItem.quantity = newQty;
        }
        updateCartDisplay();
    }

    // Cập nhật giao diện giỏ hàng
    function updateCartDisplay() {
        cartItemsContainer.innerHTML = '';
        
        const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cart.reduce((sum, item) => sum + (item.quantity * item.price), 0);

        if (totalItemsCount > 0) {
            cartCount.textContent = totalItemsCount;
            cartCount.classList.remove('hidden');
        } else {
            cartCount.classList.add('hidden');
        }

        cartTotalPrice.textContent = formatCurrency(totalPrice);

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
                    <i data-lucide="shopping-bag" class="w-12 h-12 text-slate-600"></i>
                    <p class="text-sm">Giỏ hàng của bạn còn trống.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        cart.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex items-center justify-between bg-slate-800 p-4 rounded-xl border border-slate-700/60';
            itemDiv.innerHTML = `
                <div class="flex-grow pr-4">
                    <h4 class="font-bold text-white text-sm line-clamp-1">${item.name}</h4>
                    <span class="text-xs text-amber-400 font-bold font-mono">${formatCurrency(item.price)}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="flex items-center border border-slate-650 bg-slate-750 rounded-lg">
                        <button class="qty-minus-btn px-2 py-1 text-slate-400 hover:text-white transition-colors" data-id="${item.productId}">-</button>
                        <span class="text-sm font-bold w-6 text-center font-mono">${item.quantity}</span>
                        <button class="qty-plus-btn px-2 py-1 text-slate-400 hover:text-white transition-colors" data-id="${item.productId}">+</button>
                    </div>
                    <button class="cart-remove-btn text-slate-500 hover:text-red-500 p-1" data-id="${item.productId}">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>
            `;
            cartItemsContainer.appendChild(itemDiv);
        });

        lucide.createIcons();

        // Gán sự kiện cho giỏ hàng
        document.querySelectorAll('.qty-minus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const item = cart.find(x => x.productId === id);
                if (item) changeQuantity(id, item.quantity - 1);
            });
        });

        document.querySelectorAll('.qty-plus-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const item = cart.find(x => x.productId === id);
                if (item) changeQuantity(id, item.quantity + 1);
            });
        });

        document.querySelectorAll('.cart-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                removeFromCart(id);
            });
        });
    }

    // --- Xác Nhận Đặt Hàng ---
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || cart.length === 0) return;

        const name = checkoutName.value.trim();
        const phone = checkoutPhone.value.trim();
        const address = checkoutAddress.value.trim();

        if (!name || !phone || !address) {
            alert("Vui lòng nhập đầy đủ thông tin giao hàng!");
            return;
        }

        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;

        const orderData = {
            customerId: currentUser.uid,
            customerName: name,
            customerEmail: currentUser.email,
            customerPhone: phone,
            customerAddress: address,
            items: cart,
            totalAmount: cart.reduce((sum, item) => sum + (item.quantity * item.price), 0),
            status: "pending", // Đơn hàng chờ duyệt
            createdAt: Timestamp.now()
        };

        try {
            // 1. Tạo đơn hàng trong Firestore
            await addDoc(collection(db, `stores/${storeId}/orders`), orderData);
            
            // 2. Lưu lại hồ sơ tự động cho khách hàng
            const profileRef = doc(db, `stores/${storeId}/customers`, currentUser.uid);
            await setDoc(profileRef, {
                phone: phone,
                address: address,
                name: name,
                email: currentUser.email,
                updatedAt: Timestamp.now()
            }, { merge: true });

            // Reset giỏ hàng
            cart = [];
            updateCartDisplay();
            toggleCart(false);
            
            alert("Đặt hàng thành công! Đơn hàng của bạn đang chờ quản lý duyệt và liên hệ giao hàng.");
        } catch (error) {
            console.error("Lỗi khi đặt hàng:", error);
            alert("Đã xảy ra lỗi khi tạo đơn hàng. Vui lòng thử lại.");
        } finally {
            button.disabled = false;
        }
    });
});
