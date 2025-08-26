document.addEventListener('DOMContentLoaded', () => {
    // --- FIREBASE CONFIGURATION ---
    const firebaseConfig = {
        apiKey: "AIzaSyDXZPDbDZvG-CCW-8gjbQ14gehlxIspJaQ",
        authDomain: "tayongtracker.firebaseapp.com",
        projectId: "tayongtracker",
        storageBucket: "tayongtracker.appspot.com",
        messagingSenderId: "986883833587",
        appId: "1:986883833587:web:2b234bf1d453651bc28186",
        measurementId: "G-YVJHH89S24"
    };

    // --- FIREBASE INITIALIZATION ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const provider = new firebase.auth.GoogleAuthProvider();

    // --- GLOBAL STATE & UTILITIES ---
    let transactions = [];
    let inExTransactions = [];
    let budgets = {}; // State untuk menyimpan data anggaran
    let currentUser = null;
    let unsubscribe = null; // Untuk melepaskan listener Firestore
    let dashboardFilterText = '';
    let dashboardFilterDate = '';
    let inExFilterText = '';
    let inExFilterDate = '';
    let dashboardChartInstance = null;
    let inExChartInstance = null;

    // Kategori untuk tab "Umum"
    const dashboardCategories = ['Bulanan', 'Mingguan', 'Saved', 'Mumih', 'Darurat', 'Jajan di luar'];
    // Kategori baru untuk tab "Uang Tayong"
    const inExCategories = ['Harian', 'Weekend', 'Fleksibel'];

    // Pagination state
    let currentPage = 1;
    const itemsPerPage = 10;
    let inExCurrentPage = 1;
    const inExItemsPerPage = 10;

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

    // --- DOM ELEMENTS ---
    const authContainer = document.getElementById('authContainer');
    const loginPrompt = document.getElementById('loginPrompt');
    const loginBtn = document.getElementById('loginBtn');
    const mainContent = document.getElementById('mainContent');
    const dashboardSearch = document.getElementById('dashboardSearch');
    const dashboardDateFilter = document.getElementById('dashboardDateFilter');
    const inExSearch = document.getElementById('inExSearch');
    const inExDateFilter = document.getElementById('inExDateFilter');
    
    // Pagination elements
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');
    const inExPrevPageBtn = document.getElementById('inExPrevPageBtn');
    const inExNextPageBtn = document.getElementById('inExNextPageBtn');
    const inExPageInfo = document.getElementById('inExPageInfo');
    const backToTopBtn = document.getElementById('backToTopBtn');

    // Elemen untuk Anggaran

    const budgetContent = document.getElementById('budgetContent');
    const budgetForm = document.getElementById('budgetForm');
    const budgetInputsContainer = document.getElementById('budgetInputsContainer');

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
            inExTransactions = [];
            budgets = {};
            renderAll();
            loginPrompt.classList.remove('hidden');
            mainContent.classList.add('hidden');
            authContainer.innerHTML = '';
        }
    });

    // --- FIRESTORE DATA HANDLING ---
    const listenToData = (uid) => {
        if (unsubscribe) unsubscribe();
        const docRef = db.collection('users').doc(uid);
        unsubscribe = docRef.onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                transactions = data.transactions || [];
                inExTransactions = data.inExTransactions || [];
                budgets = data.budgets || {};
            } else {
                transactions = [];
                inExTransactions = [];
                budgets = {};
            }
            currentPage = 1; 
            dashboardFilterDate = '';
            inExCurrentPage = 1;
            inExFilterDate = '';
            renderAll();
        }, error => console.error("Error listening to data:", error));
    };

    const saveDataToFirestore = async () => {
        if (!currentUser) return;
        try {
            const docRef = db.collection('users').doc(currentUser.uid);
            await docRef.set({ transactions, inExTransactions, budgets });
        } catch (error) {
            console.error("Error saving data:", error);
        }
    };

    // --- RENDER ALL ---
    const renderAll = () => {
        renderSummary();
        renderTransactions();
        renderInExSummary();
        renderInExTransactions();
        renderAllStats();
    }

    // --- TABS ---
    const tabDashboard = document.getElementById('tabDashboard');
    const tabInEx = document.getElementById('tabInEx');
    const tabStats = document.getElementById('tabStats');
    const tabBudget = document.getElementById('tabBudget');
    const tabBackup = document.getElementById('tabBackup');
    const dashboardContent = document.getElementById('dashboardContent');
    const inExContent = document.getElementById('inExContent');
    const statsContent = document.getElementById('statsContent');
    const backupContent = document.getElementById('backupContent');
    
    function switchTab(activeTab) {
        const isDashboard = activeTab === 'dashboard';
        const isInEx = activeTab === 'inEx';
        const isStats = activeTab === 'stats';
        const isBudget = activeTab === 'budget';
        const isBackup = activeTab === 'backup';

        tabDashboard.classList.toggle('active', isDashboard);
        tabInEx.classList.toggle('active', isInEx);
        tabStats.classList.toggle('active', isStats);
        tabBudget.classList.toggle('active', isBudget);
        tabBackup.classList.toggle('active', isBackup);

        dashboardContent.classList.toggle('hidden', !isDashboard);
        inExContent.classList.toggle('hidden', !isInEx);
        statsContent.classList.toggle('hidden', !isStats);
        budgetContent.classList.toggle('hidden', !isBudget);
        backupContent.classList.toggle('hidden', !isBackup);

        // Reset filters and pagination when switching tabs
        if (isDashboard) {
            dashboardSearch.value = dashboardFilterText;
            dashboardDateFilter.value = dashboardFilterDate;
            renderTransactions();
        } else if (isInEx) {
            inExSearch.value = inExFilterText;
            inExDateFilter.value = inExFilterDate;
            renderInExTransactions();
        } else if (isBudget) {
            renderBudgetInputs();
        } else if (isStats) {
            renderAllStats();
        }
    }
    tabDashboard.addEventListener('click', () => switchTab('dashboard'));
    tabInEx.addEventListener('click', () => switchTab('inEx'));
    tabStats.addEventListener('click', () => switchTab('stats'));
    tabBudget.addEventListener('click', () => switchTab('budget'));
    tabBackup.addEventListener('click', () => switchTab('backup'));

    // --- GENERIC CONFIRMATION MODAL ---
    const confirmationModal = document.getElementById('confirmationModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const cancelConfirm = document.getElementById('cancelConfirm');
    const confirmAction = document.getElementById('confirmAction');
    let actionToConfirm = null;

    function openConfirmationModal(config) {
        confirmTitle.textContent = config.title;
        confirmMessage.textContent = config.message;
        confirmAction.className = config.confirmClass;
        confirmAction.textContent = config.confirmText;
        actionToConfirm = config.action;
        confirmationModal.classList.remove('hidden');
    }
    function closeConfirmationModal() {
        confirmationModal.classList.add('hidden');
        actionToConfirm = null;
    }
    confirmAction.addEventListener('click', () => {
        if (actionToConfirm && typeof actionToConfirm === 'function') {
            actionToConfirm();
        }
        closeConfirmationModal();
    });
    cancelConfirm.addEventListener('click', closeConfirmationModal);
    confirmationModal.addEventListener('click', (e) => { if (e.target === confirmationModal) closeConfirmationModal(); });
    
    // --- DASHBOARD (UMUM) LOGIC ---
    const paymentTypes = ['Cash', 'Gopay'];
    const categoryColors = { 
        'Bulanan': 'bg-red-100 text-red-800',
        'Mingguan': 'bg-orange-100 text-orange-800',
        'Saved': 'bg-gray-100 text-gray-800',
        'Mumih': 'bg-blue-100 text-blue-800',
        'Darurat': 'bg-purple-100 text-purple-800',
        'Jajan di luar': 'bg-yellow-100 text-yellow-800',
        'Dana Cadangan': 'bg-indigo-100 text-indigo-800' // New color for combined card
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
        
        // Kategori yang akan ditampilkan di ringkasan
        const summaryCategories = ['Bulanan', 'Mingguan', 'Mumih', 'Jajan di luar', 'Dana Cadangan'];

        // Tambahkan kartu Total Pengeluaran terlebih dahulu
        const totalExpenses = transactions.reduce((sum, t) => sum + t.amount, 0);
        const totalExpensesCard = document.createElement('div');
        totalExpensesCard.className = 'summary-card bg-red-50 border-l-4 border-red-500';
        totalExpensesCard.innerHTML = `<h3 class="font-semibold text-red-700">Total Pengeluaran</h3><p id="totalExpenses" class="text-xl font-bold mt-2 text-red-800">${formatCurrency(totalExpenses)}</p>`;
        summarySection.appendChild(totalExpensesCard);

        summaryCategories.forEach(category => {
            let total = 0;
            const card = document.createElement('div');
            card.className = 'summary-card';
            
            // Logika baru untuk kartu Dana Cadangan
            if (category === 'Dana Cadangan') {
                const savedTotal = transactions.filter(t => t.category === 'Saved').reduce((sum, t) => sum + t.amount, 0);
                const daruratTotal = transactions.filter(t => t.category === 'Darurat').reduce((sum, t) => sum + t.amount, 0);
                total = savedTotal + daruratTotal;
                
                // Ubah konten kartu untuk menunjukkan saldo rinci
                card.innerHTML = `
                    <h3 class="font-semibold text-slate-500">${category}</h3>
                    <p class="amount-text text-slate-800">${formatCurrency(total)}</p>
                    <div class="border-t border-dashed mt-2 pt-2">
                        <p class="text-xs font-semibold text-slate-500">Saldo Saved: ${formatCurrency(savedTotal)}</p>
                        <p class="text-xs font-semibold text-slate-500">Saldo Darurat: ${formatCurrency(daruratTotal)}</p>
                    </div>
                `;
            } else {
                // Logika lama untuk kategori lainnya (dengan anggaran dan sisa)
                total = transactions.filter(t => t.category === category).reduce((sum, t) => sum + t.amount, 0);
                const budget = budgets[category] || 0;
                const remaining = budget - total;
                const remainingColor = remaining >= 0 ? 'text-green-600' : 'text-red-600';
                card.innerHTML = `
                    <h3 class="font-semibold text-slate-500">${category}</h3>
                    <p class="amount-text text-slate-800">${formatCurrency(total)}</p>
                    <div class="border-t border-dashed mt-2 pt-2">
                        <p class="text-xs font-semibold text-slate-500">Anggaran: ${formatCurrency(budget)}</p>
                        <p class="text-xs font-bold ${remainingColor}">Sisa: ${formatCurrency(remaining)}</p>
                    </div>
                `;
            }
            summarySection.appendChild(card);
        });
    };

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
                    <h3 class="text-md font-bold text-slate-800">${formatDate(date)}</h3>
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
                        <span class="px-2 py-1 text-xs font-medium rounded-full ${categoryColors[t.category] || 'bg-gray-100 text-gray-800'}">${t.category}</span>
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
    [categorySelect, paymentSelect].forEach(sel => sel.innerHTML = '');
    dashboardCategories.forEach(cat => categorySelect.add(new Option(cat, cat)));
    paymentTypes.forEach(pay => paymentSelect.add(new Option(pay, pay)));
    openTransactionModalBtn.addEventListener('click', openAddModal);
    closeTransactionModalBtn.addEventListener('click', closeTransactionModal);
    addTransactionModal.addEventListener('click', (e) => { if (e.target === addTransactionModal) closeTransactionModal(); });

    // --- IN/EX TRACKER (UANG TAYONG) LOGIC ---
    let inExToEditIndex = null;
    const inExSummarySection = document.getElementById('inExSummarySection');
    const inExContainer = document.getElementById('inExContainer');
    const inExEmptyState = document.getElementById('inExEmptyState');
    const inExModal = document.getElementById('inExModal');
    const openInExModalBtn = document.getElementById('openInExModalBtn');
    const closeInExModalBtn = document.getElementById('closeInExModalBtn');
    const inExForm = document.getElementById('inExForm');
    const inExModalTitle = document.getElementById('inExModalTitle');
    const submitInExBtn = document.getElementById('submitInExBtn');
    const inExDate = document.getElementById('inExDate');
    const inExCategory = document.getElementById('inExCategory');
    const inExDetail = document.getElementById('inExDetail');
    const inExAmount = document.getElementById('inExAmount');
    
    const renderInExSummary = () => {
        inExSummarySection.innerHTML = '';
        const inExOverallTotal = inExCategories.reduce((totalSum, category) => {
            const total = inExTransactions.filter(t => t.category === category).reduce((sum, t) => sum + t.amount, 0);
            const budget = budgets[category] || 0;
            const remaining = budget - total;
            
            const remainingColor = remaining >= 0 ? 'text-green-600' : 'text-red-600';
            const card = document.createElement('div');
            card.className = 'summary-card';
            
            // Hapus baris total dan hanya sisakan Anggaran dan Sisa
            card.innerHTML = `
                <h3 class="font-semibold text-slate-500">${category}</h3>
                <div class="border-t border-dashed mt-2 pt-2">
                    <p class="text-xs font-semibold text-slate-500">Anggaran: ${formatCurrency(budget)}</p>
                    <p class="text-xs font-bold ${remainingColor}">Sisa: ${formatCurrency(remaining)}</p>
                </div>
            `;
            inExSummarySection.appendChild(card);
            return totalSum + remaining;
        }, 0);
        
        // Kartu total sisa anggaran
        const overallTotalCard = document.createElement('div');
        const overallTotalColor = inExOverallTotal >= 0 ? 'text-sky-800' : 'text-red-800';
        overallTotalCard.className = `summary-card bg-sky-50 border-l-4 border-sky-500`;
        overallTotalCard.innerHTML = `
            <h3 class="font-semibold text-sky-700">Total Sisa Anggaran</h3>
            <p class="amount-text ${overallTotalColor} mt-2">${formatCurrency(inExOverallTotal)}</p>
        `;
        inExSummarySection.appendChild(overallTotalCard);
    };

    const renderInExTransactions = () => {
        const lowercasedFilter = inExFilterText.toLowerCase();
        const filteredInExTransactions = inExTransactions.filter(t =>
            (t.detail.toLowerCase().includes(lowercasedFilter) ||
            t.category.toLowerCase().includes(lowercasedFilter)) &&
            (inExFilterDate === '' || t.date === inExFilterDate)
        );

        filteredInExTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const groupedByDate = filteredInExTransactions.reduce((acc, t) => {
            (acc[t.date] = acc[t.date] || []).push(t);
            return acc;
        }, {});
        
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));
        
        const inExTotalPages = Math.ceil(sortedDates.length / inExItemsPerPage);
        const inExStartIndex = (inExCurrentPage - 1) * inExItemsPerPage;
        const inExEndIndex = inExStartIndex + inExItemsPerPage;
        const datesToDisplay = sortedDates.slice(inExStartIndex, inExEndIndex);

        inExContainer.innerHTML = '';
        inExEmptyState.classList.toggle('hidden', datesToDisplay.length > 0);

        datesToDisplay.forEach(date => {
            const dailyTransactions = groupedByDate[date];
            const dailyTotal = dailyTransactions.reduce((sum, t) => sum + t.amount, 0);

            const dailyCard = document.createElement('div');
            dailyCard.className = 'bg-white p-4 rounded-xl shadow-lg border-2 border-slate-200 mb-4';
            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-2 pb-2 border-b border-slate-200';
            header.innerHTML = `
                <div>
                    <h3 class="text-md font-bold text-slate-800">${formatDate(date)}</h3>
                </div>
                <div>
                    <span class="text-sm text-slate-500">Total: </span>
                    <span class="font-bold text-red-600">${formatCurrency(dailyTotal)}</span>
                </div>
            `;
            dailyCard.appendChild(header);

            dailyTransactions.forEach(t => {
                const transactionItem = document.createElement('div');
                transactionItem.className = 'flex justify-between items-center py-2 border-b border-slate-100 last:border-b-0';
                transactionItem.innerHTML = `
                    <div class="flex items-center gap-3 flex-grow">
                        <i class="fas fa-wallet text-lg text-yellow-500"></i>
                        <div class="flex-grow">
                            <p class="font-semibold text-slate-800">${t.detail}</p>
                            <p class="text-xs text-slate-500">${t.category}</p>
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
            inExContainer.appendChild(dailyCard);
        });

        inExPageInfo.textContent = `Halaman ${inExCurrentPage} dari ${inExTotalPages || 1}`;
        inExPrevPageBtn.disabled = inExCurrentPage === 1;
        inExNextPageBtn.disabled = inExCurrentPage === inExTotalPages || inExTotalPages === 0;
    };

    inExPrevPageBtn.addEventListener('click', () => {
        if (inExCurrentPage > 1) {
            inExCurrentPage--;
            renderInExTransactions();
        }
    });

    inExNextPageBtn.addEventListener('click', () => {
        const lowercasedFilter = inExFilterText.toLowerCase();
        const filteredInExTransactions = inExTransactions.filter(t =>
            (t.detail.toLowerCase().includes(lowercasedFilter) ||
            t.category.toLowerCase().includes(lowercasedFilter)) &&
            (inExFilterDate === '' || t.date === inExFilterDate)
        );
        const groupedByDate = filteredInExTransactions.reduce((acc, t) => {
            (acc[t.date] = acc[t.date] || []).push(t);
            return acc;
        }, {});
        const totalPages = Math.ceil(Object.keys(groupedByDate).length / inExItemsPerPage);
        
        if (inExCurrentPage < totalPages) {
            inExCurrentPage++;
            renderInExTransactions();
        }
    });
    
    const openAddInExModal = () => {
        inExToEditIndex = null;
        inExForm.reset();
        setDefaultDate(inExDate);
        inExModalTitle.textContent = 'Tambah Catatan Baru';
        submitInExBtn.innerHTML = `<i class="fas fa-save mr-2"></i>Simpan Catatan`;
        inExModal.classList.remove('hidden');
    };
    const openEditInExModal = (id) => {
        inExToEditIndex = inExTransactions.findIndex(t => t.id == id);
        if(inExToEditIndex === -1) return;
        const tx = inExTransactions[inExToEditIndex];
        inExDate.value = tx.date; inExCategory.value = tx.category;
        inExDetail.value = tx.detail; inExAmount.value = tx.amount;
        inExModalTitle.textContent = 'Edit Catatan';
        submitInExBtn.innerHTML = `<i class="fas fa-save mr-2"></i>Update Catatan`;
        inExModal.classList.remove('hidden');
    };
    const closeInExModal = () => inExModal.classList.add('hidden');
    inExForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const inExData = { date: inExDate.value, category: inExCategory.value, detail: inExDetail.value, amount: parseFloat(inExAmount.value) };
        if (inExToEditIndex !== null && inExToEditIndex > -1) {
            inExTransactions[inExToEditIndex] = { ...inExTransactions[inExToEditIndex], ...inExData };
        } else {
            // Pengeluaran pada Uang Tayong selalu dicatat sebagai negatif
            inExTransactions.unshift({ ...inExData, amount: -inExData.amount, id: Date.now() });
        }
        saveDataToFirestore();
        closeInExModal();
    });

    inExContent.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        if (editButton) return openEditInExModal(editButton.dataset.id);
        const deleteButton = e.target.closest('.delete-btn');
        if (deleteButton) {
            const id = deleteButton.dataset.id;
            openConfirmationModal({
                title: 'Konfirmasi Hapus', message: 'Apakah Anda yakin ingin menghapus catatan ini?',
                confirmText: 'Hapus', confirmClass: 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors',
                action: () => { inExTransactions = inExTransactions.filter(t => t.id != id); saveDataToFirestore(); }
            });
        }
    });
    inExSearch.addEventListener('input', e => {
        inExFilterText = e.target.value;
        inExCurrentPage = 1;
        renderInExTransactions();
    });
    inExDateFilter.addEventListener('change', e => {
        inExFilterDate = e.target.value;
        inExCurrentPage = 1;
        renderInExTransactions();
    });
    openInExModalBtn.addEventListener('click', openAddInExModal);
    closeInExModalBtn.addEventListener('click', closeInExModal);
    inExModal.addEventListener('click', (e) => { if (e.target === inExModal) closeInExModal(); });

    // --- LOGIKA BARU UNTUK BUDGET ---
    const renderBudgetInputs = () => {
        budgetInputsContainer.innerHTML = '';
        const allCategories = [...new Set([...dashboardCategories, ...inExCategories])];
        allCategories.forEach(category => {
            const budgetValue = budgets[category] || 0;
            const inputGroup = document.createElement('div');
            inputGroup.className = 'mb-4';
            inputGroup.innerHTML = `
                <label for="budget-${category}" class="block text-sm font-medium text-slate-600">${category} (Anggaran)</label>
                <input type="number" id="budget-${category}" name="budget-${category}" placeholder="Contoh: 1000000" min="0" value="${budgetValue}"
                       class="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500">
            `;
            budgetInputsContainer.appendChild(inputGroup);
        });
    };
    
    // Tangani pengiriman form anggaran
    budgetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newBudgets = {};
        const allCategories = [...new Set([...dashboardCategories, ...inExCategories])];
        allCategories.forEach(category => {
            const input = document.getElementById(`budget-${category}`);
            const amount = parseFloat(input.value) || 0;
            newBudgets[category] = amount;
        });
        budgets = { ...budgets, ...newBudgets }; // Perbarui state anggaran
        saveDataToFirestore(); // Simpan ke Firestore
        openConfirmationModal({
            title: 'Anggaran Tersimpan',
            message: 'Anggaran Anda berhasil disimpan dan disinkronkan.',
            confirmText: 'OK',
            confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700',
            action: () => {}
        });
    });

    // --- STATS LOGIC ---
    const renderDashboardStats = () => {
        const ctx = document.getElementById('dashboardChart').getContext('2d');
        const categoriesToShow = dashboardCategories.filter(c => c !== 'Saved' && c !== 'Darurat');
        categoriesToShow.push('Dana Cadangan');
        
        const categoryTotals = categoriesToShow.map(category => {
            let total = 0;
            if (category === 'Dana Cadangan') {
                total = transactions.filter(t => t.category === 'Saved' || t.category === 'Darurat').reduce((sum, t) => sum + t.amount, 0);
            } else {
                total = transactions.filter(t => t.category === category).reduce((sum, t) => sum + t.amount, 0);
            }
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

    const renderInExStats = () => {
        const ctx = document.getElementById('inExChart').getContext('2d');
        const categoryTotals = inExCategories.map(category => {
            return {
                category: category,
                total: inExTransactions
                    .filter(t => t.category === category)
                    .reduce((sum, t) => sum + t.amount, 0)
            };
        }).filter(item => item.total > 0);

        if (inExChartInstance) {
            inExChartInstance.destroy();
        }
        
        inExChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: categoryTotals.map(item => item.category),
                datasets: [{
                    label: 'Pengeluaran per Kategori',
                    data: categoryTotals.map(item => item.total),
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 206, 86, 0.8)'
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
        renderInExStats();
    };

    // --- BACKUP MANAGEMENT LOGIC ---
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const uploadAllInput = document.getElementById('uploadAllInput');
    downloadAllBtn.addEventListener('click', () => {
        if (transactions.length === 0 && inExTransactions.length === 0) {
            openConfirmationModal({ title: 'Info', message: 'Tidak ada data untuk diunduh.', confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', action: () => {} });
            return;
        }
        const allData = { transactions, inExTransactions, budgets };
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
                if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.inExTransactions)) throw new Error('Format file JSON tidak valid atau tidak lengkap.');
                openConfirmationModal({
                    title: 'Muat Data Lokal', message: 'Ini akan menimpa data saat ini dengan data dari file. Data baru akan disinkronkan ke cloud. Yakin?',
                    confirmText: 'Ya, Timpa & Sinkronkan', confirmClass: 'px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors',
                    action: () => {
                        transactions = data.transactions || [];
                        inExTransactions = data.inExTransactions || [];
                        budgets = data.budgets || {};
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
