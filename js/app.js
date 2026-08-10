// Import các hàm cần thiết từ Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
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
    // =================================================================================
    // == CẤU HÌNH FIREBASE CỦA BẠN ĐÃ ĐƯỢC THÊM VÀO ĐÂY ==
    // =================================================================================
    const firebaseConfig = {
        apiKey: "AIzaSyDosCykP-rrTVAlwfAOXDGgGioxtt-VrOs",
        authDomain: "quanlykinhdoanh-cb2b1.firebaseapp.com",
        projectId: "quanlykinhdoanh-cb2b1",
        storageBucket: "quanlykinhdoanh-cb2b1.appspot.com",
        messagingSenderId: "478736931655",
        appId: "1:478736931655:web:b216ac919d9aeca334ca62"
    };
    // =================================================================================

    if (!firebaseConfig.apiKey) {
        document.getElementById('loader').innerHTML = `<div class="text-center text-yellow-400 bg-yellow-900/50 p-6 rounded-lg"><h2 class="text-2xl font-bold mb-2">Chưa có Cấu hình Firebase!</h2><p>Vui lòng mở file HTML này, tìm đến phần JavaScript và dán đối tượng 'firebaseConfig' của bạn vào.</p></div>`;
    } else {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        let storeId = "Mèo thần tài Lợn đất"; // Khóa cứng Store ID
        let products = [];
        let inventory = [];
        let sales = [];
        let businessConfig = { fixedCost: 0, profitMargin: 20 };
        let unsubscribeProducts, unsubscribeInventory, unsubscribeSales, unsubscribeConfig;
        let salesChart = null;
        let statsFilterValue = 'all'; // Biến trạng thái cho bộ lọc thống kê

        const loader = document.getElementById('loader');
        const mainContent = document.getElementById('main-content');
        const editProductModal = document.getElementById('edit-product-modal');
        const deleteProductModal = document.getElementById('delete-product-modal');
        const editInventoryModal = document.getElementById('edit-inventory-modal');
        const editSaleModal = document.getElementById('edit-sale-modal');
        const deleteSaleModal = document.getElementById('delete-sale-modal');

        const formatCurrency = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
        const formatDate = (timestamp) => timestamp ? new Date(timestamp.seconds * 1000).toLocaleDateString('vi-VN') : 'N/A';
        const dateToIso = (date) => date.toISOString().split('T')[0];
        
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

            // Đóng dropdown khi click ra ngoài
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.add('hidden');
                }
            });

            // Hiện dropdown khi click/focus
            searchInput.addEventListener('focus', () => {
                renderDropdown(searchInput.value);
            });

            // Lọc danh sách khi gõ chữ
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
        
        function setDefaultDates() {
            const today = dateToIso(new Date());
            document.getElementById('inventory-date').value = today;
            document.getElementById('sale-date').value = today;
            document.getElementById('report-end-date').value = today;
            const startOfMonth = new Date(new Date().setDate(1));
            document.getElementById('report-start-date').value = dateToIso(startOfMonth);
        }

        // Lọc thống kê dựa theo storeId và statsFilterValue
        function updateStats() {
            const filter = statsFilterValue; // Sử dụng biến trạng thái
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
            if (products.length === 0) {
                container.innerHTML = '<p class="text-slate-400 text-center py-4">Chưa có sản phẩm nào.</p>';
            } else {
                products.forEach(p => {
                    const productEl = document.createElement('div');
                    productEl.className = 'flex items-center justify-between bg-slate-700/50 p-3 rounded-lg';
                    productEl.innerHTML = `
                        <span class="font-medium text-white">${p.name}</span>
                        <div class="flex gap-2">
                            <button data-product-id="${p.id}" data-product-name="${p.name}" class="edit-btn p-2 text-slate-400 hover:text-cyan-400 transition-colors"><i data-lucide="file-pen-line" class="w-5 h-5"></i></button>
                            <button data-product-id="${p.id}" data-product-name="${p.name}" class="delete-btn p-2 text-slate-400 hover:text-red-500 transition-colors"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                        </div>
                    `;
                    container.appendChild(productEl);
                });
            }
            lucide.createIcons();
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
                
                // Đồng bộ và đặt giá trị ban đầu nếu rỗng hoặc không hợp lệ
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
                const productBatches = inventory.filter(item => item.productId === product.id && item.remainingQuantity >= 0); // Show even if 0
                const totalStock = productBatches.reduce((sum, item) => sum + item.remainingQuantity, 0);

                const productDiv = document.createElement('div');
                productDiv.className = 'bg-slate-700/50 p-4 rounded-lg';
                
                let tableRows = '';
                productBatches
                    .sort((a,b) => a.purchaseDate.seconds - b.purchaseDate.seconds) // FIFO display
                    .forEach(batch => {
                    tableRows += `
                        <tr class="border-b border-slate-600/50 last:border-0 hover:bg-slate-600/30">
                            <td class="p-2 text-slate-300">${formatDate(batch.purchaseDate)}</td>
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
                container.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">Không có đơn hàng nào trong khoảng thời gian này.</td></tr>';
                return;
            }
            
            salesData.sort((a,b) => b.saleDate.seconds - a.saleDate.seconds)
                .forEach(sale => {
                    const row = document.createElement('tr');
                    row.className = "border-b border-slate-700/50 last:border-0";
                    row.innerHTML = `
                        <td class="p-2 text-slate-300">${formatDate(sale.saleDate)}</td>
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
                const date = formatDate(sale.saleDate);
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

        // --- LOGIC SỬA, XÓA, THÊM ---
        document.getElementById('add-product-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const productNameInput = document.getElementById('product-name');
            const feedbackEl = document.getElementById('product-feedback');
            const productName = productNameInput.value.trim();
            
            feedbackEl.textContent = ''; 

            if (!productName || !storeId) return;
            
            const isDuplicate = products.some(p => p.name.toLowerCase() === productName.toLowerCase());

            if (isDuplicate) {
                feedbackEl.textContent = `Sản phẩm "${productName}" đã tồn tại.`;
                feedbackEl.className = 'text-yellow-400 text-sm h-5';
                return; 
            }
            
            const button = e.target.querySelector('button');
            button.disabled = true;
            try {
                await addDoc(collection(db, `stores/${storeId}/products`), {
                    name: productName,
                    createdAt: Timestamp.now(),
                });
                productNameInput.value = '';
                feedbackEl.textContent = `Đã thêm "${productName}"!`;
                feedbackEl.className = 'text-green-400 text-sm h-5';
                setTimeout(() => { feedbackEl.textContent = '' }, 3000);
            } catch (error) {
                console.error("Lỗi khi thêm sản phẩm:", error);
                feedbackEl.textContent = 'Lỗi: Không thể thêm sản phẩm.';
                feedbackEl.className = 'text-red-400 text-sm h-5';
            } finally {
                button.disabled = false;
            }
        });
        
        // Xử lý click Sửa/Xóa
        document.getElementById('product-list-container').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-btn');
            const deleteBtn = e.target.closest('.delete-btn');

            if (editBtn) {
                const productId = editBtn.dataset.productId;
                const productName = editBtn.dataset.productName;
                document.getElementById('edit-product-id').value = productId;
                document.getElementById('edit-product-name').value = productName;
                document.getElementById('edit-product-feedback').textContent = '';
                editProductModal.classList.remove('hidden');
            }

            if (deleteBtn) {
                const productId = deleteBtn.dataset.productId;
                const productName = deleteBtn.dataset.productName;
                document.getElementById('delete-product-name').textContent = productName;
                deleteProductModal.dataset.productId = productId; // Lưu id vào modal
                deleteProductModal.classList.remove('hidden');
            }
        });

        // Form sửa sản phẩm
        document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const productId = document.getElementById('edit-product-id').value;
            const newName = document.getElementById('edit-product-name').value.trim();
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
                await updateDoc(productRef, { name: newName });
                editProductModal.classList.add('hidden');
            } catch (error) {
                console.error("Lỗi khi sửa sản phẩm:", error);
                feedbackEl.textContent = 'Lỗi: Không thể lưu thay đổi.';
                feedbackEl.className = 'text-red-400 text-sm h-5';
            }
        });

        // Nút hủy sửa
        document.getElementById('cancel-edit-btn').addEventListener('click', () => editProductModal.classList.add('hidden'));

        // Nút xác nhận xóa
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
                console.error("Lỗi khi xóa sản phẩm và dữ liệu liên quan:", error);
                alert("Đã xảy ra lỗi nghiêm trọng khi xóa sản phẩm. Vui lòng thử lại.");
            }
        });

        // Nút hủy xóa
        document.getElementById('cancel-delete-btn').addEventListener('click', () => deleteProductModal.classList.add('hidden'));


        document.getElementById('add-inventory-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const productId = document.getElementById('inventory-product-select').value;
            const quantity = Number(document.getElementById('inventory-quantity').value);
            const price = Number(document.getElementById('inventory-price').value);
            const dateValue = document.getElementById('inventory-date').value;
            const productName = products.find(p => p.id === productId)?.name;

            if (!productId || !productName || !quantity || price < 0 || !dateValue || !storeId) {
                alert("Vui lòng chọn một sản phẩm hợp lệ bằng cách nhấp chọn từ danh sách gợi ý.");
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
                renderProductSelects(); // Khởi tạo lại ô tìm kiếm và dropdown về mặc định
            } catch (error) {
                console.error("Lỗi khi nhập kho:", error);
                alert("Đã xảy ra lỗi khi nhập kho.");
            } finally {
                button.disabled = false;
            }
        });

        // Tách logic tạo đơn hàng để tái sử dụng
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

            if (!saleDetails.productId || !saleDetails.quantityToSell || saleDetails.sellingPrice < 0 || !saleDetails.dateValue || !storeId) {
                alert("Vui lòng chọn một sản phẩm hợp lệ bằng cách nhấp chọn từ danh sách gợi ý.");
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
                renderProductSelects(); // Khởi tạo lại ô tìm kiếm và dropdown về mặc định
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

        // --- THIẾT LẬP & GỢI Ý GIÁ ---
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

            // Tính giá vốn bình quân
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
            
            // Tính giá bán gợi ý với lợi nhuận
            const suggestedPrice = averageCost * (1 + ((businessConfig.profitMargin || 0) / 100));
            
            suggestedPriceEl.textContent = formatCurrency(suggestedPrice);
        }

        function initializeTabs() {
            const tabsContainer = document.getElementById('main-tabs');
            const tabPanes = document.querySelectorAll('#tab-content .tab-pane');
            const tabBtns = document.querySelectorAll('#main-tabs .tab-btn');

            // Set default tab
            const defaultTab = 'sales';
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

                // Update buttons
                tabBtns.forEach(btn => {
                    btn.classList.remove('text-white', 'border-cyan-500');
                    btn.classList.add('text-slate-400', 'border-transparent');
                });
                clickedBtn.classList.add('text-white', 'border-cyan-500');
                clickedBtn.classList.remove('text-slate-400', 'border-transparent');

                // Update panes
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
                const date = formatDate(sale.saleDate);
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
                            labels: {
                                color: '#cbd5e1'
                            }
                        },
                         tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += formatCurrency(context.parsed.y);
                                    }
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
                                callback: function(value, index, ticks) {
                                    return formatCurrency(value);
                                }
                            },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    }
                }
            });
        }

        // Mở modal sửa lô hàng
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

        // Form sửa lô hàng
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
        
        // Nút hủy sửa lô hàng
        document.getElementById('cancel-edit-inventory-btn').addEventListener('click', () => editInventoryModal.classList.add('hidden'));

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
            reportWindow.document.write(`<h2>Từ ${formatDate(Timestamp.fromDate(startDate))} đến ${formatDate(Timestamp.fromDate(endDate))}</h2>`);
            reportWindow.document.write(`<h3>Tổng lợi nhuận trong kỳ: ${formatCurrency(totalProfit)}</h3>`);
            
            // Sales Details Table
            reportWindow.document.write('<h4>Chi tiết bán hàng</h4>');
            let salesTable = '<table><thead><tr><th>Ngày bán</th><th>Sản phẩm</th><th>SL</th><th>Giá vốn/SP</th><th>Giá bán/SP</th><th>Lợi nhuận</th></tr></thead><tbody>';
            filteredSales.forEach(sale => {
                salesTable += `<tr>
                    <td>${formatDate(sale.saleDate)}</td>
                    <td>${sale.productName}</td>
                    <td style="text-align:right">${sale.quantitySold}</td>
                    <td style="text-align:right">${formatCurrency(sale.cogsPerItem)}</td>
                    <td style="text-align:right">${formatCurrency(sale.sellingPrice)}</td>
                    <td style="text-align:right">${formatCurrency(sale.profit)}</td>
                </tr>`;
            });
            salesTable += '</tbody></table>';
            reportWindow.document.write(salesTable);

            // Daily Profit Table
            reportWindow.document.write('<h4>Lợi nhuận theo ngày</h4>');
            const dailyProfits = filteredSales.reduce((acc, sale) => {
                const date = formatDate(sale.saleDate);
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

        // =================================================================
        // == [MỚI] LOGIC SỬA/XÓA ĐƠN HÀNG
        // =================================================================

        // Tách logic xóa đơn hàng để tái sử dụng
        async function deleteSale(saleId) {
            const saleToDelete = sales.find(s => s.id === saleId);
            if (!saleToDelete) {
                throw new Error("Không tìm thấy đơn hàng để xóa.");
            }

            const batch = writeBatch(db);

            // Hoàn trả số lượng vào kho
            let quantityToReturn = saleToDelete.quantitySold;
            const relatedBatches = inventory
                .filter(b => b.productId === saleToDelete.productId)
                .sort((a, b) => b.purchaseDate.seconds - a.purchaseDate.seconds); // Ưu tiên hoàn trả vào lô mới nhất

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

            if (quantityToReturn > 0) {
                // Trường hợp này hiếm khi xảy ra nếu dữ liệu nhất quán
                // nhưng nó xử lý trường hợp không có đủ chỗ trống trong các lô hiện có
                console.warn(`Không thể hoàn trả đủ ${quantityToReturn} sản phẩm vào kho. Có thể do lô hàng đã bị thay đổi.`);
            }

            // Xóa đơn hàng
            const saleRef = doc(db, `stores/${storeId}/sales`, saleId);
            batch.delete(saleRef);

            return batch.commit();
        }

        // Sự kiện click trên bảng Lịch sử bán hàng
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

        // Hủy Xóa/Sửa Đơn Hàng
        document.getElementById('cancel-delete-sale-btn').addEventListener('click', () => deleteSaleModal.classList.add('hidden'));
        document.getElementById('cancel-edit-sale-btn').addEventListener('click', () => editSaleModal.classList.add('hidden'));

        // Xác nhận xóa đơn hàng
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
        
        // Form sửa đơn hàng (Xóa cái cũ, tạo cái mới)
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

            // Kiểm tra số lượng hợp lệ
            const currentStock = inventory
                .filter(item => item.productId === originalSale.productId)
                .reduce((sum, item) => sum + item.remainingQuantity, 0);
            const maxAllowedQuantity = currentStock + originalSale.quantitySold;

            if (newSaleDetails.quantityToSell > maxAllowedQuantity) {
                feedbackEl.textContent = `Lỗi: Số lượng bán không thể vượt quá ${maxAllowedQuantity} (tồn kho hiện tại + số lượng hoàn lại).`;
                feedbackEl.className = 'text-red-400 text-sm h-5';
                return;
            }

            const button = e.target.querySelector('button[type="submit"]');
            button.disabled = true;

            try {
                // Thực hiện xóa đơn hàng cũ (hoàn kho)
                await deleteSale(saleId);
                // Tạo đơn hàng mới với thông tin đã sửa
                await createSale(newSaleDetails);
                
                editSaleModal.classList.add('hidden');
            } catch (error) {
                console.error("Lỗi khi cập nhật đơn hàng:", error);
                feedbackEl.textContent = `Lỗi: ${error.message}`;
                feedbackEl.className = 'text-red-400 text-sm h-5';
                // Cảnh báo: Nếu bước tạo mới thất bại, đơn hàng cũ đã bị xóa.
                // Cần thông báo cho người dùng kiểm tra lại.
                alert("Đã xảy ra lỗi trong quá trình cập nhật. Đơn hàng gốc đã được xóa để hoàn kho, vui lòng kiểm tra và tạo lại đơn hàng mới nếu cần.");
            } finally {
                button.disabled = false;
            }
        });


        function initializeAppData(currentStoreId) {
            storeId = currentStoreId;
            document.getElementById('store-id-display').textContent = storeId;
            document.getElementById('store-id-display-container').classList.remove('hidden');
            
            signInAnonymously(auth).then(() => {
                setDefaultDates(); 
                initializeTabs();
                initializeReportFilters();
                
                // Khởi tạo Custom Searchable Selects
                setupSearchableSelect('sale-product-search', 'sale-product-dropdown', 'sale-product-select', () => {
                    updateSaleFormAvailability();
                });

                setupSearchableSelect('inventory-product-search', 'inventory-product-dropdown', 'inventory-product-select', () => {
                    // Xử lý khi đổi sản phẩm ở nhập kho (nếu cần)
                });

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


                // Lắng nghe thay đổi của config
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

                loader.classList.add('hidden');
                mainContent.classList.remove('hidden');
            }).catch(err => {
                 console.error("Lỗi đăng nhập ẩn danh:", err);
                 loader.innerHTML = "Không thể kết nối tới dịch vụ xác thực. Vui lòng kiểm tra lại cấu hình Firebase và Quy tắc Bảo mật (Security Rules).";
            });
        }

        // Tự động khởi chạy với Store ID cố định
        initializeAppData(storeId);
    }
});
