document.addEventListener('DOMContentLoaded', () => {
    // --- Authentication Check ---
    const token = localStorage.getItem('accessToken');
    const userRole = localStorage.getItem('userRole');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // --- Selectors ---
    const form = document.getElementById('add-product-form');
    const tableBody = document.querySelector('#inventory-table tbody');
    const exportBtn = document.getElementById('export-btn');
    const selectAllCheckbox = document.getElementById('select-all');
    const editModal = document.getElementById('edit-modal');
    const editForm = document.getElementById('edit-product-form');
    const closeModalBtn = document.querySelector('.close-btn');
    let productList = [];

    // --- Analytics Selectors ---
    const ordersTableBody = document.querySelector('#orders-table tbody');
    const salesChartCanvas = document.getElementById('salesChart');
    let salesChart = null;

    // --- UI Setup based on Role ---
    if (userRole === 'manager') {
        form.style.display = 'none';
        document.querySelector('h2').textContent = 'Product View (Manager)';
        exportBtn.style.display = 'none';
    }

    // --- Fetch Products ---
    async function fetchProducts() {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const response = await fetch('/api/products', { headers });
            productList = await response.json();
            tableBody.innerHTML = '';
            productList.forEach(product => {
                const row = `<tr>
                    <td><input type="checkbox" class="product-checkbox" data-id="${product.id}"></td>
                    <td><img src="${product.image}" alt="${product.name}"></td>
                    <td>${product.name}</td>
                    <td>${product.category}</td>
                    <td>RS ${product.price.toFixed(2)}</td>
                    <td>${product.stock}</td>
                    <td class="actions-cell">
                        ${userRole === 'admin' ? 
                            `<button class="edit-btn" data-id="${product.id}">Edit</button>
                             <button class="delete-btn" data-id="${product.id}">Delete</button>` 
                            : 'View Only'}
                    </td>
                </tr>`;
                tableBody.innerHTML += row;
            });
        } catch (error) {
            console.error("Failed to fetch products:", error);
            tableBody.innerHTML = `<tr><td colspan="7">Error loading products. Is the server running?</td></tr>`;
        }
    }

    // --- Open/Close Edit Modal ---
    function openEditModal(product) {
        editForm.querySelector('#edit-id').value = product.id;
        editForm.querySelector('#edit-name').value = product.name;
        editForm.querySelector('#edit-category').value = product.category;
        editForm.querySelector('#edit-price').value = product.price;
        editForm.querySelector('#edit-stock').value = product.stock;
        editModal.style.display = 'flex';
    }
    function closeEditModal() {
        editModal.style.display = 'none';
        editForm.reset();
    }

    // --- Add Product ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const response = await fetch('/api/products', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` }, 
            body: formData 
        });
        if (response.ok) { form.reset(); fetchProducts(); } 
        else alert('Failed to add product.');
    });

    // --- Edit & Delete Products ---
    tableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const id = target.dataset.id;
        if (target.classList.contains('delete-btn')) {
            if (confirm(`Are you sure you want to delete this product?`)) {
                const response = await fetch(`/api/products/${id}`, { 
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
                if (response.ok) fetchProducts();
                else alert('Failed to delete product.');
            }
        }
        if (target.classList.contains('edit-btn')) {
            const productToEdit = productList.find(p => p.id === id);
            if (productToEdit) openEditModal(productToEdit);
        }
    });

    // --- Update Product ---
    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = editForm.querySelector('#edit-id').value;
        const formData = new FormData(editForm);
        const response = await fetch(`/api/products/${id}`, { 
            method: 'PUT', 
            headers: { 'Authorization': `Bearer ${token}` }, 
            body: formData 
        });
        if (response.ok) { closeEditModal(); fetchProducts(); } 
        else alert('Failed to update product.');
    });

    closeModalBtn.addEventListener('click', closeEditModal);

    // --- Select All Checkbox ---
    selectAllCheckbox.addEventListener('change', (event) => {
        document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = event.target.checked);
    });

    // --- Export Excel ---
    exportBtn.addEventListener('click', async () => {
        const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
        const productIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);
        if (!productIds.length) return alert('Please select at least one product to export.');
        const response = await fetch('/api/export-excel', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ productIds })
        });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'products.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } else alert('Failed to export data.');
    });

    // --- Fetch and Display Analytics ---
    async function fetchAnalyticsData() {
        try {
            const headers = { 'Authorization': `Bearer ${token}` };
            const response = await fetch('/api/analytics', { headers });
            const orders = await response.json();

            // Order Table
            ordersTableBody.innerHTML = '';
            orders.forEach(order => {
                ordersTableBody.innerHTML += `<tr>
                    <td>${order.orderId}</td>
                    <td>${new Date(order.date).toLocaleString()}</td>
                    <td>${order.customerName}</td>
                    <td>RS ${order.totalAmount.toFixed(2)}</td>
                </tr>`;
            });

            // Sales Chart
            const salesByDate = orders.reduce((acc, order) => {
                const date = new Date(order.date).toLocaleDateString('en-IN');
                acc[date] = (acc[date] || 0) + order.totalAmount;
                return acc;
            }, {});
            const chartLabels = Object.keys(salesByDate);
            const chartData = Object.values(salesByDate);

            if (salesChart) salesChart.destroy();
            salesChart = new Chart(salesChartCanvas, {
                type: 'bar',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Total Sales (RS)',
                        data: chartData,
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }]
                },
                options: { scales: { y: { beginAtZero: true } } }
            });

        } catch (error) {
            console.error("Failed to fetch analytics:", error);
            ordersTableBody.innerHTML = `<tr><td colspan="4">Error loading orders.</td></tr>`;
        }
    }

    // --- Initialize ---
    fetchProducts();
    fetchAnalyticsData();
});
