document.addEventListener('DOMContentLoaded', () => {
    // --- FIREBASE CONFIGURATION ---
    const firebaseConfig = {
        apiKey: "AIzaSyDXZPDbDZvG-CCW-8gjbQ14gehlxIspJaQ",
        authDomain: "tayongtracker.firebaseapp.com",
        projectId: "tayongtracker",
        storageBucket: "tayongtracker.appspot.com",
        messagingSenderId: "986883833587",
        appId: "1:9868833587:web:2b234bf1d453651bc28186",
        measurementId: "G-YVJHH89S24"
    };

    // --- FIREBASE INITIALIZATION ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const provider = new firebase.auth.GoogleAuthProvider();

    // --- GLOBAL STATE & UTILITIES ---
    let transactions = [];
    let budgets = {}; // State untuk menyimpan data budget bulanan
    let weeklyBudgets = {}; // State untuk menyimpan budget mingguan
    let dailyBudgets = {}; // State untuk menyimpan budget harian
    let currentUser = null;
    let unsubscribe = null; // Untuk melepaskan listener Firestore
    let dashboardFilterText = '';
    let dashboardFilterDate = '';
    let dashboardChartInstance = null;
    
    // Kategori untuk tab "Umum"
    let allCategories = ['Bulanan', 'Mingguan', 'Saved', 'Mumih', 'Darurat', 'Jajan di luar', 'Tayong harian', 'Tayong weekend', 'Tayong fleksibel'];
    let monthlyBudgetCategories = ['Bulanan', 'Mumih', 'Darurat', 'Jajan di luar', 'Saved', 'Tayong weekend', 'Tayong fleksibel'];
    let weeklyBudgetCategories = ['Mingguan', 'Tayong harian', 'Belanja Mingguan', 'Tayong jajan'];
    const allBudgetCategories = [...new Set([...monthlyBudgetCategories, ...weeklyBudgetCategories])];

    // Pagination state
    let currentPage = 1;
    const itemsPerPage = 10;

    const formatCurrency = (amount) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() + userTimezoneOffset).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const setDefaultDate = (inputElement) => {
        inputElement.value = new Date().toISOString().slice(0, 10);
    };

    // --- FUNGSI BARU UNTUK MENDAPATKAN BULAN BERJALAN ---
    const getCurrentMonthAndYear = () => {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    };
    
    // --- FUNGSI BARU UNTUK MENDAPATKAN TANGGAL BERJALAN ---
    const getCurrentDateKey = () => {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // --- FUNGSI UNTUK MENDAPATKAN NOMOR MINGGU BERDASARKAN TANGGAL DI BULAN BERJALAN ---
    const getWeekNumberInMonth = (d) => {
      const firstDayOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      const firstDayOfWeek = firstDayOfMonth.getDay(); // 0 = Minggu, 1 = Senin, dst.
      const offset = (firstDayOfWeek === 0) ? 7 : firstDayOfWeek;
      return Math.ceil((d.getDate() + (offset - 1)) / 7);
    };
    
    // --- DOM ELEMENTS ---
    const authContainer = document.getElementById('authContainer');
    const loginPrompt = document.getElementById('loginPrompt');
    const loginBtn = document.getElementById('loginBtn');
    const mainContent = document.getElementById('mainContent');
    const dashboardSearch = document.getElementById('dashboardSearch');
    const dashboardDateFilter = document.getElementById('dashboardDateFilter');
    
    // Pagination elements
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const backToTopBtn = document.getElementById('backToTopBtn');

    // Elemen untuk budget
    const weeklyBudgetSummarySection = document.getElementById('weeklyBudgetSummarySection');
    const monthlyBudgetSummarySection = document.getElementById('monthlyBudgetSummarySection');
    const budgetContent = document.getElementById('budgetContent');
    const budgetForm = document.getElementById('budgetForm');
    const budgetInputsContainer = document.getElementById('budgetInputsContainer');
    
    // Elemen untuk manajemen kategori
    const tabCategoryManagement = document.getElementById('tabCategoryManagement');
    const categoryManagementContent = document.getElementById('categoryManagementContent');
    const addCategoryForm = document.getElementById('addCategoryForm');
    const newCategoryNameInput = document.getElementById('newCategoryName');
    // DOM Elements for new checkboxes
    const newCategoryMonthlyCheckbox = document.getElementById('newCategoryMonthly');
    const newCategoryWeeklyCheckbox = document.getElementById('newCategoryWeekly');
    const categoryListContainer = document.getElementById('categoryListContainer');
    // New DOM elements for adding existing categories
    const addExistingCategoryForm = document.getElementById('addExistingCategoryForm');
    const existingCategorySelect = document.getElementById('existingCategorySelect');
    const existingCategoryMonthlyCheckbox = document.getElementById('existingCategoryMonthly');
    const existingCategoryWeeklyCheckbox = document.getElementById('existingCategoryWeekly');
    
    // Elemen baru untuk Aksi Masal
    const tabBulkAction = document.getElementById('tabBulkAction');
    const bulkActionContent = document.getElementById('bulkActionContent');
    const bulkOldCategorySelect = document.getElementById('bulkOldCategory');
    const bulkNewCategorySelect = document.getElementById('bulkNewCategory');
    const bulkApplyBtn = document.getElementById('bulkApplyBtn');
    const bulkTransactionsList = document.getElementById('bulkTransactionsList');
    const bulkEmptyState = document.getElementById('bulkEmptyState');

    // --- AUTHENTICATION ---
    loginBtn.addEventListener('click', () => {
        auth.signInWithPopup(provider).catch(error => console.error("Login Gagal:", error));
    });

    const logout = () => {
        auth.signOut().catch(error => console.error("Logout Gagal:", error));
    };

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            loginPrompt.classList.add('hidden');
            mainContent.classList.remove('hidden');
            authContainer.innerHTML = `
                <div class="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
                    <img src="${user.photoURL}" alt="User Photo" class="w-10 h-10 rounded-full">
                    <button id="logoutBtn" class="mt-2 sm:mt-0 sm:ml-4 bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors text-sm">Logout</button>
                </div>
            `;
            document.getElementById('logoutBtn').addEventListener('click', logout);
            listenToData(user.uid);
        } else {
            currentUser = null;
            if (unsubscribe) unsubscribe();
            transactions = [];
            budgets = {};
            weeklyBudgets = {};
            dailyBudgets = {};
            renderAll();
            loginPrompt.classList.remove('hidden');
            mainContent.classList.add('hidden');
            authContainer.innerHTML = '';
        }
    });

    // --- FIRESTORE DATA HANDLING ---
    const saveDataToFirestore = async () => {
        if (!currentUser) return;
        try {
            const docRef = db.collection('users').doc(currentUser.uid);
            await docRef.set({ 
                transactions, 
                budgets, 
                weeklyBudgets, 
                dailyBudgets,
                allCategories,
                monthlyBudgetCategoriesOrder: monthlyBudgetCategories,
                weeklyBudgetCategoriesOrder: weeklyBudgetCategories
            }, { merge: true });
        } catch (error) {
            console.error("Error saving data:", error);
        }
    };
    
    const listenToData = (userId) => {
        if (unsubscribe) unsubscribe(); // Lepaskan listener sebelumnya
        const docRef = db.collection('users').doc(userId);
        unsubscribe = docRef.onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                transactions = data.transactions || [];
                budgets = data.budgets || {};
                weeklyBudgets = data.weeklyBudgets || {};
                dailyBudgets = data.dailyBudgets || {};
                allCategories = data.allCategories || allCategories;
                monthlyBudgetCategories = data.monthlyBudgetCategoriesOrder || monthlyBudgetCategories;
                weeklyBudgetCategories = data.weeklyBudgetCategoriesOrder || weeklyBudgetCategories;
            } else {
                transactions = [];
                budgets = {};
                weeklyBudgets = {};
                dailyBudgets = {};
                allCategories = ['Bulanan', 'Mingguan', 'Saved', 'Mumih', 'Darurat', 'Jajan di luar', 'Tayong harian', 'Tayong weekend', 'Tayong fleksibel'];
                monthlyBudgetCategories = ['Bulanan', 'Mumih', 'Darurat', 'Jajan di luar', 'Saved', 'Tayong weekend', 'Tayong fleksibel'];
                weeklyBudgetCategories = ['Mingguan', 'Tayong harian', 'Belanja Mingguan', 'Tayong jajan'];
                saveDataToFirestore();
            }
            renderAll();
        }, (error) => {
            console.error("Error getting real-time data: ", error);
        });
    };

    // --- RENDER ALL ---
    const renderAll = () => {
        renderSummary();
        renderWeeklyBudgetSummary();
        renderMonthlyBudgetSummary();
        renderTransactions();
        renderAllStats();
        updateCategorySelects();
        renderCategoryList();
        renderAddExistingCategoryDropdown(); // NEW: Call the function to render the existing categories dropdown
        renderBulkActionUI();
    }

    // --- TABS ---
    const tabDashboard = document.getElementById('tabDashboard');
    const tabWeeklyBudget = document.getElementById('tabWeeklyBudget');
    const tabMonthlyBudget = document.getElementById('tabMonthlyBudget');
    const tabBudget = document.getElementById('tabBudget');
    const tabStats = document.getElementById('tabStats');
    const tabBackup = document.getElementById('tabBackup');
    const dashboardContent = document.getElementById('dashboardContent');
    const weeklyBudgetContent = document.getElementById('weeklyBudgetContent');
    const monthlyBudgetContent = document.getElementById('monthlyBudgetContent');
    const statsContent = document.getElementById('statsContent');
    const budgetContentEl = document.getElementById('budgetContent');
    const backupContent = document.getElementById('backupContent');
    
    function switchTab(activeTab) {
        const isDashboard = activeTab === 'dashboard';
        const isWeeklyBudget = activeTab === 'weeklyBudget';
        const isMonthlyBudget = activeTab === 'monthlyBudget';
        const isBudget = activeTab === 'budget';
        const isStats = activeTab === 'stats';
        const isBackup = activeTab === 'backup';
        const isCategoryManagement = activeTab === 'categoryManagement';
        const isBulkAction = activeTab === 'bulkAction';

        tabDashboard.classList.toggle('active', isDashboard);
        tabWeeklyBudget.classList.toggle('active', isWeeklyBudget);
        tabMonthlyBudget.classList.toggle('active', isMonthlyBudget);
        tabBudget.classList.toggle('active', isBudget);
        tabStats.classList.toggle('active', isStats);
        tabBackup.classList.toggle('active', isBackup);
        tabCategoryManagement.classList.toggle('active', isCategoryManagement);
        tabBulkAction.classList.toggle('active', isBulkAction);

        dashboardContent.classList.toggle('hidden', !isDashboard);
        weeklyBudgetContent.classList.toggle('hidden', !isWeeklyBudget);
        monthlyBudgetContent.classList.toggle('hidden', !isMonthlyBudget);
        statsContent.classList.toggle('hidden', !isStats);
        budgetContentEl.classList.toggle('hidden', !isBudget);
        backupContent.classList.toggle('hidden', !isBackup);
        categoryManagementContent.classList.toggle('hidden', !isCategoryManagement);
        bulkActionContent.classList.toggle('hidden', !isBulkAction);

        // Reset filters and pagination when switching tabs
        if (isDashboard) {
            dashboardSearch.value = dashboardFilterText;
            dashboardDateFilter.value = dashboardFilterDate;
            renderTransactions();
        } else if (isBudget) {
            renderBudgetInputs();
        } else if (isStats) {
            renderAllStats();
        } else if (isWeeklyBudget) {
            renderWeeklyBudgetSummary();
        } else if (isMonthlyBudget) {
            renderMonthlyBudgetSummary();
        } else if (isCategoryManagement) {
            renderCategoryList();
            renderAddExistingCategoryDropdown();
        } else if (isBulkAction) {
            renderBulkActionUI();
        }
    }
    tabDashboard.addEventListener('click', () => switchTab('dashboard'));
    tabWeeklyBudget.addEventListener('click', () => switchTab('weeklyBudget'));
    tabMonthlyBudget.addEventListener('click', () => switchTab('monthlyBudget'));
    tabBudget.addEventListener('click', () => switchTab('budget'));
    tabStats.addEventListener('click', () => switchTab('stats'));
    tabBackup.addEventListener('click', () => switchTab('backup'));
    tabCategoryManagement.addEventListener('click', () => switchTab('categoryManagement'));
    tabBulkAction.addEventListener('click', () => switchTab('bulkAction'));

    // --- GENERIC CONFIRMATION MODAL ---
    const confirmationModal = document.getElementById('confirmationModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const cancelConfirm = document.getElementById('cancelConfirm');
    const confirmAction = document.getElementById('confirmAction');
    let actionToConfirm = null;
    let confirmationInput = null;

    function openConfirmationModal(config) {
        confirmTitle.textContent = config.title;
        confirmMessage.textContent = config.message;
        confirmAction.className = config.confirmClass;
        confirmAction.textContent = config.confirmText;
        
        // Atur actionToConfirm
        actionToConfirm = config.action;

        // Handle input field for editing
        if (config.showInput) {
            if (!confirmationInput) {
                confirmationInput = document.createElement('input');
                confirmationInput.type = 'text';
                confirmationInput.className = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500';
                confirmationInput.placeholder = config.inputPlaceholder;
            }
            confirmationInput.value = config.inputValue || '';
            confirmMessage.insertAdjacentElement('afterend', confirmationInput);
        } else {
            if (confirmationInput) {
                confirmationInput.remove();
                confirmationInput = null;
            }
        }
        
        confirmationModal.classList.remove('hidden');
    }
    function closeConfirmationModal() {
        confirmationModal.classList.add('hidden');
        actionToConfirm = null;
    };
    
    // Perbaiki event listener untuk modal konfirmasi
    confirmAction.onclick = () => {
        if (actionToConfirm && typeof actionToConfirm === 'function') {
            const inputVal = confirmationInput ? confirmationInput.value.trim() : null;
            actionToConfirm(inputVal);
        }
        closeConfirmationModal();
    };

    cancelConfirm.onclick = closeConfirmationModal;
    confirmationModal.addEventListener('click', (e) => { if (e.target === confirmationModal) closeConfirmationModal(); });
    
    // --- DASHBOARD (UMUM) LOGIC ---
    const paymentTypes = ['Cash', 'Gopay'];
    const categoryColors = { 
        'Belanja Bulanan': 'bg-red-100 text-red-800',
        'Belanja Mingguan': 'bg-orange-100 text-orange-800',
        'Saved': 'bg-gray-100 text-gray-800',
        'Mumih': 'bg-blue-100 text-blue-800',
        'Darurat': 'bg-purple-100 text-purple-800',
        'Jajan di luar': 'bg-yellow-100 text-yellow-800',
        'Dana Cadangan': 'bg-indigo-100 text-indigo-800', // New color for combined card
        'Tayong harian': 'bg-green-100 text-green-800', // New color for Harian
        'Tayong weekend': 'bg-pink-100 text-pink-800', // New color for Weekend
        'Tayong fleksibel': 'bg-sky-100 text-sky-800', // New color for Fleksibel
        'Tidak Terkategori': 'bg-gray-400 text-gray-900', // New color for 'Tidak Terkategori'
        'Belanja': 'bg-fuchsia-100 text-fuchsia-800',
        'Transportasi': 'bg-lime-100 text-lime-800',
        'Makanan': 'bg-cyan-100 text-cyan-800',
        'Hiburan': 'bg-violet-100 text-violet-800',
        'Kesehatan': 'bg-rose-100 text-rose-800',
        'Pendidikan': 'bg-teal-100 text-teal-800',
        'Tagihan': 'bg-amber-100 text-amber-800'
    };
    const availableColors = ['bg-fuchsia-100 text-fuchsia-800', 'bg-lime-100 text-lime-800', 'bg-cyan-100 text-cyan-800', 'bg-violet-100 text-violet-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800', 'bg-amber-100 text-amber-800', 'bg-emerald-100 text-emerald-800', 'bg-indigo-100 text-indigo-800', 'bg-pink-100 text-pink-800'];
    const getCategoryColor = (category) => {
        let color = categoryColors[category];
        if (!color) {
            const assignedColors = Object.values(categoryColors);
            const available = availableColors.filter(c => !assignedColors.includes(c));
            color = available.length > 0 ? available[0] : 'bg-gray-100 text-gray-800';
            categoryColors[category] = color;
        }
        return color;
    };
    let transactionToEditIndex = null;
    const summarySection = document.getElementById('summarySection');
    const dashboardTransactionContainer = document.getElementById('dashboardTransactionContainer');
    const emptyState = document.getElementById('emptyState');
    const addTransactionModal = document.getElementById('addTransactionModal');
    const openTransactionModalBtn = document.getElementById('openTransactionModalBtn');
    const closeTransactionModalBtn = document.getElementById('closeTransactionModalBtn');
    const transactionForm = document.getElementById('transactionForm');
    const modalTitle = document.getElementById('modalTitle');
    const submitTransactionBtn = document.getElementById('submitTransactionBtn');
    const dateInput = document.getElementById('date');
    const categorySelect = document.getElementById('category');
    const detailInput = document.getElementById('detail');
    const amountInput = document.getElementById('amount');
    const paymentSelect = document.getElementById('payment');

    const renderSummary = () => {
        summarySection.innerHTML = '';
        
        // Filter transaksi untuk bulan berjalan
        const currentMonthAndYear = getCurrentMonthAndYear();
        const currentMonthTransactions = transactions.filter(t => t.date.startsWith(currentMonthAndYear));

        // Tambahkan kartu Total Pengeluaran terlebih dahulu
        const totalExpenses = currentMonthTransactions.reduce((sum, t) => sum + t.amount, 0);
        const totalExpensesCard = document.createElement('div');
        totalExpensesCard.className = 'summary-card bg-red-50 border-l-4 border-red-500';
        totalExpensesCard.innerHTML = `<h3 class="font-semibold text-red-700">Total Pengeluaran</h3><p id="totalExpenses" class="text-xl font-bold mt-2 text-red-800">${formatCurrency(totalExpenses)}</p>`;
        summarySection.appendChild(totalExpensesCard);
    };

    // --- FUNGSI BARU UNTUK MENGHITUNG PENGELUARAN UNTUK KATEGORI DAN MINGGU TERTENTU ---
    const getWeeklyTotalForCategory = (category, weekNumber, currentMonthAndYear) => {
        return transactions.filter(t => {
            const txDate = new Date(t.date);
            const txWeekNumber = getWeekNumberInMonth(txDate);
            const txMonthAndYear = `${txDate.getFullYear()}-${(txDate.getMonth() + 1).toString().padStart(2, '0')}`;
            // Memastikan transaksi di minggu ke-5 dialokasikan ke minggu ke-4
            const adjustedWeekNumber = (txWeekNumber === 5) ? 4 : txWeekNumber;
            return t.category === category && adjustedWeekNumber === weekNumber && txMonthAndYear === currentMonthAndYear;
        }).reduce((sum, t) => sum + t.amount, 0);
    };

    // --- LOGIKA BARU UNTUK MENGAMBIL BUDGET MINGGUAN DENGAN LEBIH BAIK ---
    const getWeeklyBudgetForCategory = (category, weekNumber, currentMonthAndYear) => {
        const weekKey = `${currentMonthAndYear}-W${weekNumber}`;
        if (weeklyBudgets[category] && weeklyBudgets[category][weekKey]) {
            return weeklyBudgets[category][weekKey];
        }
        return 0;
    };
    
    // --- PERBAIKAN LOGIKA RENDER DI SINI ---
    const renderWeeklyBudgetSummary = () => {
        weeklyBudgetSummarySection.innerHTML = '';
        const today = new Date();
        const currentMonthAndYear = getCurrentMonthAndYear();
        
        // Kategori yang akan memiliki kartu perminggu
        const categoriesWithWeeklyCards = ['Belanja Mingguan', 'Tayong jajan'];
        
        // Gabungkan kategori mingguan lainnya
        const otherWeeklyCategories = ['Mingguan', 'Tayong harian'];
        
        // Pastikan semua kategori yang seharusnya ditampilkan per minggu ada
        const allWeeklyCards = [...categoriesWithWeeklyCards, ...otherWeeklyCategories];
        
        // Urutkan kartu berdasarkan urutan yang tersimpan di weeklyBudgetCategories
        const orderedCategories = weeklyBudgetCategories.filter(cat => allWeeklyCards.includes(cat));

        orderedCategories.forEach(category => {
            if (categoriesWithWeeklyCards.includes(category)) {
                // Render 4 kartu per minggu untuk Belanja Mingguan dan Tayong jajan
                for (let i = 1; i <= 4; i++) {
                    const total = getWeeklyTotalForCategory(category, i, currentMonthAndYear);
                    const budget = getWeeklyBudgetForCategory(category, i, currentMonthAndYear);
                    const remaining = budget - total;
                    const remainingColor = remaining >= 0 ? 'text-green-600' : 'text-red-600';
                    
                    const card = document.createElement('div');
                    card.className = 'summary-card relative';
                    card.setAttribute('draggable', 'true');
                    card.dataset.category = category;
                    card.dataset.week = i; // Tambahkan data atribut untuk minggu
                    card.innerHTML = `
                        <h3 class="font-semibold text-slate-500">${category} - Minggu ${i}</h3>
                        <p class="amount-text text-slate-800">${formatCurrency(total)}</p>
                        <div class="border-t border-dashed mt-2 pt-2">
                            <p class="text-xs font-semibold text-slate-500">Budget: ${formatCurrency(budget)}</p>
                            <p class="text-xs font-bold ${remainingColor}">Sisa: ${formatCurrency(remaining)}</p>
                        </div>
                        <button class="remove-card-btn text-red-500 hover:text-red-700 absolute top-2 right-2" data-category="${category}" data-type="weekly" title="Hapus Kartu">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    `;
                    weeklyBudgetSummarySection.appendChild(card);
                }
            } else if (otherWeeklyCategories.includes(category)) {
                // Render kartu tunggal untuk kategori mingguan lainnya
                let total = 0;
                if (category === 'Tayong harian') {
                    total = transactions.filter(t => t.category === category && t.date === getCurrentDateKey()).reduce((sum, t) => sum + t.amount, 0);
                } else {
                    total = transactions.filter(t => {
                        const txDate = new Date(t.date);
                        const txWeekNumber = getWeekNumberInMonth(txDate);
                        const currentWeekNumber = getWeekNumberInMonth(today);
                        const txWeekKey = `${txDate.getFullYear()}-${(txDate.getMonth() + 1).toString().padStart(2, '0')}-W${txWeekNumber}`;
                        const currentWeekKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-W${currentWeekNumber}`;
                        return t.category === category && txWeekKey === currentWeekKey;
                    }).reduce((sum, t) => sum + t.amount, 0);
                }
                
                let budget = 0;
                if (category === 'Tayong harian') {
                    budget = dailyBudgets[getCurrentDateKey()] || 0;
                } else {
                    const currentWeekNumber = getWeekNumberInMonth(today);
                    const currentMonthAndYearForOther = getCurrentMonthAndYear();
                    const weekKey = `${currentMonthAndYearForOther}-W${currentWeekNumber}`;
                    budget = weeklyBudgets[category] && weeklyBudgets[category][weekKey] ? weeklyBudgets[category][weekKey] : 0;
                }
                
                const remaining = budget - total;
                const remainingColor = remaining >= 0 ? 'text-green-600' : 'text-red-600';
                const card = document.createElement('div');
                card.className = 'summary-card relative';
                card.setAttribute('draggable', 'true');
                card.dataset.category = category; // Add a data attribute for drag and drop
                card.innerHTML = `
                    <h3 class="font-semibold text-slate-500">${category}</h3>
                    <p class="amount-text text-slate-800">${formatCurrency(total)}</p>
                    <div class="border-t border-dashed mt-2 pt-2">
                        <p class="text-xs font-semibold text-slate-500">Budget: ${formatCurrency(budget)}</p>
                        <p class="text-xs font-bold ${remainingColor}">Sisa: ${formatCurrency(remaining)}</p>
                    </div>
                    <button class="remove-card-btn text-red-500 hover:text-red-700 absolute top-2 right-2" data-category="${category}" data-type="weekly" title="Hapus Kartu">
                        <i class="fas fa-times-circle"></i>
                    </button>
                `;
                weeklyBudgetSummarySection.appendChild(card);
            }
        });
        addDragAndDropEventListeners(weeklyBudgetSummarySection, 'weekly');
    };
    
    // --- AKHIR PERBAIKAN LOGIKA RENDER ---

    const renderMonthlyBudgetSummary = () => {
        monthlyBudgetSummarySection.innerHTML = '';
        const currentMonthAndYear = getCurrentMonthAndYear();
        const currentMonthTransactions = transactions.filter(t => t.date.startsWith(currentMonthAndYear));

        const allMonthlyCategories = monthlyBudgetCategories;
        allMonthlyCategories.forEach(category => {
            let total = 0;
            const card = document.createElement('div');
            card.className = 'summary-card';
            card.setAttribute('draggable', 'true');
            card.dataset.category = category; // Add a data attribute for drag and drop
            
            if (category === 'Dana Cadangan') {
                const savedTotal = currentMonthTransactions.filter(t => t.category === 'Saved').reduce((sum, t) => sum + t.amount, 0);
                const daruratTotal = currentMonthTransactions.filter(t => t.category === 'Darurat').reduce((sum, t) => sum + t.amount, 0);
                total = savedTotal + daruratTotal;
                
                card.innerHTML = `
                    <h3 class="font-semibold text-slate-500">${category}</h3>
                    <p class="amount-text text-slate-800">${formatCurrency(total)}</p>
                    <div class="border-t border-dashed mt-2 pt-2">
                        <p class="text-xs font-semibold text-slate-500">Saldo Saved: ${formatCurrency(savedTotal)}</p>
                        <p class="text-xs font-semibold text-slate-500">Saldo Darurat: ${formatCurrency(daruratTotal)}</p>
                        <button class="remove-card-btn text-red-500 hover:text-red-700 absolute top-2 right-2" data-category="${category}" data-type="monthly" title="Hapus Kartu">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    </div>
                `;
            } else if (category === 'Saved' || category === 'Darurat') {
                total = currentMonthTransactions.filter(t => t.category === category).reduce((sum, t) => sum + t.amount, 0);

                card.innerHTML = `
                    <h3 class="font-semibold text-slate-500">${category}</h3>
                    <p class="amount-text text-slate-800">${formatCurrency(total)}</p>
                    <button class="remove-card-btn text-red-500 hover:text-red-700 absolute top-2 right-2" data-category="${category}" data-type="monthly" title="Hapus Kartu">
                        <i class="fas fa-times-circle"></i>
                    </button>
                `;
            } else {
                total = currentMonthTransactions.filter(t => t.category === category).reduce((sum, t) => sum + t.amount, 0);

                const budget = budgets[category] || 0;
                const remaining = budget - total;
                const remainingColor = remaining >= 0 ? 'text-green-600' : 'text-red-600';

                card.innerHTML = `
                    <h3 class="font-semibold text-slate-500">${category}</h3>
                    <p class="amount-text text-slate-800">${formatCurrency(total)}</p>
                    <div class="border-t border-dashed mt-2 pt-2">
                        <p class="text-xs font-semibold text-slate-500">Budget: ${formatCurrency(budget)}</p>
                        <p class="text-xs font-bold ${remainingColor}">Sisa: ${formatCurrency(remaining)}</p>
                        <button class="remove-card-btn text-red-500 hover:text-red-700 absolute top-2 right-2" data-category="${category}" data-type="monthly" title="Hapus Kartu">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    </div>
                `;
            }
            monthlyBudgetSummarySection.appendChild(card);
        });
        addDragAndDropEventListeners(monthlyBudgetSummarySection, 'monthly');
    };
    
    // Fungsi untuk menambah event listener drag-and-drop
    function addDragAndDropEventListeners(container, type) {
        let draggedItem = null;

        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('summary-card')) {
                draggedItem = e.target;
                setTimeout(() => {
                    draggedItem.classList.add('dragging');
                }, 0);
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(container, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (afterElement == null) {
                container.appendChild(draggable);
            } else {
                container.insertBefore(draggable, afterElement);
            }
        });

        container.addEventListener('dragend', () => {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
            // Get the new order of categories and save it to Firestore
            const newOrder = Array.from(container.children).map(child => child.dataset.category);
            if (type === 'monthly') {
                monthlyBudgetCategories = newOrder;
            } else if (type === 'weekly') {
                weeklyBudgetCategories = newOrder;
            }
            saveDataToFirestore();
        });

        const getDragAfterElement = (container, y) => {
            const draggableElements = [...container.querySelectorAll('.summary-card:not(.dragging)')];

            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        };
    }

    const renderTransactions = () => {
        const lowercasedFilter = dashboardFilterText.toLowerCase();
        const filteredTransactions = transactions.filter(t => {
            const matchesText = t.detail.toLowerCase().includes(lowercasedFilter) ||
                                t.category.toLowerCase().includes(lowercasedFilter) ||
                                t.payment.toLowerCase().includes(lowercasedFilter);
            const matchesDate = dashboardFilterDate === '' || t.date === dashboardFilterDate;
            return matchesText && matchesDate;
        });

        filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const groupedByDate = filteredTransactions.reduce((acc, t) => {
            (acc[t.date] = acc[t.date] || []).push(t);
            return acc;
        }, {});
        
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));
        
        const totalPages = Math.ceil(sortedDates.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const datesToDisplay = sortedDates.slice(startIndex, endIndex);

        dashboardTransactionContainer.innerHTML = '';
        emptyState.classList.toggle('hidden', datesToDisplay.length > 0);

        datesToDisplay.forEach(date => {
            const dailyTransactions = groupedByDate[date];
            const dailyTotal = dailyTransactions.reduce((sum, t) => sum + t.amount, 0);
            const dailyCard = document.createElement('div');
            dailyCard.className = 'bg-white p-4 rounded-xl shadow-lg border-2 border-slate-200 mb-4';
            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-2 pb-2 border-b border-slate-200';
            header.innerHTML = `
                <div>
                    <h3 class="font-bold text-slate-800">${formatDate(date)}</h3>
                </div>
                <div>
                    <span class="text-sm text-slate-500">Pengeluaran: </span>
                    <span class="font-bold text-red-600">${formatCurrency(dailyTotal)}</span>
                </div>
            `;
            dailyCard.appendChild(header);

            dailyTransactions.forEach(t => {
                const transactionItem = document.createElement('div');
                transactionItem.className = 'flex justify-between items-center py-2 border-b border-slate-100 last:border-b-0';
                transactionItem.innerHTML = `
                    <div class="flex items-center gap-3 flex-grow">
                        <span class="px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(t.category)}">${t.category}</span>
                        <div class="flex-grow">
                            <p class="font-semibold text-slate-800">${t.detail}</p>
                            <p class="text-xs text-slate-500">${t.payment}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-red-600 text-sm">${formatCurrency(t.amount)}</span>
                        <button data-id="${t.id}" class="edit-btn text-sky-500 hover:text-sky-700 mr-2"><i class="fas fa-edit"></i></button>
                        <button data-id="${t.id}" class="delete-btn text-red-500 hover:text-red-700"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                dailyCard.appendChild(transactionItem);
            });
            dashboardTransactionContainer.appendChild(dailyCard);
        });

        // Update pagination controls
        pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages || 1}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    };
    
    // Event listeners for pagination buttons
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTransactions();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const lowercasedFilter = dashboardFilterText.toLowerCase();
        const filteredTransactions = transactions.filter(t => {
            const matchesText = t.detail.toLowerCase().includes(lowercasedFilter) ||
                                t.category.toLowerCase().includes(lowercasedFilter) ||
                                t.payment.toLowerCase().includes(lowercasedFilter);
            const matchesDate = dashboardFilterDate === '' || t.date === dashboardDateFilter.value;
            return matchesText && matchesDate;
        });
        
        const groupedByDate = filteredTransactions.reduce((acc, t) => {
            (acc[t.date] = acc[t.date] || []).push(t);
            return acc;
        }, {});
        const totalPages = Math.ceil(Object.keys(groupedByDate).length / itemsPerPage);

        if (currentPage < totalPages) {
            currentPage++;
            renderTransactions();
        }
    });

    const openAddModal = () => {
        transactionToEditIndex = null;
        transactionForm.reset();
        setDefaultDate(dateInput);
        modalTitle.textContent = 'Tambah Transaksi Baru';
        submitTransactionBtn.innerHTML = `<i class="fas fa-save mr-2"></i>Simpan Transaksi`;
        addTransactionModal.classList.remove('hidden');
        updateCategorySelects();
    };
    const openEditModal = (id) => {
        transactionToEditIndex = transactions.findIndex(t => t.id == id);
        if(transactionToEditIndex === -1) return;
        const tx = transactions[transactionToEditIndex];
        dateInput.value = tx.date; categorySelect.value = tx.category; detailInput.value = tx.detail;
        amountInput.value = tx.amount; paymentSelect.value = tx.payment;
        modalTitle.textContent = 'Edit Transaksi';
        submitTransactionBtn.innerHTML = `<i class="fas fa-save mr-2"></i>Update Transaksi`;
        addTransactionModal.classList.remove('hidden');
        updateCategorySelects();
    };
    const closeTransactionModal = () => addTransactionModal.classList.add('hidden');
    transactionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const transactionData = { date: dateInput.value, category: categorySelect.value, detail: detailInput.value, amount: parseFloat(amountInput.value), payment: paymentSelect.value };
        if (transactionToEditIndex !== null && transactionToEditIndex > -1) {
            transactions[transactionToEditIndex] = { ...transactions[transactionToEditIndex], ...transactionData };
        } else {
            transactions.unshift({ ...transactionData, id: Date.now() });
        }
        saveDataToFirestore();
        closeTransactionModal();
    });
    
    dashboardTransactionContainer.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        if (editButton) return openEditModal(editButton.dataset.id);
        const deleteButton = e.target.closest('.delete-btn');
        if (deleteButton) {
            const id = deleteButton.dataset.id;
            openConfirmationModal({
                title: 'Konfirmasi Hapus', message: 'Apakah Anda yakin ingin menghapus transaksi ini?',
                confirmText: 'Hapus', confirmClass: 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors',
                action: () => { transactions = transactions.filter(t => t.id != id); saveDataToFirestore(); }
            });
        }
    });
    dashboardSearch.addEventListener('input', e => {
        dashboardFilterText = e.target.value;
        currentPage = 1;
        renderTransactions();
    });
    dashboardDateFilter.addEventListener('change', e => {
        dashboardFilterDate = e.target.value;
        currentPage = 1;
        renderTransactions();
    });

    // Perbarui dropdown kategori
    const updateCategorySelects = () => {
        const categorySelectEl = document.getElementById('category');
        categorySelectEl.innerHTML = '';
        allCategories.forEach(cat => categorySelectEl.add(new Option(cat, cat)));
    }
    paymentTypes.forEach(pay => paymentSelect.add(new Option(pay, pay)));
    openTransactionModalBtn.addEventListener('click', openAddModal);
    closeTransactionModalBtn.addEventListener('click', closeTransactionModal);
    addTransactionModal.addEventListener('click', (e) => { if (e.target === addTransactionModal) closeTransactionModal(); });

    // --- LOGIKA BARU UNTUK BUDGET ---
    const renderBudgetInputs = () => {
        budgetInputsContainer.innerHTML = '';
        
        const monthlyBudgetTitle = document.createElement('h3');
        monthlyBudgetTitle.className = 'text-lg font-bold mt-6 mb-2 text-slate-700';
        monthlyBudgetTitle.textContent = 'Budget Bulanan';
        budgetInputsContainer.appendChild(monthlyBudgetTitle);

        monthlyBudgetCategories.forEach(category => {
            const budgetValue = budgets[category] || 0;
            const inputGroup = document.createElement('div');
            inputGroup.className = 'mb-4';
            inputGroup.innerHTML = `
                <label for="budget-${category}" class="block text-sm font-medium text-slate-600">${category}</label>
                <input type="number" id="budget-${category}" name="budget-${category}" placeholder="Contoh: 1000000" min="0" value="${budgetValue}"
                       class="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500">
            `;
            budgetInputsContainer.appendChild(inputGroup);
        });
        
        const weeklyBudgetTitle = document.createElement('h3');
        weeklyBudgetTitle.className = 'text-lg font-bold mt-6 mb-2 text-slate-700';
        weeklyBudgetTitle.textContent = 'Budget Mingguan';
        budgetInputsContainer.appendChild(weeklyBudgetTitle);
        
        // --- PERBAIKAN DI SINI ---
        // Menggunakan getCurrentMonthAndYear() untuk mendapatkan format bulan yang konsisten dengan getWeeklyBudgetForCategory
        const currentMonthAndYear = getCurrentMonthAndYear();
        weeklyBudgetCategories.forEach(category => {
            if (category === 'Tayong harian') {
                const currentDateKey = getCurrentDateKey();
                const budgetValue = dailyBudgets[currentDateKey] || 0;
                const inputGroup = document.createElement('div');
                inputGroup.className = 'mb-4';
                inputGroup.innerHTML = `
                    <label for="budget-${category}-${currentDateKey}" class="block text-sm font-medium text-slate-600">${category} (per Hari)</label>
                    <input type="number" id="budget-${category}-${currentDateKey}" name="budget-${category}-${currentDateKey}" placeholder="Contoh: 50000" min="0" value="${budgetValue}"
                           class="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500">
                `;
                budgetInputsContainer.appendChild(inputGroup);
            } else if (category === 'Belanja Mingguan' || category === 'Tayong jajan') {
                for (let i = 1; i <= 4; i++) {
                    // Menggunakan currentMonthAndYear yang konsisten
                    const weekKey = `${currentMonthAndYear}-W${i}`;
                    const budgetValue = (weeklyBudgets[category] && weeklyBudgets[category][weekKey]) ? weeklyBudgets[category][weekKey] : 0;
                    const inputGroup = document.createElement('div');
                    inputGroup.className = 'mb-4';
                    inputGroup.innerHTML = `
                        <label for="budget-${category}-${weekKey}" class="block text-sm font-medium text-slate-600">${category} (Minggu ke-${i})</label>
                        <input type="number" id="budget-${category}-${weekKey}" name="budget-${category}-${weekKey}" placeholder="Contoh: 50000" min="0" value="${budgetValue}"
                            class="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500">
                    `;
                    budgetInputsContainer.appendChild(inputGroup);
                }
            } else {
                 const today = new Date();
                 const currentWeekNumber = getWeekNumberInMonth(today);
                 const currentMonthAndYearForOther = getCurrentMonthAndYear();
                 const weekKey = `${currentMonthAndYearForOther}-W${currentWeekNumber}`;
                 const budgetValue = (weeklyBudgets[category] && weeklyBudgets[category][weekKey]) ? weeklyBudgets[category][weekKey] : 0;
                 const inputGroup = document.createElement('div');
                 inputGroup.className = 'mb-4';
                 inputGroup.innerHTML = `
                     <label for="budget-${category}-${weekKey}" class="block text-sm font-medium text-slate-600">${category} (Minggu Ini)</label>
                     <input type="number" id="budget-${category}-${weekKey}" name="budget-${category}-${weekKey}" placeholder="Contoh: 50000" min="0" value="${budgetValue}"
                         class="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500">
                 `;
                 budgetInputsContainer.appendChild(inputGroup);
            }
        });
    };
    
    // Tangani pengiriman form budget
    budgetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newBudgets = {};
        const newWeeklyBudgets = {};
        const newDailyBudgets = {};

        // Ambil data budget bulanan
        monthlyBudgetCategories.forEach(category => {
            const input = document.getElementById(`budget-${category}`);
            if (input) {
                const amount = parseFloat(input.value) || 0;
                newBudgets[category] = amount;
            }
        });

        // Ambil data budget mingguan & harian
        const today = new Date();
        const currentYear = today.getFullYear();
        // --- PERBAIKAN DI SINI ---
        // Menggunakan getCurrentMonthAndYear() untuk mendapatkan format bulan yang konsisten saat menyimpan
        const currentMonthAndYear = getCurrentMonthAndYear();
        // --- AKHIR PERBAIKAN ---
        const currentDateKey = getCurrentDateKey();
        
        weeklyBudgetCategories.forEach(category => {
            if (category === 'Tayong harian') {
                 const input = document.getElementById(`budget-${category}-${currentDateKey}`);
                 if(input) {
                    const amount = parseFloat(input.value) || 0;
                    newDailyBudgets[currentDateKey] = amount;
                 }
            } else if (category === 'Belanja Mingguan' || category === 'Tayong jajan') {
                 for (let i = 1; i <= 4; i++) {
                     // Menggunakan currentMonthAndYear yang konsisten
                     const weekKey = `${currentMonthAndYear}-W${i}`;
                     const input = document.getElementById(`budget-${category}-${weekKey}`);
                     if (input) {
                         const amount = parseFloat(input.value) || 0;
                         if (!newWeeklyBudgets[category]) {
                             newWeeklyBudgets[category] = {};
                         }
                         newWeeklyBudgets[category][weekKey] = amount;
                     }
                 }
            } else {
                 const currentWeekNumber = getWeekNumberInMonth(today);
                 const weekKey = `${currentMonthAndYear}-W${currentWeekNumber}`;
                 const input = document.getElementById(`budget-${category}-${weekKey}`);
                 if (input) {
                     const amount = parseFloat(input.value) || 0;
                     if (!newWeeklyBudgets[category]) {
                         newWeeklyBudgets[category] = {};
                     }
                     newWeeklyBudgets[category][weekKey] = amount;
                 }
            }
        });
        
        budgets = { ...budgets, ...newBudgets }; // Perbarui state budget bulanan
        weeklyBudgets = { ...weeklyBudgets, ...newWeeklyBudgets }; // Perbarui state budget mingguan
        dailyBudgets = { ...dailyBudgets, ...newDailyBudgets }; // Perbarui state budget harian
        saveDataToFirestore(); // Simpan ke Firestore
        openConfirmationModal({
            title: 'Budget Tersimpan',
            message: 'Budget Anda berhasil disimpan dan disinkronkan.',
            confirmText: 'OK',
            confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700',
            action: () => {}
        });
    });

    // --- LOGIKA UNTUK MANAJEMEN KATEGORI ---
    
    // Fungsi untuk menampilkan daftar kategori
    const renderCategoryList = () => {
        categoryListContainer.innerHTML = '';
        allCategories.forEach(category => {
            const categoryCard = document.createElement('div');
            categoryCard.className = 'bg-slate-100 p-4 rounded-lg flex items-center justify-between shadow-sm';
            categoryCard.innerHTML = `
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-slate-800 truncate">${category}</p>
                </div>
                <div class="flex gap-2">
                    <button data-category="${category}" class="edit-category-btn text-sky-500 hover:text-sky-700" title="Edit Kategori">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button data-category="${category}" class="delete-category-btn text-red-500 hover:text-red-700" title="Hapus Kategori">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
            categoryListContainer.appendChild(categoryCard);
        });
    };
    
    // Fungsi untuk menghapus kartu dari tampilan budget (tidak menghapus kategori)
    const removeCardFromDisplay = (categoryName, type) => {
        if (type === 'monthly') {
            monthlyBudgetCategories = monthlyBudgetCategories.filter(cat => cat !== categoryName);
            renderMonthlyBudgetSummary();
        } else if (type === 'weekly') {
            weeklyBudgetCategories = weeklyBudgetCategories.filter(cat => cat !== categoryName);
            renderWeeklyBudgetSummary();
        }
        saveDataToFirestore();
    };

    // Event listener untuk tombol hapus kartu
    weeklyBudgetContent.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-card-btn');
        if (removeBtn) {
            const category = removeBtn.dataset.category;
            const type = removeBtn.dataset.type;
            const week = removeBtn.dataset.week; // Dapatkan minggu dari data atribut

            if (type === 'weekly' && (category === 'Belanja Mingguan' || category === 'Tayong jajan')) {
                openConfirmationModal({
                    title: 'Konfirmasi Hapus Kartu',
                    message: `Apakah Anda yakin ingin menghapus kartu "${category} Minggu ${week}" dari tampilan budget mingguan? Kategori ini tidak akan dihapus dari data Anda.`,
                    confirmText: 'Hapus Kartu',
                    confirmClass: 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors',
                    action: () => removeWeeklyCardFromDisplay(category, week)
                });
            } else {
                 openConfirmationModal({
                    title: 'Konfirmasi Hapus Kartu',
                    message: `Apakah Anda yakin ingin menghapus kartu "${category}" dari tampilan budget mingguan? Kategori ini tidak akan dihapus dari data Anda.`,
                    confirmText: 'Hapus Kartu',
                    confirmClass: 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors',
                    action: () => removeCardFromDisplay(category, type)
                });
            }
        }
    });

    // Fungsi baru untuk menghapus kartu mingguan
    const removeWeeklyCardFromDisplay = (categoryName, week) => {
        const index = weeklyBudgetCategories.findIndex(cat => cat === categoryName);
        if (index > -1) {
            // Remove the card from the UI
            // We don't remove it from the array because it's a fixed set of cards
        }
        renderWeeklyBudgetSummary();
    }

    monthlyBudgetContent.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-card-btn');
        if (removeBtn) {
            const category = removeBtn.dataset.category;
            const type = removeBtn.dataset.type;
            openConfirmationModal({
                title: 'Konfirmasi Hapus Kartu',
                message: `Apakah Anda yakin ingin menghapus kartu "${category}" dari tampilan budget bulanan? Kategori ini tidak akan dihapus dari data Anda.`,
                confirmText: 'Hapus Kartu',
                confirmClass: 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors',
                action: () => removeCardFromDisplay(category, type)
            });
        }
    });

    // Fungsi untuk menambah kategori baru
    addCategoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newCategoryName = newCategoryNameInput.value.trim();
        const showInMonthly = newCategoryMonthlyCheckbox.checked;
        const showInWeekly = newCategoryWeeklyCheckbox.checked;

        if (!newCategoryName) return;
        
        // Pastikan setidaknya satu kotak centang dipilih
        if (!showInMonthly && !showInWeekly) {
            openConfirmationModal({
                title: 'Error', 
                message: 'Pilih setidaknya satu tab untuk menampilkan kartu budget.',
                confirmText: 'OK', 
                confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', 
                action: () => {}
            });
            return;
        }

        if (allCategories.includes(newCategoryName)) {
            openConfirmationModal({
                title: 'Error', message: 'Kategori ini sudah ada!',
                confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', action: () => {}
            });
            return;
        }

        allCategories.push(newCategoryName);
        if (showInMonthly) {
            monthlyBudgetCategories.push(newCategoryName);
        }
        if (showInWeekly) {
            weeklyBudgetCategories.push(newCategoryName);
        }
        
        newCategoryNameInput.value = '';
        newCategoryMonthlyCheckbox.checked = false; // reset
        newCategoryWeeklyCheckbox.checked = false; // reset
        saveDataToFirestore();
        renderAll();
    });

    // NEW: Fungsi untuk merender dropdown kategori yang sudah ada
    const renderAddExistingCategoryDropdown = () => {
        existingCategorySelect.innerHTML = '';
        const displayedCategories = [...monthlyBudgetCategories, ...weeklyBudgetCategories];
        const categoriesToAdd = allCategories.filter(cat => !displayedCategories.includes(cat));

        if (categoriesToAdd.length > 0) {
            existingCategorySelect.disabled = false;
            categoriesToAdd.forEach(cat => existingCategorySelect.add(new Option(cat, cat)));
        } else {
            existingCategorySelect.disabled = true;
            existingCategorySelect.add(new Option("Tidak ada kategori yang tersedia", ""));
        }
    };
    
    // NEW: Event listener untuk formulir penambahan kategori yang sudah ada
    addExistingCategoryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const categoryToAdd = existingCategorySelect.value;
        const showInMonthly = existingCategoryMonthlyCheckbox.checked;
        const showInWeekly = existingCategoryWeeklyCheckbox.checked;
        
        if (!categoryToAdd || (!showInMonthly && !showInWeekly)) {
            openConfirmationModal({
                title: 'Error',
                message: 'Pilih kategori dan setidaknya satu tab untuk menampilkan kartu.',
                confirmText: 'OK',
                confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700',
                action: () => {}
            });
            return;
        }

        if (showInMonthly && !monthlyBudgetCategories.includes(categoryToAdd)) {
            monthlyBudgetCategories.push(categoryToAdd);
        }

        if (showInWeekly && !weeklyBudgetCategories.includes(categoryToAdd)) {
            weeklyBudgetCategories.push(categoryToAdd);
        }

        saveDataToFirestore();
        renderAll();
        
        // Reset form
        existingCategoryMonthlyCheckbox.checked = false;
        existingCategoryWeeklyCheckbox.checked = false;
    });

    // Event listener untuk tombol edit dan hapus kategori
    categoryListContainer.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-category-btn');
        const deleteButton = e.target.closest('.delete-category-btn');
        if (editButton) {
            const oldCategoryName = editButton.dataset.category;
            openConfirmationModal({
                title: 'Edit Kategori',
                message: 'Masukkan nama baru untuk kategori:',
                showInput: true,
                inputValue: oldCategoryName,
                inputPlaceholder: 'Nama kategori baru',
                confirmText: 'Simpan',
                confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700',
                action: (newName) => {
                    if (newName && newName !== '' && newName !== oldCategoryName) {
                        updateCategoryName(oldCategoryName, newName);
                    }
                }
            });
        }
        if (deleteButton) {
            const categoryToDelete = deleteButton.dataset.category;
            openConfirmationModal({
                title: 'Konfirmasi Hapus Kategori',
                message: `Apakah Anda yakin ingin menghapus kategori "${categoryToDelete}"? Semua transaksi dengan kategori ini akan diubah menjadi "Tidak Terkategori".`,
                confirmText: 'Hapus',
                confirmClass: 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors',
                action: () => { deleteCategory(categoryToDelete); }
            });
        }
    });

    // Fungsi untuk memperbarui nama kategori di seluruh data
    const updateCategoryName = (oldName, newName) => {
        // Cek apakah nama baru sudah ada
        if (allCategories.includes(newName)) {
            openConfirmationModal({
                title: 'Error', message: 'Nama kategori baru sudah ada.',
                confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', action: () => {}
            });
            return;
        }

        // Perbarui array allCategories
        const allIndex = allCategories.indexOf(oldName);
        if (allIndex > -1) allCategories[allIndex] = newName;
        
        // Perbarui array monthlyBudgetCategories
        const monthlyIndex = monthlyBudgetCategories.indexOf(oldName);
        if (monthlyIndex > -1) monthlyBudgetCategories[monthlyIndex] = newName;

        // Perbarui array weeklyBudgetCategories
        const weeklyIndex = weeklyBudgetCategories.indexOf(oldName);
        if (weeklyIndex > -1) weeklyBudgetCategories[weeklyIndex] = newName;
        
        // Perbarui transaksi
        transactions.forEach(t => {
            if (t.category === oldName) {
                t.category = newName;
            }
        });

        // Perbarui budgets bulanan
        if (budgets[oldName]) {
            budgets[newName] = budgets[oldName];
            delete budgets[oldName];
        }

        // Perbarui budgets mingguan
        if (weeklyBudgets[oldName]) {
            weeklyBudgets[newName] = weeklyBudgets[oldName];
            delete weeklyBudgets[oldName];
        }
        
        // Perbarui budgets harian (jika kategori "Tayong harian" diubah)
        if (oldName === 'Tayong harian' && newName !== 'Tayong harian') {
            const oldDailyBudgets = { ...dailyBudgets };
            dailyBudgets = {};
            for (const key in oldDailyBudgets) {
                // Untuk kesederhanaan, kita bisa menyimpan budget harian di bawah nama baru, tapi ini akan
                // membuat logikanya menjadi rumit. Untuk saat ini, kita akan mengubah kategori transaksi
                // tapi budget harian akan tetap.
            }
        }
        
        saveDataToFirestore();
        renderAll(); // Memastikan UI diperbarui setelah perubahan
    };

    // Fungsi untuk menghapus kategori
    const deleteCategory = (categoryName) => {
        // Hapus dari array kategori utama
        allCategories = allCategories.filter(cat => cat !== categoryName);
        monthlyBudgetCategories = monthlyBudgetCategories.filter(cat => cat !== categoryName);
        weeklyBudgetCategories = weeklyBudgetCategories.filter(cat => cat !== categoryName);

        // Ubah kategori transaksi yang terpengaruh
        transactions.forEach(t => {
            if (t.category === categoryName) {
                t.category = 'Tidak Terkategori';
            }
        });

        // Hapus budget terkait
        if (budgets[categoryName]) {
            delete budgets[categoryName];
        }
        if (weeklyBudgets[categoryName]) {
            delete weeklyBudgets[categoryName];
        }

        saveDataToFirestore();
    };

    // --- LOGIKA UNTUK TAB AKSI MASAL ---
    
    // Fungsi untuk merender UI Aksi Masal dan dropdown-nya
    const renderBulkActionUI = () => {
        // Mendapatkan semua kategori unik dari transaksi
        const uniqueCategoriesInTransactions = [...new Set(transactions.map(t => t.category))];

        // Populate "Pilih Kategori Lama" dropdown
        bulkOldCategorySelect.innerHTML = '<option value="" disabled selected>Pilih kategori lama</option>';
        uniqueCategoriesInTransactions.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            bulkOldCategorySelect.appendChild(option);
        });

        // Populate "Pilih Kategori Baru" dropdown
        bulkNewCategorySelect.innerHTML = '<option value="" disabled selected>Pilih kategori baru</option>';
        allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            bulkNewCategorySelect.appendChild(option);
        });

        // Event listener untuk perubahan pada dropdown kategori lama
        bulkOldCategorySelect.addEventListener('change', (e) => {
            renderBulkTransactionsList(e.target.value);
        });

        // Event listener untuk tombol "Terapkan Perubahan"
        bulkApplyBtn.addEventListener('click', () => {
            const oldCategory = bulkOldCategorySelect.value;
            const newCategory = bulkNewCategorySelect.value;
            if (oldCategory && newCategory && oldCategory !== newCategory) {
                openConfirmationModal({
                    title: 'Konfirmasi Aksi Masal',
                    message: `Anda akan mengubah semua transaksi dari kategori "${oldCategory}" menjadi "${newCategory}". Apakah Anda yakin?`,
                    confirmText: 'Ya, Ubah Kategori',
                    confirmClass: 'px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700',
                    action: () => {
                        applyBulkCategoryChange(oldCategory, newCategory);
                    }
                });
            } else {
                openConfirmationModal({
                    title: 'Error',
                    message: 'Pastikan Anda memilih kategori lama dan kategori baru yang berbeda.',
                    confirmText: 'OK',
                    confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700',
                    action: () => {}
                });
            }
        });

        // Render daftar transaksi awal (kosong)
        renderBulkTransactionsList('');
    };

    // Fungsi untuk merender daftar transaksi yang cocok dengan kategori yang dipilih
    const renderBulkTransactionsList = (category) => {
        bulkTransactionsList.innerHTML = '';
        const transactionsToDisplay = transactions.filter(t => t.category === category);

        if (transactionsToDisplay.length === 0) {
            bulkEmptyState.classList.remove('hidden');
        } else {
            bulkEmptyState.classList.add('hidden');
            transactionsToDisplay.forEach(t => {
                const transactionItem = document.createElement('div');
                transactionItem.className = 'flex justify-between items-center py-2 border-b border-slate-100 last:border-b-0';
                transactionItem.innerHTML = `
                    <div class="flex-grow">
                        <p class="font-semibold text-slate-800">${t.detail}</p>
                        <p class="text-xs text-slate-500">${formatDate(t.date)} - ${formatCurrency(t.amount)}</p>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(t.category)}">${t.category}</span>
                `;
                bulkTransactionsList.appendChild(transactionItem);
            });
        }
    };
    
    // Fungsi untuk menerapkan perubahan kategori secara masal
    const applyBulkCategoryChange = (oldCategory, newCategory) => {
        transactions = transactions.map(t => {
            if (t.category === oldCategory) {
                return { ...t, category: newCategory };
            }
            return t;
        });
        saveDataToFirestore();
        renderAll(); // Perbarui UI di semua tab
        openConfirmationModal({
            title: 'Sukses',
            message: `Semua transaksi dari "${oldCategory}" telah berhasil diubah menjadi "${newCategory}".`,
            confirmText: 'OK',
            confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700',
            action: () => {}
        });
    };

    // --- STATS LOGIC ---
    const renderDashboardStats = () => {
        const ctx = document.getElementById('dashboardChart').getContext('2d');
        const categoriesToShow = allCategories;
        
        // Filter transaksi untuk bulan berjalan
        const currentMonthAndYear = getCurrentMonthAndYear();
        const currentMonthTransactions = transactions.filter(t => t.date.startsWith(currentMonthAndYear));

        const categoryTotals = categoriesToShow.map(category => {
            let total = 0;
            total = currentMonthTransactions.filter(t => t.category === category).reduce((sum, t) => sum + t.amount, 0);
            return { category: category, total: total };
        }).filter(item => item.total > 0);

        if (dashboardChartInstance) {
            dashboardChartInstance.destroy();
        }

        dashboardChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: categoryTotals.map(item => item.category),
                datasets: [{
                    label: 'Pengeluaran per Kategori',
                    data: categoryTotals.map(item => item.total),
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 206, 86, 0.8)', 'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)', 'rgba(255, 159, 64, 0.8)',
                        'rgba(255, 235, 59, 0.8)', 'rgba(128, 0, 128, 0.8)'
                    ],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += formatCurrency(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };

    const renderAllStats = () => {
        renderDashboardStats();
    };

    // --- BACKUP MANAGEMENT LOGIC ---
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const uploadAllInput = document.getElementById('uploadAllInput');
    downloadAllBtn.addEventListener('click', () => {
        if (transactions.length === 0) {
            openConfirmationModal({ title: 'Info', message: 'Tidak ada data untuk diunduh.', confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', action: () => {} });
            return;
        }
        const allData = { 
            transactions, 
            budgets, 
            weeklyBudgets, 
            dailyBudgets, 
            allCategories,
            monthlyBudgetCategoriesOrder: monthlyBudgetCategories,
            weeklyBudgetCategoriesOrder: weeklyBudgetCategories
        };
        const dataStr = JSON.stringify(allData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `catatan-keuangan-lokal-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
    uploadAllInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!data || !Array.isArray(data.transactions)) throw new Error('Format file JSON tidak valid atau tidak lengkap.');
                openConfirmationModal({
                    title: 'Muat Data Lokal', message: 'Ini akan menimpa data saat ini dengan data dari file. Data baru akan disinkronkan ke cloud. Yakin?',
                    confirmText: 'Ya, Timpa & Sinkronkan', confirmClass: 'px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors',
                    action: () => {
                        transactions = data.transactions || [];
                        budgets = data.budgets || {};
                        weeklyBudgets = data.weeklyBudgets || {};
                        dailyBudgets = data.dailyBudgets || {};
                        allCategories = data.allCategories || allCategories;
                        if (data.monthlyBudgetCategoriesOrder) {
                            monthlyBudgetCategories = data.monthlyBudgetCategoriesOrder;
                        }
                        if (data.weeklyBudgetCategoriesOrder) {
                            weeklyBudgetCategories = data.weeklyBudgetCategoriesOrder;
                        }
                        saveDataToFirestore();
                        openConfirmationModal({ title: 'Sukses', message: 'Data lokal berhasil dimuat dan akan disinkronkan.', confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', action: () => {} });
                    }
                });
            } catch (error) {
                openConfirmationModal({ title: 'Error', message: `Gagal memuat file: ${error.message}`, confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', action: () => {} });
            } finally { e.target.value = ''; }
        };
        reader.readAsText(file);
    });

    // --- FITUR BACK-TO-TOP ---
    window.addEventListener('scroll', () => {
        if (window.scrollY > 200) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // --- KODE BARU UNTUK TAB STICKY ---
    const stickyTabs = document.getElementById('sticky-tabs');
    const headerElement = document.querySelector('header');
    
    const observer = new IntersectionObserver( 
        ([e]) => stickyTabs.classList.toggle('scrolled', e.intersectionRatio < 1), 
        { threshold: [1] }
    );
    
    observer.observe(headerElement);
});
