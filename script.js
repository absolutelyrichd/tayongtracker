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
    let budget = 0; // State untuk menyimpan budget bulanan
    let currentUser = null;
    let unsubscribe = null; // Untuk melepaskan listener Firestore
    let dashboardFilterText = '';
    let dashboardFilterDate = ''; // State baru untuk filter tanggal
    let inExFilterText = '';
    let inExFilterDate = ''; // State baru untuk filter tanggal IN/EX
    let dashboardChartInstance = null;
    let inExChartInstance = null;

    // State paginasi untuk transaksi dashboard
    let currentPage = 1;
    const itemsPerPage = 10;
    // State paginasi untuk transaksi IN/EX
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

    // --- ELEMEN DOM ---
    const authContainer = document.getElementById('authContainer');
    const loginPrompt = document.getElementById('loginPrompt');
    const loginBtn = document.getElementById('loginBtn');
    const mainContent = document.getElementById('mainContent');
    const dashboardSearch = document.getElementById('dashboardSearch');
    const dashboardDateFilter = document.getElementById('dashboardDateFilter'); // Input filter tanggal baru
    const inExSearch = document.getElementById('inExSearch');
    const inExDateFilter = document.getElementById('inExDateFilter'); // Input filter tanggal IN/EX baru
    
    // Elemen paginasi untuk Dashboard
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');

    // Elemen paginasi untuk IN/EX
    const inExPrevPageBtn = document.getElementById('inExPrevPageBtn');
    const inExNextPageBtn = document.getElementById('inExNextPageBtn');
    const inExPageInfo = document.getElementById('inExPageInfo');

    // Tambahkan elemen tombol back-to-top
    const backToTopBtn = document.getElementById('backToTopBtn');

    // Elemen Budget
    const initialBudgetDisplay = document.getElementById('initialBudgetDisplay');
    const monthlyExpensesDisplay = document.getElementById('monthlyExpensesDisplay');
    const remainingBudgetDisplay = document.getElementById('remainingBudgetDisplay');
    const remainingBudgetCard = document.getElementById('remainingBudgetCard');
    const initialBudgetInput = document.getElementById('initialBudgetInput');
    const saveBudgetBtn = document.getElementById('saveBudgetBtn');

    // --- AUTENTIKASI ---
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
            // Konten yang disuntikkan untuk authContainer, disesuaikan agar responsif
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
            budget = 0; // Reset budget
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
                budget = data.budget || 0; // Muat budget dari Firestore
            } else {
                transactions = [];
                inExTransactions = [];
                budget = 0;
            }
            // Reset ke halaman pertama saat data berubah untuk kedua tabel
            currentPage = 1; 
            dashboardFilterDate = ''; // Reset filter tanggal dashboard
            inExCurrentPage = 1;
            inExFilterDate = ''; // Reset filter tanggal IN/EX
            renderAll();
        }, error => console.error("Error listening to data:", error));
    };

    const saveDataToFirestore = async () => {
        if (!currentUser) return;
        try {
            const docRef = db.collection('users').doc(currentUser.uid);
            await docRef.set({ transactions, inExTransactions, budget });
        } catch (error) {
            console.error("Error saving data:", error);
        }
    };

    // --- RENDER SEMUA ---
    const renderAll = () => {
        renderSummary();
        renderBudgetSummary();
        renderTransactions();
        renderInExSummary();
        renderInExTransactions();
        renderAllStats();
    }

    // --- TABS ---
    const tabDashboard = document.getElementById('tabDashboard');
    const tabBudget = document.getElementById('tabBudget');
    const tabInEx = document.getElementById('tabInEx');
    const tabStats = document.getElementById('tabStats');
    const tabBackup = document.getElementById('tabBackup');
    const dashboardContent = document.getElementById('dashboardContent');
    const budgetContent = document.getElementById('budgetContent');
    const inExContent = document.getElementById('inExContent');
    const statsContent = document.getElementById('statsContent');
    const backupContent = document.getElementById('backupContent');
    
    function switchTab(activeTab) {
        const isDashboard = activeTab === 'dashboard';
        const isBudget = activeTab === 'budget';
        const isInEx = activeTab === 'inEx';
        const isStats = activeTab === 'stats';
        const isBackup = activeTab === 'backup';

        tabDashboard.classList.toggle('active', isDashboard);
        tabBudget.classList.toggle('active', isBudget);
        tabInEx.classList.toggle('active', isInEx);
        tabStats.classList.toggle('active', isStats);
        tabBackup.classList.toggle('active', isBackup);

        dashboardContent.classList.toggle('hidden', !isDashboard);
        budgetContent.classList.toggle('hidden', !isBudget);
        inExContent.classList.toggle('hidden', !isInEx);
        statsContent.classList.toggle('hidden', !isStats);
        backupContent.classList.toggle('hidden', !isBackup);

        // Reset filter dan paginasi saat berpindah tab
        if (isDashboard) {
            dashboardSearch.value = dashboardFilterText;
            dashboardDateFilter.value = dashboardFilterDate;
            renderTransactions();
        } else if (isInEx) {
            inExSearch.value = inExFilterText;
            inExDateFilter.value = inExFilterDate; // Set nilai filter tanggal IN/EX
            renderInExTransactions();
        } else if (isBudget) {
            renderBudgetSummary();
        }
    }
    tabDashboard.addEventListener('click', () => switchTab('dashboard'));
    tabBudget.addEventListener('click', () => switchTab('budget'));
    tabInEx.addEventListener('click', () => switchTab('inEx'));
    tabStats.addEventListener('click', () => switchTab('stats'));
    tabBackup.addEventListener('click', () => switchTab('backup'));

    // --- MODAL KONFIRMASI UMUM ---
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
    
    // --- LOGIKA DASHBOARD (DETAIL) ---
    // Update: Tambahkan kategori "Jajan di luar"
    const categories = ['Bulanan', 'Mingguan', 'Saved', 'Tayong', 'Mumih', 'Darurat', 'Jajan di luar'];
    const paymentTypes = ['Cash', 'Gopay'];
    // Update: Tambahkan warna untuk kategori "Jajan di luar"
    const categoryColors = { 
        'Bulanan': 'bg-red-100 text-red-800',
        'Mingguan': 'bg-orange-100 text-orange-800',
        'Saved': 'bg-gray-100 text-gray-800',
        'Mumih': 'bg-blue-100 text-blue-800',
        'Darurat': 'bg-purple-100 text-purple-800',
        'Tayong': 'bg-green-100 text-green-800',
        'Jajan di luar': 'bg-yellow-100 text-yellow-800' // Warna baru untuk kategori baru
    };
    let transactionToEditIndex = null;
    const summarySection = document.getElementById('summarySection');
    const totalExpensesEl = document.getElementById('totalExpenses');
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
        summarySection.innerHTML = ''; // Hapus kartu yang sudah ada
        
        // Tambahkan kartu Total Pengeluaran terlebih dahulu
        const totalExpensesCard = document.createElement('div');
        totalExpensesCard.className = 'summary-card bg-red-50 border-l-4 border-red-500';
        totalExpensesCard.innerHTML = `<h3 class="font-semibold text-red-700">Total Pengeluaran</h3><p id="totalExpenses" class="text-xl font-bold mt-2 text-red-800">Rp0</p>`; // Menyesuaikan ukuran font di sini
        summarySection.appendChild(totalExpensesCard);

        // Hitung dan tampilkan total pengeluaran
        const totalExpenses = transactions.reduce((sum, t) => sum + t.amount, 0);
        document.getElementById('totalExpenses').textContent = formatCurrency(totalExpenses);

        // Tambahkan kartu kategori lainnya
        categories.forEach(category => {
            const total = transactions.filter(t => t.category === category).reduce((sum, t) => sum + t.amount, 0);
            const card = document.createElement('div');
            card.className = 'summary-card';
            card.innerHTML = `<h3 class="font-semibold text-slate-500">${category}</h3><p class="text-xl font-bold mt-2 text-slate-800">${formatCurrency(total)}</p>`; // Menyesuaikan ukuran font di sini
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

        // Urutkan transaksi yang difilter berdasarkan tanggal (terbaru pertama)
        filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        const groupedByDate = filteredTransactions.reduce((acc, t) => {
            (acc[t.date] = acc[t.date] || []).push(t);
            return acc;
        }, {});
        
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));
        
        // Logika paginasi berdasarkan tanggal
        const totalPages = Math.ceil(sortedDates.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const datesToDisplay = sortedDates.slice(startIndex, endIndex);

        dashboardTransactionContainer.innerHTML = '';
        emptyState.classList.toggle('hidden', datesToDisplay.length > 0);

        datesToDisplay.forEach(date => {
            const dailyTransactions = groupedByDate[date];
            const dailyTotal = dailyTransactions.reduce((sum, t) => sum + t.amount, 0);

            // Buat kartu untuk hari itu
            const dailyCard = document.createElement('div');
            dailyCard.className = 'bg-white p-4 rounded-xl shadow-lg border-2 border-slate-200 mb-4';

            // Buat header dengan tanggal dan total harian
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

            // Buat daftar transaksi untuk hari itu
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

        // Perbarui kontrol paginasi
        pageInfo.textContent = `Halaman ${currentPage} dari ${totalPages || 1}`;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    };
    
    // Event listener untuk tombol paginasi
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
    // Event listener untuk tombol edit/hapus pada tampilan kartu baru
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
        currentPage = 1; // Kembali ke halaman pertama saat pencarian baru
        renderTransactions();
    });
    dashboardDateFilter.addEventListener('change', e => { // Event listener untuk filter tanggal
        dashboardFilterDate = e.target.value;
        currentPage = 1; // Kembali ke halaman pertama saat filter tanggal baru
        renderTransactions();
    });
    [categorySelect, paymentSelect].forEach(sel => sel.innerHTML = '');
    categories.forEach(cat => categorySelect.add(new Option(cat, cat)));
    paymentTypes.forEach(pay => paymentSelect.add(new Option(pay, pay)));
    openTransactionModalBtn.addEventListener('click', openAddModal);
    closeTransactionModalBtn.addEventListener('click', closeTransactionModal);
    addTransactionModal.addEventListener('click', (e) => { if (e.target === addTransactionModal) closeTransactionModal(); });

    // --- LOGIKA BUDGET BULANAN BARU ---
    const renderBudgetSummary = () => {
        const totalMonthlyExpenses = transactions
            .filter(t => t.category === 'Bulanan')
            .reduce((sum, t) => sum + t.amount, 0);
            
        const remainingBudget = budget - totalMonthlyExpenses;

        initialBudgetDisplay.textContent = formatCurrency(budget);
        monthlyExpensesDisplay.textContent = formatCurrency(totalMonthlyExpenses);
        remainingBudgetDisplay.textContent = formatCurrency(remainingBudget);

        // Perbarui warna kartu sisa budget
        if (remainingBudget < 0) {
            remainingBudgetCard.classList.remove('bg-sky-50', 'border-sky-500');
            remainingBudgetCard.classList.add('bg-red-50', 'border-red-500');
            remainingBudgetDisplay.classList.remove('text-sky-800');
            remainingBudgetDisplay.classList.add('text-red-800');
        } else {
            remainingBudgetCard.classList.remove('bg-red-50', 'border-red-500');
            remainingBudgetCard.classList.add('bg-sky-50', 'border-sky-500');
            remainingBudgetDisplay.classList.remove('text-red-800');
            remainingBudgetDisplay.classList.add('text-sky-800');
        }
    };

    saveBudgetBtn.addEventListener('click', () => {
        const newBudget = parseFloat(initialBudgetInput.value);
        if (!isNaN(newBudget) && newBudget >= 0) {
            budget = newBudget;
            saveDataToFirestore();
            openConfirmationModal({
                title: 'Sukses', message: 'Budget bulanan berhasil diperbarui.',
                confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700',
                action: () => {}
            });
        } else {
            openConfirmationModal({
                title: 'Error', message: 'Silakan masukkan jumlah budget yang valid.',
                confirmText: 'OK', confirmClass: 'px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700',
                action: () => {}
            });
        }
    });

    // --- LOGIKA PELACAK IN/EX ---
    let inExToEditIndex = null;
    const inTotalEl = document.getElementById('inTotal');
    const exTotalEl = document.getElementById('exTotal');
    const finalTotalEl = document.getElementById('finalTotal');
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
        const totalIn = inExTransactions.filter(t => t.category === 'IN').reduce((sum, t) => sum + t.amount, 0);
        const totalEx = inExTransactions.filter(t => t.category === 'EX').reduce((sum, t) => sum + t.amount, 0);
        inTotalEl.textContent = formatCurrency(totalIn);
        exTotalEl.textContent = formatCurrency(totalEx);
        finalTotalEl.textContent = formatCurrency(totalIn - totalEx);
        finalTotalEl.classList.toggle('text-red-800', (totalIn - totalEx) < 0);
        finalTotalEl.classList.toggle('text-sky-800', (totalIn - totalEx) >= 0);
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
        
        // Urutkan tanggal (kunci) untuk memastikan urutan yang benar
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));
        
        // Logika paginasi untuk IN/EX
        const inExTotalPages = Math.ceil(sortedDates.length / inExItemsPerPage);
        const inExStartIndex = (inExCurrentPage - 1) * inExItemsPerPage;
        const inExEndIndex = inExStartIndex + inExItemsPerPage;
        const datesToDisplay = sortedDates.slice(inExStartIndex, inExEndIndex);

        inExContainer.innerHTML = '';
        inExEmptyState.classList.toggle('hidden', datesToDisplay.length > 0);

        datesToDisplay.forEach(date => {
            const dailyTransactions = groupedByDate[date];
            const dailyTotal = dailyTransactions.reduce((sum, t) => {
                return sum + (t.category === 'IN' ? t.amount : -t.amount);
            }, 0);
            const dailyTotalInEx = dailyTransactions.reduce((sum, t) => {
                return sum + t.amount;
            }, 0);

            // Buat kartu untuk hari itu
            const dailyCard = document.createElement('div');
            dailyCard.className = 'bg-white p-4 rounded-xl shadow-lg border-2 border-slate-200 mb-4';

            // Buat header dengan tanggal dan total harian
            const header = document.createElement('div');
            header.className = 'flex justify-between items-center mb-2 pb-2 border-b border-slate-200';
            header.innerHTML = `
                <div>
                    <h3 class="text-md font-bold text-slate-800">${formatDate(date)}</h3>
                </div>
                <div>
                    <span class="text-sm text-slate-500">Total: </span>
                    <span class="font-bold text-slate-800">${formatCurrency(dailyTotal)}</span>
                </div>
            `;
            dailyCard.appendChild(header);

            // Buat daftar transaksi untuk hari itu
            dailyTransactions.forEach(t => {
                const isIncome = t.category === 'IN';
                const transactionItem = document.createElement('div');
                transactionItem.className = 'flex justify-between items-center py-2 border-b border-slate-100 last:border-b-0';
                transactionItem.innerHTML = `
                    <div class="flex items-center gap-3 flex-grow">
                        <i class="fas fa-${isIncome ? 'plus' : 'minus'}-circle text-lg ${isIncome ? 'text-teal-500' : 'text-red-500'}"></i>
                        <div class="flex-grow">
                            <p class="font-semibold text-slate-800">${t.detail}</p>
                            <p class="text-xs text-slate-500">${t.category === 'IN' ? 'Pemasukan' : 'Pengeluaran'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold ${isIncome ? 'text-teal-600' : 'text-red-600'} text-sm">${formatCurrency(t.amount)}</span>
                        <button data-id="${t.id}" class="edit-btn text-sky-500 hover:text-sky-700 mr-2"><i class="fas fa-edit"></i></button>
                        <button data-id="${t.id}" class="delete-btn text-red-500 hover:text-red-700"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                dailyCard.appendChild(transactionItem);
            });
            inExContainer.appendChild(dailyCard);
        });

        // Perbarui kontrol paginasi untuk IN/EX
        inExPageInfo.textContent = `Halaman ${inExCurrentPage} dari ${inExTotalPages || 1}`;
        inExPrevPageBtn.disabled = inExCurrentPage === 1;
        inExNextPageBtn.disabled = inExCurrentPage === inExTotalPages || inExTotalPages === 0;
    };

    // Event listener untuk tombol paginasi IN/EX
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
    
    // Sisa logika IN/EX tetap sama
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
            inExTransactions.unshift({ ...inExData, id: Date.now() });
        }
        saveDataToFirestore();
        closeInExModal();
    });
    // Event listener untuk tombol edit/hapus pada tampilan kartu baru
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
        inExCurrentPage = 1; // Kembali ke halaman pertama saat pencarian baru
        renderInExTransactions();
    });
    inExDateFilter.addEventListener('change', e => { // Event listener baru untuk filter tanggal IN/EX
        inExFilterDate = e.target.value;
        inExCurrentPage = 1; // Kembali ke halaman pertama saat filter tanggal baru
        renderInExTransactions();
    });
    openInExModalBtn.addEventListener('click', openAddInExModal);
    closeInExModalBtn.addEventListener('click', closeInExModal);
    inExModal.addEventListener('click', (e) => { if (e.target === inExModal) closeInExModal(); });

    // --- LOGIKA STATISTIK ---
    const renderDashboardStats = () => {
        const ctx = document.getElementById('dashboardChart').getContext('2d');
        const categoryTotals = categories.map(category => {
            return {
                category: category,
                total: transactions
                    .filter(t => t.category === category)
                    .reduce((sum, t) => sum + t.amount, 0)
            };
        }).filter(item => item.total > 0); // Hanya tampilkan kategori dengan pengeluaran

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
                        'rgba(255, 235, 59, 0.8)' // Warna baru untuk "Jajan di luar"
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
        const totalIn = inExTransactions.filter(t => t.category === 'IN').reduce((sum, t) => sum + t.amount, 0);
        const totalEx = inExTransactions.filter(t => t.category === 'EX').reduce((sum, t) => sum + t.amount, 0);

        if (inExChartInstance) {
            inExChartInstance.destroy();
        }
        
        inExChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Pemasukan (IN)', 'Pengeluaran (EX)'],
                datasets: [{
                    label: 'Pemasukan vs Pengeluaran',
                    data: [totalIn, totalEx],
                    backgroundColor: ['rgba(75, 192, 192, 0.8)', 'rgba(255, 99, 132, 0.8)'],
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

    // --- LOGIKA MANAJEMEN BACKUP ---
    const downloadAllBtn = document.getElementById('downloadAllBtn');
    const uploadAllInput = document.getElementById('uploadAllInput');
    downloadAllBtn.addEventListener('click', () => {
        if (transactions.length === 0 && inExTransactions.length === 0) {
            openConfirmationModal({ title: 'Info', message: 'Tidak ada data untuk diunduh.', confirmText: 'OK', confirmClass: 'px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700', action: () => {} });
            return;
        }
        const allData = { transactions, inExTransactions, budget }; // Sertakan budget dalam data backup
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
                // Perbarui validasi file
                if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.inExTransactions) || typeof data.budget === 'undefined') {
                    throw new Error('Format file JSON tidak valid atau tidak lengkap.');
                }
                openConfirmationModal({
                    title: 'Muat Data Lokal', message: 'Ini akan menimpa data saat ini dengan data dari file. Data baru akan disinkronkan ke cloud. Yakin?',
                    confirmText: 'Ya, Timpa & Sinkronkan', confirmClass: 'px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors',
                    action: () => {
                        transactions = data.transactions || [];
                        inExTransactions = data.inExTransactions || [];
                        budget = data.budget || 0; // Muat budget dari file
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
    // Logika untuk menampilkan/menyembunyikan tombol
    window.addEventListener('scroll', () => {
        if (window.scrollY > 200) {
            backToTopBtn.classList.add('show');
        } else {
            backToTopBtn.classList.remove('show');
        }
    });

    // Logika untuk menggulir ke atas saat tombol diklik
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // --- KODE BARU UNTUK TAB STICKY ---
    const stickyTabs = document.getElementById('sticky-tabs');
    const headerElement = document.querySelector('header');
    
    // Perbarui: Gunakan Intersection Observer API untuk deteksi sticky yang lebih efisien
    const observer = new IntersectionObserver( 
        ([e]) => stickyTabs.classList.toggle('scrolled', e.intersectionRatio < 1), 
        { threshold: [1] }
    );
    
    // Mulai amati elemen header, saat header tidak lagi terlihat, tab akan menjadi sticky
    observer.observe(headerElement);
});
