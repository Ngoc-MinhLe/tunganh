import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    writeBatch,
    doc,
    Timestamp,
    where,
    getDocs,
    updateDoc,
    deleteDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // Cấu hình Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyDosCykP-rrTVAlwfAOXDGgGioxtt-VrOs",
        authDomain: "quanlykinhdoanh-cb2b1.firebaseapp.com",
        projectId: "quanlykinhdoanh-cb2b1",
        storageBucket: "quanlykinhdoanh-cb2b1.appspot.com",
        messagingSenderId: "478736931655",
        appId: "1:478736931655:web:b216ac919d9aeca334ca62"
    };

    if (!firebaseConfig.apiKey) {
        document.getElementById('loader').innerHTML = `<div class="text-center text-red-500 font-bold">Chưa có Cấu hình Firebase!</div>`;
        return;
    }

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    const storeId = "Mèo thần tài Lợn đất";
    const ADMIN_EMAIL = "admin@gmail.com"; // Email quản trị viên mặc định

    let products = [];
    let inventory = [];
    let sales = [];
    let orders = [];
    let categories = [];
    let businessConfig = { fixedCost: 0, profitMargin: 20 };
    
    let unsubscribeProducts, unsubscribeInventory, unsubscribeSales, unsubscribeConfig, unsubscribeOrders, unsubscribeCategories;
    let salesChart = null;
    let statsFilterValue = 'all'; 

    // --- DOM Elements ---
    const adminLoginContainer = document.getElementById('admin-login-container');
    const adminDashboardContainer = document.getElementById('admin-dashboard-container');
    const adminLoginForm = document.getElementById('admin-login-form');
    const adminEmailInput = document.getElementById('admin-email');
    const adminPasswordInput = document.getElementById('admin-password');
    const adminLogoutBtn = document.getElementById('admin-logout-btn');

    const loader = document.getElementById('loader');
    const mainContent = document.getElementById('main-content');
    const editProductModal = document.getElementById('edit-product-modal');
    const deleteProductModal = document.getElementById('delete-product-modal');
    const editInventoryModal = document.getElementById('edit-inventory-modal');
    const editSaleModal = document.getElementById('edit-sale-modal');
    const deleteSaleModal = document.getElementById('delete-sale-modal');
    const ordersListContainer = document.getElementById('orders-list-container');

    const formatCurrency = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
        return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
    };
    const dateToIso = (date) => date.toISOString().split('T')[0];

    // --- 1. Quản lý Authentication Quản Trị ---
    onAuthStateChanged(auth, (user) => {
        if (user && user.email === ADMIN_EMAIL) {
            // Đúng tài khoản admin -> Vào dashboard
            adminLoginContainer.classList.add('hidden');
            adminDashboardContainer.classList.remove('hidden');
            initializeDashboardData();
        } else {
            // Chưa đăng nhập hoặc sai tài khoản -> Trở lại màn hình login
            if (user) signOut(auth); // Log out nếu đăng nhập tài khoản khác
            adminLoginContainer.classList.remove('hidden');
            adminDashboardContainer.classList.add('hidden');
            cleanupSubscriptions();
        }
    });

    // Login Form Submit
    adminLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = adminEmailInput.value.trim();
        const password = adminPasswordInput.value;

        if (email !== ADMIN_EMAIL) {
            alert("Email không chính xác! Hãy sử dụng email admin@gmail.com.");
            return;
        }

        const button = e.target.querySelector('button');
        button.disabled = true;

        signInWithEmailAndPassword(auth, email, password)
            .catch(err => {
                console.error("Lỗi đăng nhập:", err);
                alert("Mật khẩu không chính xác hoặc tài khoản chưa được khởi tạo!");
            })
            .finally(() => {
                button.disabled = false;
            });
    });

    // Logout Button
    adminLogoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            alert("Đã đăng xuất khỏi trang quản trị.");
        });
    });

    function cleanupSubscriptions() {
        if (unsubscribeProducts) unsubscribeProducts();
        if (unsubscribeInventory) unsubscribeInventory();
        if (unsubscribeSales) unsubscribeSales();
        if (unsubscribeConfig) unsubscribeConfig();
        if (unsubscribeOrders) unsubscribeOrders();
        if (unsubscribeCategories) unsubscribeCategories();
    }

    // --- 2. Khởi tạo Bảng điều khiển Quản lý ---
    function initializeDashboardData() {
        setDefaultDates(); 
        initializeTabs();
        initializeReportFilters();
        
        // Khởi tạo Custom Searchable Selects cho tab Bán Tại Quầy và Nhập Kho
        setupSearchableSelect('sale-product-search', 'sale-product-dropdown', 'sale-product-select', () => {
            updateSaleFormAvailability();
        });
        setupSearchableSelect('inventory-product-search', 'inventory-product-dropdown', 'inventory-product-select');

        const monthPicker = document.getElementById('stats-month-picker');
        const allTimeBtn = document.getElementById('stats-all-time-btn');

        const now = new Date();
        const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        monthPicker.value = currentMonthISO;
        statsFilterValue = currentMonthISO; 

        monthPicker.addEventListener('change', (e) => {
            statsFilterValue = e.target.value;
            updateStats();
        });

        allTimeBtn.addEventListener('click', () => {
            statsFilterValue = 'all';
            monthPicker.value = ''; 
            updateStats();
        });

        // Đăng ký listeners
        const configRef = doc(db, `stores/${storeId}/config/business`);
        unsubscribeConfig = onSnapshot(configRef, (doc) => {
            if (doc.exists()) {
                businessConfig = doc.data();
                document.getElementById('setting-fixed-cost').value = businessConfig.fixedCost || '';
                document.getElementById('setting-profit-margin').value = businessConfig.profitMargin || '';
            }
            updateStats();
            calculateSuggestedPrice();
        });

        const productsQuery = query(collection(db, `stores/${storeId}/products`));
        unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
            products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            products.sort((a,b) => a.createdAt.seconds - b.createdAt.seconds);
            renderAll();
        }, (error) => console.error("Lỗi lắng nghe products:", error));

        const inventoryQuery = query(collection(db, `stores/${storeId}/inventoryBatches`));
        unsubscribeInventory = onSnapshot(inventoryQuery, (snapshot) => {
            inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAll();
        }, (error) => console.error("Lỗi lắng nghe inventory:", error));

        const salesQuery = query(collection(db, `stores/${storeId}/sales`));
        unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
            sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAll();
        }, (error) => console.error("Lỗi lắng nghe sales:", error));

        // Lắng nghe Đơn Hàng từ khách hàng
        const ordersQuery = query(collection(db, `stores/${storeId}/orders`));
        unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
            orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderOrdersList();
        }, (error) => console.error("Lỗi lắng nghe orders:", error));

        // Lắng nghe Phân loại (Categories)
        const categoriesQuery = query(collection(db, `stores/${storeId}/categories`));
        unsubscribeCategories = onSnapshot(categoriesQuery, async (snapshot) => {
            if (snapshot.empty) {
                // Tự động seed 3 danh mục mặc định ban đầu nếu trống
                const seedCategories = ['Lợn đất', 'Mèo thần tài', 'Khác'];
                const batch = writeBatch(db);
                seedCategories.forEach(name => {
                    batch.set(doc(db, `stores/${storeId}/categories`, name), {
                        name: name,
                        createdAt: Timestamp.now()
                    });
                });
                await batch.commit();
                return;
            }

            categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            categories.sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
            
            updateCategoryDropdowns();
            renderCategoryList();
            renderAll(); 
        }, (error) => console.error("Lỗi lắng nghe categories:", error));

        // Khởi tạo upload ảnh
        setupImageUpload('product-image-file', 'product-image-upload-btn', 'product-image-url', 'product-image-preview-container', 'product-image-preview');
        setupImageUpload('edit-product-image-file', 'edit-product-image-upload-btn', 'edit-product-image-url', 'edit-product-image-preview-container', 'edit-product-image-preview');

        // Sự kiện thêm danh mục mới
        document.getElementById('add-category-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('category-name');
            const feedbackEl = document.getElementById('category-feedback');
            const categoryName = nameInput.value.trim();

            feedbackEl.textContent = '';
            if (!categoryName) return;

            const isDuplicate = categories.some(c => c.name.toLowerCase() === categoryName.toLowerCase());
            if (isDuplicate) {
                feedbackEl.textContent = `Danh mục "${categoryName}" đã tồn tại.`;
                feedbackEl.className = 'text-yellow-400 text-xs mt-1';
                return;
            }

            const button = e.target.querySelector('button');
            button.disabled = true;
            try {
                await setDoc(doc(db, `stores/${storeId}/categories`, categoryName), {
                    name: categoryName,
                    createdAt: Timestamp.now()
                });
                nameInput.value = '';
                feedbackEl.textContent = 'Thêm thành công!';
                feedbackEl.className = 'text-green-400 text-xs mt-1';
                setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
            } catch (error) {
                console.error("Lỗi thêm danh mục:", error);
                feedbackEl.textContent = 'Lỗi thêm danh mục.';
                feedbackEl.className = 'text-red-400 text-xs mt-1';
            } finally {
                button.disabled = false;
            }
        });

        loader.classList.add('hidden');
        mainContent.classList.remove('hidden');
    }

    // --- Searchable Select Helper ---
    function removeVietnameseTones(str) {
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
        str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
        str = str.replace(/đ/g,"d");
        str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
        str = str.replace(/È|É|Ẹ|Ẻ|E|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
        str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
        str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
        str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
        str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
        str = str.replace(/Đ/g, "D");
        str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
        str = str.replace(/\u02C6|\u0306|\u031B/g, "");
        return str;
    }

    function setupSearchableSelect(searchInputId, dropdownId, hiddenSelectId, onChangeCallback) {
        const searchInput = document.getElementById(searchInputId);
        const dropdown = document.getElementById(dropdownId);
        const hiddenSelect = document.getElementById(hiddenSelectId);

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        searchInput.addEventListener('focus', () => {
            renderDropdown(searchInput.value);
        });

        searchInput.addEventListener('input', () => {
            renderDropdown(searchInput.value);
        });

        function renderDropdown(filterText = '') {
            dropdown.innerHTML = '';
            const cleanFilter = removeVietnameseTones(filterText.toLowerCase().trim());
            
            const filteredProducts = products.filter(p => {
                const cleanName = removeVietnameseTones(p.name.toLowerCase());
                return cleanName.includes(cleanFilter);
            });

            if (filteredProducts.length === 0) {
                const li = document.createElement('li');
                li.className = 'p-3 text-slate-400 text-sm text-center';
                li.textContent = 'Không tìm thấy sản phẩm';
                dropdown.appendChild(li);
            } else {
                filteredProducts.forEach(p => {
                    const li = document.createElement('li');
                    li.className = 'p-3 hover:bg-slate-700 cursor-pointer text-white text-sm transition-colors border-b border-slate-700/50 last:border-0';
                    li.textContent = p.name;
                    li.addEventListener('click', () => {
                        searchInput.value = p.name;
                        hiddenSelect.value = p.id;
                        dropdown.classList.add('hidden');
                        if (onChangeCallback) onChangeCallback();
                    });
                    dropdown.appendChild(li);
                });
            }
            dropdown.classList.remove('hidden');
        }
    }

    // --- 3. Quản lý Đơn Đặt Hàng Trực Tuyến ---
    function renderOrdersList() {
        ordersListContainer.innerHTML = '';
        
        // Sắp xếp đơn hàng mới nhất lên trước
        orders.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        
        if (orders.length === 0) {
            ordersListContainer.innerHTML = '<p class="text-slate-400 text-center py-6">Chưa có đơn đặt hàng nào.</p>';
            return;
        }

        orders.forEach(ord => {
            const card = document.createElement('div');
            card.className = 'bg-slate-700/50 p-6 rounded-xl border border-slate-600/40 shadow-md space-y-4';
            
            let statusBadge = '';
            let actionButtons = '';
            
            if (ord.status === 'pending') {
                statusBadge = `<span class="bg-amber-600/30 text-amber-400 border border-amber-500/20 text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i> Chờ duyệt</span>`;
                actionButtons = `
                    <div class="flex gap-2">
                        <button class="approve-order-btn bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1 transition-colors" data-id="${ord.id}">
                            <i data-lucide="check" class="w-4 h-4"></i> Duyệt Đơn
                        </button>
                        <button class="cancel-order-btn bg-slate-600 hover:bg-slate-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-1 transition-colors" data-id="${ord.id}">
                            <i data-lucide="ban" class="w-4 h-4"></i> Hủy Đơn
                        </button>
                    </div>
                `;
            } else if (ord.status === 'approved') {
                statusBadge = `<span class="bg-green-600/30 text-green-400 border border-green-500/20 text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Đã duyệt</span>`;
            } else {
                statusBadge = `<span class="bg-slate-650 text-slate-400 border border-slate-600/30 text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1"><i data-lucide="slash" class="w-3.5 h-3.5"></i> Đã hủy</span>`;
            }

            let itemsTable = `
                <table class="w-full text-left text-xs text-slate-300">
                    <thead>
                        <tr class="border-b border-slate-650 text-slate-400">
                            <th class="pb-2">Tên sản phẩm</th>
                            <th class="pb-2 text-right">SL</th>
                            <th class="pb-2 text-right">Đơn giá</th>
                            <th class="pb-2 text-right">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            ord.items.forEach(item => {
                itemsTable += `
                    <tr class="border-b border-slate-700/30 last:border-0">
                        <td class="py-2">${item.name}</td>
                        <td class="py-2 text-right font-mono">${item.quantity}</td>
                        <td class="py-2 text-right font-mono">${formatCurrency(item.price)}</td>
                        <td class="py-2 text-right font-mono text-cyan-400">${formatCurrency(item.quantity * item.price)}</td>
                    </tr>
                `;
            });
            itemsTable += `
                    </tbody>
                </table>
            `;

            card.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-600/30 pb-3">
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-white text-base">Khách hàng: ${ord.customerName}</h4>
                            ${statusBadge}
                        </div>
                        <p class="text-xs text-slate-400 mt-1">Ngày đặt: ${formatDate(ord.createdAt)}</p>
                    </div>
                    ${actionButtons}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <p class="text-xs text-slate-400">Thông tin liên hệ & Giao nhận:</p>
                        <p class="mt-1"><strong class="text-slate-300">SĐT:</strong> ${ord.customerPhone}</p>
                        <p class="mt-1"><strong class="text-slate-300">Địa chỉ:</strong> ${ord.customerAddress}</p>
                    </div>
                    <div class="bg-slate-800/40 p-4 rounded-lg border border-slate-700/40">
                        <p class="text-xs text-slate-400 mb-2">Chi tiết mặt hàng:</p>
                        ${itemsTable}
                        <div class="flex justify-between items-center mt-3 pt-2 border-t border-slate-650 font-bold text-white">
                            <span>Tổng thanh toán:</span>
                            <span class="text-amber-400 font-mono text-base">${formatCurrency(ord.totalAmount)}</span>
                        </div>
                    </div>
                </div>
            `;
            ordersListContainer.appendChild(card);
        });

        lucide.createIcons();

        // Gán sự kiện cho các nút duyệt/hủy đơn hàng
        document.querySelectorAll('.approve-order-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const orderData = orders.find(x => x.id === id);
                if (confirm(`Xác nhận duyệt đơn hàng của "${orderData.customerName}"?\nHành động này sẽ trừ kho FIFO và lưu hóa đơn doanh số.`)) {
                    e.currentTarget.disabled = true;
                    try {
                        await processApproveOrder(id, orderData);
                        alert("Đã duyệt và trừ kho thành công!");
                    } catch (err) {
                        console.error("Lỗi duyệt đơn hàng:", err);
                        alert("Duyệt thất bại: " + err.message);
                        e.currentTarget.disabled = false;
                    }
                }
            });
        });

        document.querySelectorAll('.cancel-order-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                const orderData = orders.find(x => x.id === id);
                if (confirm(`Bạn có chắc chắn muốn HỦY đơn hàng của "${orderData.customerName}"?`)) {
                    e.currentTarget.disabled = true;
                    try {
                        const orderRef = doc(db, `stores/${storeId}/orders`, id);
                        await updateDoc(orderRef, { status: "cancelled" });
                        alert("Đã hủy đơn hàng thành công!");
                    } catch (err) {
                        console.error("Lỗi hủy đơn hàng:", err);
                        alert("Hủy đơn thất bại.");
                        e.currentTarget.disabled = false;
                    }
                }
            });
        });
    }

    // Xử lý trừ kho FIFO & Ghi nhận hóa đơn bán hàng cho đơn đặt hàng
    async function processApproveOrder(orderId, orderData) {
        const batch = writeBatch(db);

        // Duyệt qua từng sản phẩm trong đơn để kiểm kho và trừ kho
        for (const item of orderData.items) {
            const productId = item.productId;
            const quantityToSell = item.quantity;
            const sellingPrice = item.price;

            // 1. Kiểm tra số lượng tồn kho khả dụng
            const productInventoryBatches = inventory.filter(b => b.productId === productId && b.remainingQuantity > 0);
            const totalStock = productInventoryBatches.reduce((sum, b) => sum + b.remainingQuantity, 0);

            if (totalStock < quantityToSell) {
                throw new Error(`Sản phẩm "${item.name}" không đủ hàng trong kho! Cần: ${quantityToSell}, Tồn: ${totalStock}.`);
            }

            // 2. Tính toán giá vốn FIFO
            const fifoBatchesForSale = [...productInventoryBatches].sort((a, b) => a.purchaseDate.seconds - b.purchaseDate.seconds);
            let remainingToCalcCost = quantityToSell;
            let actualTotalCostOfGoodsSold = 0;
            for (const invBatch of fifoBatchesForSale) {
                if (remainingToCalcCost <= 0) break;
                const qtyFromThisBatch = Math.min(remainingToCalcCost, invBatch.remainingQuantity);
                actualTotalCostOfGoodsSold += qtyFromThisBatch * invBatch.purchasePrice;
                remainingToCalcCost -= qtyFromThisBatch;
            }
            const actualCogsPerItem = actualTotalCostOfGoodsSold / quantityToSell;

            // 3. Tiến hành trừ kho các lô tương ứng
            let remainingToSell = quantityToSell;
            for (const invBatch of fifoBatchesForSale) {
                if (remainingToSell <= 0) break;
                const quantityFromThisBatch = Math.min(remainingToSell, invBatch.remainingQuantity);
                const newRemainingQuantity = invBatch.remainingQuantity - quantityFromThisBatch;
                const batchDocRef = doc(db, `stores/${storeId}/inventoryBatches`, invBatch.id);
                batch.update(batchDocRef, { remainingQuantity: newRemainingQuantity });
                remainingToSell -= quantityFromThisBatch;
            }

            // 4. Tạo bản ghi hóa đơn bán hàng (`sales`)
            const totalRevenue = quantityToSell * sellingPrice;
            const profit = totalRevenue - actualTotalCostOfGoodsSold;
            const newSaleRef = doc(collection(db, `stores/${storeId}/sales`));

            batch.set(newSaleRef, {
                productId: productId,
                productName: item.name,
                quantitySold: quantityToSell,
                sellingPrice: sellingPrice,
                totalRevenue: totalRevenue,
                totalCostOfGoodsSold: actualTotalCostOfGoodsSold,
                cogsPerItem: actualCogsPerItem,
                profit: profit,
                saleDate: Timestamp.now(), // Ngày duyệt đơn là ngày ghi nhận doanh thu
                orderId: orderId
            });
        }

        // 5. Cập nhật trạng thái đơn hàng trực tuyến sang đã duyệt (approved)
        const orderRef = doc(db, `stores/${storeId}/orders`, orderId);
        batch.update(orderRef, { status: "approved" });

        return batch.commit();
    }

    // --- 4. Logic Quản Lý Kho & Nghiệp vụ Quầy (Giữ nguyên từ code cũ) ---
    const formatDateOnly = (timestamp) => timestamp ? new Date(timestamp.seconds * 1000).toLocaleDateString('vi-VN') : 'N/A';
    
    function setDefaultDates() {
        const today = dateToIso(new Date());
        document.getElementById('inventory-date').value = today;
        document.getElementById('sale-date').value = today;
        document.getElementById('report-end-date').value = today;
        const startOfMonth = new Date(new Date().setDate(1));
        document.getElementById('report-start-date').value = dateToIso(startOfMonth);
    }

    function filterAndRenderReports() {
        const startDateInput = document.getElementById('report-start-date').value;
        const endDateInput = document.getElementById('report-end-date').value;
        if (!startDateInput || !endDateInput) return;

        const startDate = new Date(startDateInput);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(endDateInput);
        endDate.setHours(23, 59, 59, 999);

        const filteredSales = sales.filter(sale => {
            const saleDate = sale.saleDate.toDate();
            return saleDate >= startDate && saleDate <= endDate;
        });
        
        renderSalesDetails(filteredSales);
        renderDailyProfit(filteredSales);
        renderChart(filteredSales);

        const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);
        const filteredProfitEl = document.getElementById('filtered-profit-display');
        filteredProfitEl.textContent = formatCurrency(totalProfit);
        filteredProfitEl.classList.toggle('text-red-400', totalProfit < 0);
        filteredProfitEl.classList.toggle('text-green-400', totalProfit >= 0);
    }

    function updateStats() {
        const filter = statsFilterValue;
        let filteredSales = sales;

        if (filter !== 'all' && filter) {
            const [year, month] = filter.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);
            endDate.setHours(23, 59, 59, 999);
            filteredSales = sales.filter(s => {
                const saleDate = s.saleDate.toDate();
                return saleDate >= startDate && saleDate <= endDate;
            });
        }
        
        renderStats(filteredSales, filter);
        renderDailyProfit(filteredSales);
        renderChart(filteredSales);

        const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);
        const filteredProfitEl = document.getElementById('filtered-profit-display');
        if (filteredProfitEl) {
            filteredProfitEl.textContent = formatCurrency(totalProfit);
            filteredProfitEl.classList.toggle('text-red-400', totalProfit < 0);
            filteredProfitEl.classList.toggle('text-green-400', totalProfit >= 0);
        }
    }

    function renderAll() {
        renderProductList();
        renderProductSelects();
        renderInventoryDetails();
        filterAndRenderReports(); 
        updateStats();
        updateSaleFormAvailability();
    }
    
    function renderProductList() {
        const container = document.getElementById('product-list-container');
        container.innerHTML = '';
        
        // Tự động phân loại các sản phẩm cũ chưa có phân loại
        autoMigrateExistingData();

        if (products.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-center py-4">Chưa có sản phẩm nào.</p>';
        } else {
            products.forEach(p => {
                const productEl = document.createElement('div');
                productEl.className = 'flex flex-col sm:flex-row sm:items-center justify-between bg-slate-700/40 p-4 rounded-xl border border-slate-700/60 shadow-sm gap-3';
                
                // Hiển thị ảnh nhỏ hoặc 🐷
                const imageHtml = p.imageUrl ? 
                    `<img src="${p.imageUrl}" alt="${p.name}" class="w-10 h-10 object-cover rounded-lg border border-slate-650">` : 
                    `<span class="text-2xl bg-slate-850 w-10 h-10 rounded-lg flex items-center justify-center select-none">🐷</span>`;
                
                // Xây dựng danh sách phân loại để chuyển nhanh
                let categoryOptions = '';
                categories.forEach(cat => {
                    categoryOptions += `<option value="${cat.name}" ${p.category === cat.name ? 'selected' : ''}>${cat.name}</option>`;
                });

                productEl.innerHTML = `
                    <div class="flex items-center gap-3 flex-grow min-w-0">
                        ${imageHtml}
                        <div class="min-w-0">
                            <span class="font-bold text-white text-sm block truncate" title="${p.name}">${p.name}</span>
                            <span class="text-xs text-slate-400 block mt-0.5">Phân loại: <strong class="text-cyan-400">${p.category || 'Khác'}</strong></span>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-3 justify-between sm:justify-end">
                        <!-- Chọn phân loại nhanh -->
                        <div class="flex items-center gap-1.5">
                            <span class="text-[10px] text-slate-400 uppercase font-semibold">Chuyển:</span>
                            <select data-id="${p.id}" class="quick-category-select bg-slate-800 border border-slate-700 rounded text-xs px-2 py-1 text-slate-300 focus:outline-none focus:border-cyan-500">
                                ${categoryOptions}
                            </select>
                        </div>
                        
                        <div class="flex items-center gap-1">
                            <button data-product-id="${p.id}" class="edit-btn p-1.5 text-slate-400 hover:text-cyan-400 transition-colors" title="Sửa"><i data-lucide="file-pen-line" class="w-4 h-4"></i></button>
                            <button data-product-id="${p.id}" data-product-name="${p.name}" class="delete-btn p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Xóa"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                `;
                container.appendChild(productEl);
            });
        }
        lucide.createIcons();

        // Gán sự kiện đổi phân loại nhanh
        document.querySelectorAll('.quick-category-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const productId = e.target.dataset.id;
                const newCategory = e.target.value;
                try {
                    await updateDoc(doc(db, `stores/${storeId}/products`, productId), { category: newCategory });
                } catch (error) {
                    console.error("Lỗi khi chuyển phân loại nhanh:", error);
                    alert("Lỗi: Không thể cập nhật phân loại.");
                }
            });
        });
    }

    function renderProductSelects() {
        const inventorySelect = document.getElementById('inventory-product-select');
        const saleSelect = document.getElementById('sale-product-select');
        
        const inventorySearch = document.getElementById('inventory-product-search');
        const saleSearch = document.getElementById('sale-product-search');

        if (products.length === 0) {
            inventorySelect.value = '';
            saleSelect.value = '';
            inventorySearch.value = 'Chưa có sản phẩm';
            saleSearch.value = 'Chưa có sản phẩm';
            document.getElementById('inventory-warning').classList.remove('hidden');
        } else {
            document.getElementById('inventory-warning').classList.add('hidden');
            
            const inventoryValExists = products.some(p => p.id === inventorySelect.value);
            if (!inventorySelect.value || !inventoryValExists) {
                inventorySelect.value = products[0].id;
                inventorySearch.value = products[0].name;
            } else {
                const currentProduct = products.find(p => p.id === inventorySelect.value);
                inventorySearch.value = currentProduct.name;
            }

            const saleValExists = products.some(p => p.id === saleSelect.value);
            if (!saleSelect.value || !saleValExists) {
                saleSelect.value = products[0].id;
                saleSearch.value = products[0].name;
            } else {
                const currentProduct = products.find(p => p.id === saleSelect.value);
                saleSearch.value = currentProduct.name;
            }
        }
        updateSaleFormAvailability();
    }
    
    function renderInventoryDetails() {
        const container = document.getElementById('inventory-details-container');
        container.innerHTML = '';
        if (products.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-center py-4">Chưa có dữ liệu tồn kho.</p>';
            return;
        }
        
        products.forEach(product => {
            const productBatches = inventory.filter(item => item.productId === product.id && item.remainingQuantity >= 0); 
            const totalStock = productBatches.reduce((sum, item) => sum + item.remainingQuantity, 0);

            const productDiv = document.createElement('div');
            productDiv.className = 'bg-slate-700/50 p-4 rounded-lg';
            
            let tableRows = '';
            productBatches
                .sort((a,b) => a.purchaseDate.seconds - b.purchaseDate.seconds) 
                .forEach(batch => {
                tableRows += `
                    <tr class="border-b border-slate-600/50 last:border-0 hover:bg-slate-600/30">
                        <td class="p-2 text-slate-300">${formatDateOnly(batch.purchaseDate)}</td>
                        <td class="p-2 text-right font-mono">${batch.initialQuantity}</td>
                        <td class="p-2 text-right font-mono text-cyan-400">${batch.remainingQuantity}</td>
                        <td class="p-2 text-right font-mono">${formatCurrency(batch.purchasePrice)}</td>
                        <td class="p-2 text-right">
                            <button data-batch-id="${batch.id}" class="edit-inventory-btn p-1 text-slate-400 hover:text-cyan-400 transition-colors"><i data-lucide="file-pen-line" class="w-4 h-4"></i></button>
                        </td>
                    </tr>
                `;
            });

            productDiv.innerHTML = `
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-bold text-lg text-white">${product.name}</h4>
                    <span class="text-lg font-bold text-cyan-400">${totalStock} <span class="text-sm font-normal text-slate-400">tồn kho</span></span>
                </div>
                ${productBatches.length > 0 ? `
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead class="text-slate-400">
                            <tr>
                                <th class="p-2 font-normal">Ngày nhập</th>
                                <th class="p-2 font-normal text-right">SL Nhập</th>
                                <th class="p-2 font-normal text-right">SL Còn</th>
                                <th class="p-2 font-normal text-right">Giá nhập</th>
                                <th class="p-2 font-normal text-right">Sửa</th>
                            </tr>
                        </thead>
                        <tbody id="inventory-batches-list-${product.id}">
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                ` : '<p class="text-slate-400 text-center py-2">Chưa có lô hàng nào.</p>'}
            `;
            container.appendChild(productDiv);
        });
        lucide.createIcons();
    }
    
    function renderSalesDetails(salesData) {
        const container = document.getElementById('sales-details-container');
        container.innerHTML = '';
        if(salesData.length === 0) {
            container.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">Không có đơn bán hàng nào trong khoảng thời gian này.</td></tr>';
            return;
        }
        
        salesData.sort((a,b) => b.saleDate.seconds - a.saleDate.seconds)
            .forEach(sale => {
                const row = document.createElement('tr');
                row.className = "border-b border-slate-700/50 last:border-0";
                row.innerHTML = `
                    <td class="p-2 text-slate-300">${formatDateOnly(sale.saleDate)}</td>
                    <td class="p-2">${sale.productName}</td>
                    <td class="p-2 text-right font-mono">${sale.quantitySold}</td>
                    <td class="p-2 text-right font-mono text-amber-400">${formatCurrency(sale.cogsPerItem)}</td>
                    <td class="p-2 text-right font-mono">${formatCurrency(sale.sellingPrice)}</td>
                    <td class="p-2 text-right font-mono ${sale.profit >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(sale.profit)}</td>
                    <td class="p-2 text-center">
                        <div class="flex justify-center gap-2">
                            <button data-sale-id="${sale.id}" class="edit-sale-btn p-1 text-slate-400 hover:text-cyan-400 transition-colors"><i data-lucide="file-pen-line" class="w-4 h-4"></i></button>
                            <button data-sale-id="${sale.id}" class="delete-sale-btn p-1 text-slate-400 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </td>
                `;
                container.appendChild(row);
            });
        lucide.createIcons();
    }

    function renderDailyProfit(salesData) {
        const container = document.getElementById('daily-profit-container');
        container.innerHTML = '';
        if(salesData.length === 0) {
            container.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-slate-400">...</td></tr>';
            return;
        }

        const dailyProfits = salesData.reduce((acc, sale) => {
            const date = formatDateOnly(sale.saleDate);
            if (!acc[date]) {
                acc[date] = 0;
            }
            acc[date] += sale.profit;
            return acc;
        }, {});

        Object.entries(dailyProfits)
            .sort((a,b) => new Date(b[0].split('/').reverse().join('-')) - new Date(a[0].split('/').reverse().join('-')))
            .forEach(([date, totalProfit]) => {
                const row = `
                     <tr class="border-b border-slate-600/50 last:border-0">
                        <td class="p-2 text-slate-300">${date}</td>
                        <td class="p-2 text-right font-mono ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}">${formatCurrency(totalProfit)}</td>
                    </tr>
                `;
                container.innerHTML += row;
            });
    }

    function renderStats(salesData, filter) {
        const totalRevenue = salesData.reduce((sum, sale) => sum + sale.totalRevenue, 0);
        const grossProfit = salesData.reduce((sum, sale) => sum + sale.profit, 0);
        const totalInventoryValue = inventory.reduce((sum, item) => sum + (item.remainingQuantity * item.purchasePrice), 0);
        
        let estimatedNetProfit = grossProfit;
        const netProfitLabel = document.getElementById('net-profit-label');
        
        if (filter !== 'all' && filter) {
            estimatedNetProfit -= (businessConfig.fixedCost || 0);
            netProfitLabel.textContent = 'Lợi nhuận Ròng (Tháng)';
        } else {
            netProfitLabel.textContent = 'Lợi nhuận Ròng (Toàn TG)';
        }
        
        const netProfitEl = document.getElementById('stats-net-profit');
        if (netProfitEl) {
            netProfitEl.textContent = formatCurrency(estimatedNetProfit);
            netProfitEl.classList.toggle('text-red-500', estimatedNetProfit < 0);
            netProfitEl.classList.toggle('text-white', estimatedNetProfit >= 0);
        }

        const revenueEl = document.getElementById('stats-revenue');
        if (revenueEl) {
            revenueEl.textContent = formatCurrency(totalRevenue);
        }

        const profitEl = document.getElementById('stats-profit');
        if (profitEl) {
            profitEl.textContent = formatCurrency(grossProfit);
        }

        const inventoryValueEl = document.getElementById('stats-inventory-value');
        if (inventoryValueEl) {
            inventoryValueEl.textContent = formatCurrency(totalInventoryValue);
        }
    }

    function updateSaleFormAvailability() {
        const selectedProductId = document.getElementById('sale-product-select').value;
        if (!selectedProductId) return;

        const availableStock = inventory
            .filter(item => item.productId === selectedProductId)
            .reduce((sum, item) => sum + item.remainingQuantity, 0);
        
        const quantityInput = document.getElementById('sale-quantity');
        const priceInput = document.getElementById('sale-price');
        const saleButton = document.querySelector('#add-sale-form button');
        const suggestionContainer = document.getElementById('sale-suggestion-container');
        const outOfStockMsg = document.getElementById('sale-out-of-stock-msg');

        document.getElementById('sale-available-stock').textContent = availableStock;
        quantityInput.max = availableStock;

        if (availableStock === 0 || products.length === 0) {
            quantityInput.disabled = true;
            priceInput.disabled = true;
            saleButton.disabled = true;
            suggestionContainer.classList.add('hidden');
            outOfStockMsg.classList.remove('hidden');
        } else {
            quantityInput.disabled = false;
            priceInput.disabled = false;
            saleButton.disabled = false;
            suggestionContainer.classList.remove('hidden');
            outOfStockMsg.classList.add('hidden');
        }
        calculateSuggestedPrice();
    }

    // Sửa thông tin sản phẩm
    document.getElementById('product-list-container').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');

        if (editBtn) {
            const productId = editBtn.dataset.productId;
            const product = products.find(p => p.id === productId);
            if (product) {
                document.getElementById('edit-product-id').value = productId;
                document.getElementById('edit-product-name').value = product.name;
                document.getElementById('edit-product-category-select').value = product.category || 'Khác';
                document.getElementById('edit-product-image-url').value = product.imageUrl || '';
                
                const previewContainer = document.getElementById('edit-product-image-preview-container');
                const previewImg = document.getElementById('edit-product-image-preview');
                if (product.imageUrl) {
                    previewImg.src = product.imageUrl;
                    previewContainer.classList.remove('hidden');
                } else {
                    previewContainer.classList.add('hidden');
                }
                
                document.getElementById('edit-product-feedback').textContent = '';
                editProductModal.classList.remove('hidden');
            }
        }

        if (deleteBtn) {
            const productId = deleteBtn.dataset.productId;
            const productName = deleteBtn.dataset.productName;
            document.getElementById('delete-product-name').textContent = productName;
            deleteProductModal.dataset.productId = productId; 
            deleteProductModal.classList.remove('hidden');
        }
    });

    document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('edit-product-id').value;
        const newName = document.getElementById('edit-product-name').value.trim();
        const newCategory = document.getElementById('edit-product-category-select').value;
        const newImageUrl = document.getElementById('edit-product-image-url').value.trim();
        const feedbackEl = document.getElementById('edit-product-feedback');
        feedbackEl.textContent = '';

        if (!newName) return;

        const isDuplicate = products.some(p => p.id !== productId && p.name.toLowerCase() === newName.toLowerCase());
        if (isDuplicate) {
            feedbackEl.textContent = `Tên "${newName}" đã được sử dụng.`;
            feedbackEl.className = 'text-yellow-400 text-sm h-5';
            return;
        }

        try {
            const productRef = doc(db, `stores/${storeId}/products`, productId);
            await updateDoc(productRef, { 
                name: newName,
                category: newCategory,
                imageUrl: newImageUrl
            });
            editProductModal.classList.add('hidden');
        } catch (error) {
            console.error("Lỗi khi sửa sản phẩm:", error);
            feedbackEl.textContent = 'Lỗi: Không thể lưu thay đổi.';
            feedbackEl.className = 'text-red-400 text-sm h-5';
        }
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', () => editProductModal.classList.add('hidden'));

    document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
        const productId = deleteProductModal.dataset.productId;
        if (!productId) return;

        const batch = writeBatch(db);

        try {
            const productRef = doc(db, `stores/${storeId}/products`, productId);
            batch.delete(productRef);

            const inventoryQuery = query(collection(db, `stores/${storeId}/inventoryBatches`), where("productId", "==", productId));
            const inventorySnapshot = await getDocs(inventoryQuery);
            inventorySnapshot.forEach(doc => batch.delete(doc.ref));

            const salesQuery = query(collection(db, `stores/${storeId}/sales`), where("productId", "==", productId));
            const salesSnapshot = await getDocs(salesQuery);
            salesSnapshot.forEach(doc => batch.delete(doc.ref));

            await batch.commit();
            deleteProductModal.classList.add('hidden');
        } catch (error) {
            console.error("Lỗi khi xóa sản phẩm:", error);
            alert("Đã xảy ra lỗi khi xóa sản phẩm. Vui lòng thử lại.");
        }
    });

    document.getElementById('cancel-delete-btn').addEventListener('click', () => deleteProductModal.classList.add('hidden'));

    // Nhập kho
    document.getElementById('add-inventory-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('inventory-product-select').value;
        const quantity = Number(document.getElementById('inventory-quantity').value);
        const price = Number(document.getElementById('inventory-price').value);
        const dateValue = document.getElementById('inventory-date').value;
        const productName = products.find(p => p.id === productId)?.name;

        if (!productId || !productName || !quantity || price < 0 || !dateValue) {
            alert("Vui lòng chọn sản phẩm hợp lệ.");
            return;
        }

        const button = e.target.querySelector('button');
        button.disabled = true;
        try {
            await addDoc(collection(db, `stores/${storeId}/inventoryBatches`), {
                productId: productId,
                productName: productName,
                initialQuantity: quantity,
                remainingQuantity: quantity,
                purchasePrice: price,
                purchaseDate: Timestamp.fromDate(new Date(dateValue)),
            });
            e.target.reset();
            setDefaultDates();
            renderProductSelects(); 
        } catch (error) {
            console.error("Lỗi khi nhập kho:", error);
            alert("Đã xảy ra lỗi khi nhập kho.");
        } finally {
            button.disabled = false;
        }
    });

    // Bán hàng tại quầy
    async function createSale(saleDetails) {
        const { productId, quantityToSell, sellingPrice, dateValue } = saleDetails;
        
        const productInventoryBatches = inventory.filter(item => item.productId === productId && item.remainingQuantity > 0);
        const totalStock = productInventoryBatches.reduce((sum, batch) => sum + batch.remainingQuantity, 0);
        
        if (totalStock < quantityToSell) {
            throw new Error(`Không đủ hàng! Chỉ còn ${totalStock} sản phẩm trong kho.`);
        }

        const fifoBatchesForSale = [...productInventoryBatches].sort((a, b) => a.purchaseDate.seconds - b.purchaseDate.seconds);
        let remainingToCalcCost = quantityToSell;
        let actualTotalCostOfGoodsSold = 0;
        for (const invBatch of fifoBatchesForSale) {
            if (remainingToCalcCost <= 0) break;
            const qtyFromThisBatch = Math.min(remainingToCalcCost, invBatch.remainingQuantity);
            actualTotalCostOfGoodsSold += qtyFromThisBatch * invBatch.purchasePrice;
            remainingToCalcCost -= qtyFromThisBatch;
        }
        const actualCogsPerItem = actualTotalCostOfGoodsSold / quantityToSell;

        const batch = writeBatch(db);
        let remainingToSell = quantityToSell;
        for (const invBatch of fifoBatchesForSale) {
            if (remainingToSell <= 0) break;
            const quantityFromThisBatch = Math.min(remainingToSell, invBatch.remainingQuantity);
            const newRemainingQuantity = invBatch.remainingQuantity - quantityFromThisBatch;
            const batchDocRef = doc(db, `stores/${storeId}/inventoryBatches`, invBatch.id);
            batch.update(batchDocRef, { remainingQuantity: newRemainingQuantity });
            remainingToSell -= quantityFromThisBatch;
        }

        const totalRevenue = quantityToSell * sellingPrice;
        const profit = totalRevenue - actualTotalCostOfGoodsSold;
        const newSaleRef = doc(collection(db, `stores/${storeId}/sales`));

        batch.set(newSaleRef, {
            productId: productId,
            productName: products.find(p => p.id === productId)?.name,
            quantitySold: quantityToSell,
            sellingPrice: sellingPrice,
            totalRevenue: totalRevenue,
            totalCostOfGoodsSold: actualTotalCostOfGoodsSold,
            cogsPerItem: actualCogsPerItem,
            profit: profit,
            saleDate: Timestamp.fromDate(new Date(dateValue)),
        });

        return batch.commit();
    }

    document.getElementById('add-sale-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedbackEl = document.getElementById('sale-feedback');
        feedbackEl.textContent = '';
        
        const saleDetails = {
            productId: document.getElementById('sale-product-select').value,
            quantityToSell: Number(document.getElementById('sale-quantity').value),
            sellingPrice: Number(document.getElementById('sale-price').value),
            dateValue: document.getElementById('sale-date').value
        };

        if (!saleDetails.productId || !saleDetails.quantityToSell || saleDetails.sellingPrice < 0 || !saleDetails.dateValue) {
            alert("Vui lòng chọn sản phẩm hợp lệ.");
            return;
        }

        const button = e.target.querySelector('button');
        button.disabled = true;
        
        try {
            await createSale(saleDetails);
            feedbackEl.textContent = `Bán thành công!`;
            feedbackEl.className = 'text-green-400 text-sm mt-2 h-5';
            e.target.reset();
            setDefaultDates();
            renderProductSelects(); 
            setTimeout(() => { feedbackEl.textContent = '' }, 3000);
        } catch (error) {
            console.error("Lỗi khi bán hàng:", error);
            feedbackEl.textContent = `Lỗi: ${error.message}`;
            feedbackEl.className = 'text-red-400 text-sm mt-2 h-5';
        } finally {
            button.disabled = false;
            updateSaleFormAvailability();
        }
    });

    // Thiết lập
    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedbackEl = document.getElementById('settings-feedback');
        const newConfig = {
            fixedCost: Number(document.getElementById('setting-fixed-cost').value) || 0,
            profitMargin: Number(document.getElementById('setting-profit-margin').value) || 0,
        };
        
        try {
            const configRef = doc(db, `stores/${storeId}/config/business`);
            await setDoc(configRef, newConfig);
            feedbackEl.textContent = 'Đã lưu thiết lập!';
            feedbackEl.className = 'text-green-400 text-sm text-center h-5';
            setTimeout(() => { feedbackEl.textContent = '' }, 3000);
        } catch (error) {
            console.error("Lỗi khi lưu thiết lập:", error);
            feedbackEl.textContent = 'Lỗi: Không thể lưu.';
            feedbackEl.className = 'text-red-400 text-sm text-center h-5';
        }
    });

    function calculateSuggestedPrice() {
        const productId = document.getElementById('sale-product-select').value;
        const suggestedPriceEl = document.getElementById('suggested-price');
        const averageCostEl = document.getElementById('average-cost-display');

        if (!productId) {
            suggestedPriceEl.textContent = '---';
            averageCostEl.textContent = '---';
            return;
        }

        const productInventoryBatches = inventory.filter(item => item.productId === productId && item.remainingQuantity > 0);
        const totalValue = productInventoryBatches.reduce((sum, batch) => sum + (batch.remainingQuantity * batch.purchasePrice), 0);
        const totalQuantity = productInventoryBatches.reduce((sum, batch) => sum + batch.remainingQuantity, 0);

        if (totalQuantity === 0) {
            suggestedPriceEl.textContent = '---';
            averageCostEl.textContent = '---';
            return;
        }

        const averageCost = totalValue / totalQuantity;
        averageCostEl.textContent = formatCurrency(averageCost);
        const suggestedPrice = averageCost * (1 + ((businessConfig.profitMargin || 0) / 100));
        suggestedPriceEl.textContent = formatCurrency(suggestedPrice);
    }

    // Tabs navigation
    function initializeTabs() {
        const tabsContainer = document.getElementById('main-tabs');
        const tabPanes = document.querySelectorAll('#tab-content .tab-pane');
        const tabBtns = document.querySelectorAll('#main-tabs .tab-btn');

        const defaultTab = 'orders'; // Tab mới làm mặc định
        const defaultBtn = document.querySelector(`.tab-btn[data-tab="${defaultTab}"]`);
        if (defaultBtn) {
            defaultBtn.classList.add('text-white', 'border-cyan-500');
            defaultBtn.classList.remove('text-slate-400', 'border-transparent');
        }
        const defaultPane = document.getElementById(`${defaultTab}-tab`);
        if (defaultPane) {
            defaultPane.classList.remove('hidden');
        }

        tabsContainer.addEventListener('click', (e) => {
            const clickedBtn = e.target.closest('.tab-btn');
            if (!clickedBtn) return;

            const tabId = clickedBtn.dataset.tab;

            if (tabId === 'sales' || tabId === 'inventory') {
                setDefaultDates();
            }

            tabBtns.forEach(btn => {
                btn.classList.remove('text-white', 'border-cyan-500');
                btn.classList.add('text-slate-400', 'border-transparent');
            });
            clickedBtn.classList.add('text-white', 'border-cyan-500');
            clickedBtn.classList.remove('text-slate-400', 'border-transparent');

            tabPanes.forEach(pane => {
                if (pane.id === `${tabId}-tab`) {
                    pane.classList.remove('hidden');
                } else {
                    pane.classList.add('hidden');
                }
            });
        });
    }

    function initializeReportFilters() {
        document.getElementById('report-start-date').addEventListener('change', filterAndRenderReports);
        document.getElementById('report-end-date').addEventListener('change', filterAndRenderReports);
        document.getElementById('export-report-btn').addEventListener('click', exportReport);
    }
    
    function renderChart(salesData) {
        const ctx = document.getElementById('sales-chart').getContext('2d');
        
        const dailyData = salesData.reduce((acc, sale) => {
            const date = formatDateOnly(sale.saleDate);
            if (!acc[date]) {
                acc[date] = { revenue: 0, cost: 0, profit: 0 };
            }
            acc[date].revenue += sale.totalRevenue;
            acc[date].cost += sale.totalCostOfGoodsSold;
            acc[date].profit += sale.profit;
            return acc;
        }, {});

        const sortedLabels = Object.keys(dailyData).sort((a,b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
        const revenueData = sortedLabels.map(label => dailyData[label].revenue);
        const costData = sortedLabels.map(label => dailyData[label].cost);
        const profitData = sortedLabels.map(label => dailyData[label].profit);

        if (salesChart) {
            salesChart.destroy();
        }

        salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedLabels,
                datasets: [
                    {
                        label: 'Doanh thu',
                        data: revenueData,
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.5)',
                        tension: 0.1
                    },
                    {
                        label: 'Giá vốn',
                        data: costData,
                        borderColor: 'rgb(245, 158, 11)',
                        backgroundColor: 'rgba(245, 158, 11, 0.5)',
                        tension: 0.1
                    },
                     {
                        label: 'Lợi nhuận',
                        data: profitData,
                        borderColor: 'rgb(34, 197, 94)',
                        backgroundColor: 'rgba(34, 197, 94, 0.5)',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#cbd5e1' }
                    },
                     tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += formatCurrency(context.parsed.y);
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    y: {
                        ticks: { 
                            color: '#94a3b8',
                            callback: (value) => formatCurrency(value)
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    }

    // Sửa lô hàng
    document.getElementById('inventory-details-container').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-inventory-btn');
        if (editBtn) {
            const batchId = editBtn.dataset.batchId;
            const batch = inventory.find(b => b.id === batchId);
            if (batch) {
                document.getElementById('edit-inventory-id').value = batch.id;
                document.getElementById('edit-inventory-quantity').value = batch.initialQuantity;
                document.getElementById('edit-inventory-price').value = batch.purchasePrice;
                document.getElementById('edit-inventory-date').value = dateToIso(batch.purchaseDate.toDate());
                document.getElementById('edit-inventory-feedback').textContent = '';
                editInventoryModal.classList.remove('hidden');
            }
        }
    });

    document.getElementById('edit-inventory-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const batchId = document.getElementById('edit-inventory-id').value;
        const newInitialQuantity = Number(document.getElementById('edit-inventory-quantity').value);
        const newPrice = Number(document.getElementById('edit-inventory-price').value);
        const newDate = new Date(document.getElementById('edit-inventory-date').value);
        const feedbackEl = document.getElementById('edit-inventory-feedback');
        feedbackEl.textContent = '';

        const originalBatch = inventory.find(b => b.id === batchId);
        const soldQuantity = originalBatch.initialQuantity - originalBatch.remainingQuantity;

        if (newInitialQuantity < soldQuantity) {
            feedbackEl.textContent = `Lỗi: SL nhập mới (${newInitialQuantity}) không thể nhỏ hơn SL đã bán (${soldQuantity}).`;
            feedbackEl.className = 'text-red-400 text-sm h-5';
            return;
        }

        const newRemainingQuantity = newInitialQuantity - soldQuantity;

        try {
            const batchRef = doc(db, `stores/${storeId}/inventoryBatches`, batchId);
            await updateDoc(batchRef, {
                initialQuantity: newInitialQuantity,
                remainingQuantity: newRemainingQuantity,
                purchasePrice: newPrice,
                purchaseDate: Timestamp.fromDate(newDate)
            });
            editInventoryModal.classList.add('hidden');
        } catch (error) {
            console.error("Lỗi khi sửa lô hàng:", error);
            feedbackEl.textContent = 'Lỗi: Không thể lưu thay đổi.';
            feedbackEl.className = 'text-red-400 text-sm h-5';
        }
    });
    
    document.getElementById('cancel-edit-inventory-btn').addEventListener('click', () => editInventoryModal.classList.add('hidden'));

    // Xuất báo cáo
    function exportReport() {
        const startDateInput = document.getElementById('report-start-date').value;
        const endDateInput = document.getElementById('report-end-date').value;
        if (!startDateInput || !endDateInput) return;

        const startDate = new Date(startDateInput);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(endDateInput);
        endDate.setHours(23, 59, 59, 999);

        const filteredSales = sales.filter(sale => {
            const saleDate = sale.saleDate.toDate();
            return saleDate >= startDate && saleDate <= endDate;
        });
        
        const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.profit, 0);
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write('<html><head><title>Báo cáo Bán hàng</title>');
        reportWindow.document.write('<style>body{font-family:sans-serif;margin:2em} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px} th{background-color:#f2f2f2} h1,h2,h3{text-align:center}</style>');
        reportWindow.document.write('</head><body>');
        reportWindow.document.write(`<h1>Báo cáo Bán hàng</h1>`);
        reportWindow.document.write(`<h2>Từ ${formatDateOnly(Timestamp.fromDate(startDate))} đến ${formatDateOnly(Timestamp.fromDate(endDate))}</h2>`);
        reportWindow.document.write(`<h3>Tổng lợi nhuận trong kỳ: ${formatCurrency(totalProfit)}</h3>`);
        
        reportWindow.document.write('<h4>Chi tiết bán hàng</h4>');
        let salesTable = '<table><thead><tr><th>Ngày bán</th><th>Sản phẩm</th><th>SL</th><th>Giá vốn/SP</th><th>Giá bán/SP</th><th>Lợi nhuận</th></tr></thead><tbody>';
        filteredSales.forEach(sale => {
            salesTable += `<tr>
                <td>${formatDateOnly(sale.saleDate)}</td>
                <td>${sale.productName}</td>
                <td style="text-align:right">${sale.quantitySold}</td>
                <td style="text-align:right">${formatCurrency(sale.cogsPerItem)}</td>
                <td style="text-align:right">${formatCurrency(sale.sellingPrice)}</td>
                <td style="text-align:right">${formatCurrency(sale.profit)}</td>
            </tr>`;
        });
        salesTable += '</tbody></table>';
        reportWindow.document.write(salesTable);

        reportWindow.document.write('<h4>Lợi nhuận theo ngày</h4>');
        const dailyProfits = filteredSales.reduce((acc, sale) => {
            const date = formatDateOnly(sale.saleDate);
            if (!acc[date]) acc[date] = 0;
            acc[date] += sale.profit;
            return acc;
        }, {});
        let profitTable = '<table><thead><tr><th>Ngày</th><th>Tổng Lợi nhuận</th></tr></thead><tbody>';
        Object.entries(dailyProfits).sort((a,b) => new Date(b[0].split('/').reverse().join('-')) - new Date(a[0].split('/').reverse().join('-')))
            .forEach(([date, totalProfit]) => {
            profitTable += `<tr><td>${date}</td><td style="text-align:right">${formatCurrency(totalProfit)}</td></tr>`;
        });
        profitTable += '</tbody></table>';
        reportWindow.document.write(profitTable);

        reportWindow.document.write('</body></html>');
        reportWindow.document.close();
    }

    // Sửa/Xóa Đơn Bán Hàng Tại Quầy
    async function deleteSale(saleId) {
        const saleToDelete = sales.find(s => s.id === saleId);
        if (!saleToDelete) throw new Error("Không tìm thấy đơn hàng.");

        const batch = writeBatch(db);
        let quantityToReturn = saleToDelete.quantitySold;
        const relatedBatches = inventory
            .filter(b => b.productId === saleToDelete.productId)
            .sort((a, b) => b.purchaseDate.seconds - a.purchaseDate.seconds);

        for (const invBatch of relatedBatches) {
            if (quantityToReturn <= 0) break;
            const spaceAvailable = invBatch.initialQuantity - invBatch.remainingQuantity;
            const quantityToRestore = Math.min(quantityToReturn, spaceAvailable);
            if (quantityToRestore > 0) {
                const batchDocRef = doc(db, `stores/${storeId}/inventoryBatches`, invBatch.id);
                batch.update(batchDocRef, { remainingQuantity: invBatch.remainingQuantity + quantityToRestore });
                quantityToReturn -= quantityToRestore;
            }
        }

        const saleRef = doc(db, `stores/${storeId}/sales`, saleId);
        batch.delete(saleRef);
        return batch.commit();
    }

    document.getElementById('reports-tab').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-sale-btn');
        const deleteBtn = e.target.closest('.delete-sale-btn');

        if (editBtn) {
            const saleId = editBtn.dataset.saleId;
            const sale = sales.find(s => s.id === saleId);
            if (sale) {
                document.getElementById('edit-sale-id').value = sale.id;
                document.getElementById('edit-sale-product-name').textContent = sale.productName;
                document.getElementById('edit-sale-quantity').value = sale.quantitySold;
                document.getElementById('edit-sale-price').value = sale.sellingPrice;
                document.getElementById('edit-sale-date').value = dateToIso(sale.saleDate.toDate());
                document.getElementById('edit-sale-feedback').textContent = '';
                editSaleModal.classList.remove('hidden');
            }
        }

        if (deleteBtn) {
            const saleId = deleteBtn.dataset.saleId;
            deleteSaleModal.dataset.saleId = saleId;
            deleteSaleModal.classList.remove('hidden');
        }
    });

    document.getElementById('cancel-delete-sale-btn').addEventListener('click', () => deleteSaleModal.classList.add('hidden'));
    document.getElementById('cancel-edit-sale-btn').addEventListener('click', () => editSaleModal.classList.add('hidden'));

    document.getElementById('confirm-delete-sale-btn').addEventListener('click', async () => {
        const saleId = deleteSaleModal.dataset.saleId;
        if (!saleId) return;

        try {
            await deleteSale(saleId);
            deleteSaleModal.classList.add('hidden');
        } catch (error) {
            console.error("Lỗi khi xóa đơn hàng:", error);
            alert("Lỗi: " + error.message);
        }
    });
    
    document.getElementById('edit-sale-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const feedbackEl = document.getElementById('edit-sale-feedback');
        feedbackEl.textContent = '';
        
        const saleId = document.getElementById('edit-sale-id').value;
        const originalSale = sales.find(s => s.id === saleId);

        const newSaleDetails = {
            productId: originalSale.productId,
            quantityToSell: Number(document.getElementById('edit-sale-quantity').value),
            sellingPrice: Number(document.getElementById('edit-sale-price').value),
            dateValue: document.getElementById('edit-sale-date').value
        };

        const currentStock = inventory
            .filter(item => item.productId === originalSale.productId)
            .reduce((sum, item) => sum + item.remainingQuantity, 0);
        const maxAllowedQuantity = currentStock + originalSale.quantitySold;

        if (newSaleDetails.quantityToSell > maxAllowedQuantity) {
            feedbackEl.textContent = `Lỗi: Số lượng vượt quá ${maxAllowedQuantity}.`;
            feedbackEl.className = 'text-red-400 text-sm h-5';
            return;
        }

        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;

        try {
            await deleteSale(saleId);
            await createSale(newSaleDetails);
            editSaleModal.classList.add('hidden');
        } catch (error) {
            console.error("Lỗi cập nhật:", error);
            alert("Lỗi trong quá trình cập nhật. Đơn gốc đã được xóa để hoàn kho.");
        } finally {
            button.disabled = false;
        }
    });

    // --- LOGIC PHÂN LOẠI & UPLOAD ẢNH BỔ SUNG ---
    
    // Thêm sản phẩm mới kèm phân loại và ảnh
    document.getElementById('add-product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('product-name');
        const categorySelect = document.getElementById('product-category-select');
        const imageUrlInput = document.getElementById('product-image-url');
        const feedbackEl = document.getElementById('product-feedback');
        
        const productName = nameInput.value.trim();
        const productCategory = categorySelect.value;
        const productImageUrl = imageUrlInput.value.trim();

        feedbackEl.textContent = ''; 

        if (!productName) return;
        
        const isDuplicate = products.some(p => p.name.toLowerCase() === productName.toLowerCase());
        if (isDuplicate) {
            feedbackEl.textContent = `Sản phẩm "${productName}" đã tồn tại.`;
            feedbackEl.className = 'text-yellow-400 text-sm h-5';
            return; 
        }
        
        const button = e.target.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await addDoc(collection(db, `stores/${storeId}/products`), {
                name: productName,
                category: productCategory,
                imageUrl: productImageUrl,
                createdAt: Timestamp.now()
            });
            nameInput.value = '';
            imageUrlInput.value = '';
            document.getElementById('product-image-preview-container').classList.add('hidden');
            feedbackEl.textContent = 'Thêm sản phẩm thành công!';
            feedbackEl.className = 'text-green-400 text-sm h-5';
            setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
        } catch (error) {
            console.error("Lỗi thêm sản phẩm:", error);
            feedbackEl.textContent = 'Lỗi: Không thể thêm sản phẩm.';
            feedbackEl.className = 'text-red-400 text-sm h-5';
        } finally {
            button.disabled = false;
        }
    });

    function updateCategoryDropdowns() {
        const addSelect = document.getElementById('product-category-select');
        const editSelect = document.getElementById('edit-product-category-select');
        
        if (!addSelect || !editSelect) return;

        const currentAddVal = addSelect.value;
        const currentEditVal = editSelect.value;

        addSelect.innerHTML = '';
        editSelect.innerHTML = '';

        categories.forEach(cat => {
            const opt1 = document.createElement('option');
            opt1.value = cat.name;
            opt1.textContent = cat.name;
            addSelect.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = cat.name;
            opt2.textContent = cat.name;
            editSelect.appendChild(opt2);
        });

        // Khôi phục giá trị đã chọn trước đó nếu vẫn tồn tại
        if (categories.some(c => c.name === currentAddVal)) {
            addSelect.value = currentAddVal;
        } else if (categories.length > 0) {
            addSelect.value = categories[0].name;
        }
        
        if (categories.some(c => c.name === currentEditVal)) {
            editSelect.value = currentEditVal;
        } else if (categories.length > 0) {
            editSelect.value = categories[0].name;
        }
    }

    function renderCategoryList() {
        const container = document.getElementById('category-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (categories.length === 0) {
            container.innerHTML = '<p class="text-slate-400 text-xs py-2 text-center">Chưa có danh mục nào.</p>';
            return;
        }

        categories.forEach(cat => {
            const isProtected = ['Lợn đất', 'Mèo thần tài', 'Khác'].includes(cat.name);
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between bg-slate-800 p-2 rounded border border-slate-700/50';
            div.innerHTML = `
                <span class="text-xs text-white font-medium">${cat.name}</span>
                <div class="flex gap-1.5">
                    ${!isProtected ? `
                        <button class="edit-category-btn text-slate-400 hover:text-cyan-400 p-1" data-name="${cat.name}">
                            <i data-lucide="file-pen-line" class="w-3.5 h-3.5"></i>
                        </button>
                        <button class="delete-category-btn text-slate-400 hover:text-red-500 p-1" data-name="${cat.name}">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    ` : '<span class="text-[10px] text-slate-500 px-1 py-0.5 select-none bg-slate-900 rounded font-semibold">Hệ thống</span>'}
                </div>
            `;
            container.appendChild(div);
        });
        lucide.createIcons();

        // Gán sự kiện sửa/xóa danh mục
        document.querySelectorAll('.edit-category-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const oldName = e.currentTarget.dataset.name;
                const newName = prompt(`Nhập tên mới cho danh mục "${oldName}":`, oldName);
                if (!newName || newName.trim() === oldName) return;

                const cleanNewName = newName.trim();
                const isDuplicate = categories.some(c => c.name.toLowerCase() === cleanNewName.toLowerCase());
                if (isDuplicate) {
                    alert(`Danh mục "${cleanNewName}" đã tồn tại!`);
                    return;
                }

                // Tiến hành đổi tên bằng Batch
                const batch = writeBatch(db);
                // 1. Tạo danh mục mới
                batch.set(doc(db, `stores/${storeId}/categories`, cleanNewName), {
                    name: cleanNewName,
                    createdAt: Timestamp.now()
                });
                // 2. Xóa danh mục cũ
                batch.delete(doc(db, `stores/${storeId}/categories`, oldName));

                // 3. Cập nhật tất cả sản phẩm thuộc danh mục cũ sang danh mục mới
                const affectedProducts = products.filter(p => p.category === oldName);
                affectedProducts.forEach(p => {
                    batch.update(doc(db, `stores/${storeId}/products`, p.id), { category: cleanNewName });
                });

                try {
                    await batch.commit();
                    alert(`Đổi tên danh mục thành "${cleanNewName}" thành công!`);
                } catch (error) {
                    console.error("Lỗi đổi tên danh mục:", error);
                    alert("Lỗi: Không thể đổi tên danh mục.");
                }
            });
        });

        document.querySelectorAll('.delete-category-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const name = e.currentTarget.dataset.name;
                if (confirm(`Bạn có chắc chắn muốn xóa danh mục "${name}"?\nTất cả sản phẩm thuộc danh mục này sẽ chuyển về danh mục "Khác".`)) {
                    const batch = writeBatch(db);
                    batch.delete(doc(db, `stores/${storeId}/categories`, name));

                    const affectedProducts = products.filter(p => p.category === name);
                    affectedProducts.forEach(p => {
                        batch.update(doc(db, `stores/${storeId}/products`, p.id), { category: "Khác" });
                    });

                    try {
                        await batch.commit();
                        alert("Đã xóa danh mục và chuyển các sản phẩm liên quan sang 'Khác'.");
                    } catch (error) {
                        console.error("Lỗi xóa danh mục:", error);
                        alert("Lỗi: Không thể xóa danh mục.");
                    }
                }
            });
        });
    }

    function setupImageUpload(fileInputId, buttonId, urlInputId, previewContainerId, previewImgId) {
        const fileInput = document.getElementById(fileInputId);
        const button = document.getElementById(buttonId);
        const urlInput = document.getElementById(urlInputId);
        const previewContainer = document.getElementById(previewContainerId);
        const previewImg = document.getElementById(previewImgId);

        if (!fileInput || !button) return;

        button.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                alert("Vui lòng chọn tệp tin hình ảnh!");
                return;
            }

            const originalBtnHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = `<svg class="animate-spin h-3.5 w-3.5 text-white inline mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Đang tải...`;

            const formData = new FormData();
            formData.append('image', file);

            try {
                // Upload lên Imgbb sử dụng API Key mặc định của chúng ta
                const response = await fetch(`https://api.imgbb.com/1/upload?key=31d1d86dcf3519c72c21950d908ff95f`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error("Upload thất bại!");

                const result = await response.json();
                if (result.success) {
                    const imageUrl = result.data.url;
                    urlInput.value = imageUrl;
                    
                    if (previewImg) previewImg.src = imageUrl;
                    if (previewContainer) previewContainer.classList.remove('hidden');
                } else {
                    throw new Error(result.error?.message || "Lỗi tải ảnh!");
                }
            } catch (err) {
                console.error("Lỗi khi tải ảnh lên Imgbb:", err);
                alert("Không thể tải ảnh lên Imgbb: " + err.message);
            } finally {
                button.disabled = false;
                button.innerHTML = originalBtnHtml;
                fileInput.value = '';
            }
        });
    }

    async function autoMigrateExistingData() {
        const batch = writeBatch(db);
        let count = 0;
        
        products.forEach(p => {
            if (!p.category) {
                let categoryName = "Khác";
                const cleanName = p.name.toLowerCase();
                if (cleanName.includes("lợn") || cleanName.includes("heo")) {
                    categoryName = "Lợn đất";
                } else if (cleanName.includes("mèo")) {
                    categoryName = "Mèo thần tài";
                }
                
                batch.update(doc(db, `stores/${storeId}/products`, p.id), { category: categoryName });
                count++;
            }
        });
        
        if (count > 0) {
            try {
                await batch.commit();
                console.log(`Đã tự động phân loại ${count} sản phẩm cũ.`);
            } catch(e) {
                console.error("Lỗi tự động phân loại cũ:", e);
            }
        }
    }
});
