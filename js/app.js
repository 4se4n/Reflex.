// app.js
const API_BASE = 'https://reflex-backend-90x9.onrender.com/api';

// State
let currentView = 'retailer';
let pollingInterval = null;
let currentRiderId = 'Rider-001';
let pendingDeliveryIdForConfirmation = null;

// DOM Elements
const views = {
    retailer: document.getElementById('retailer-view'),
    dispatcher: document.getElementById('dispatcher-view'),
    rider: document.getElementById('rider-view'),
    public: document.getElementById('public-view')
};
const tabBtns = document.querySelectorAll('.tab-btn');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupRetailerForm();
    setupTrackingForm();
    setupRiderModal();
});

// --- Tab Switching ---
function setupTabs() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });
}

function switchView(viewId) {
    currentView = viewId;
    
    // Update tabs UI
    tabBtns.forEach(btn => {
        if (btn.dataset.view === viewId) {
            btn.classList.add('active-tab');
            btn.classList.remove('text-gray-500');
        } else {
            btn.classList.remove('active-tab');
            btn.classList.add('text-gray-500');
        }
    });

    // Toggle view visibility
    Object.keys(views).forEach(key => {
        views[key].classList.toggle('hidden', key !== viewId);
    });

    // Handle view-specific lifecycle
    if (viewId === 'dispatcher') {
        startDispatcherPolling();
    } else {
        stopDispatcherPolling();
    }

    if (viewId === 'rider') {
        fetchRiderDeliveries();
    }
}

// --- Notification Helper ---
function showNotification(elementId, message, type = 'success') {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.className = `rounded-lg p-4 text-sm font-medium border ${
        type === 'success' 
            ? 'bg-green-50 text-green-700 border-green-200' 
            : 'bg-red-50 text-reflex-red border-red-200'
    }`;
    el.classList.remove('hidden');
    
    if (type === 'success') {
        setTimeout(() => el.classList.add('hidden'), 6000);
    }
}

// --- VIEW 1: Retailer Portal ---
function setupRetailerForm() {
    const form = document.getElementById('retailer-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...`;

        const formData = new FormData(form);
        const payload = {
            customerName: formData.get('customerName'),
            customerPhone: formData.get('customerPhone'),
            deliveryAddress: formData.get('deliveryAddress'),
            itemDescription: formData.get('itemDescription')
        };

        try {
            const response = await fetch(`${API_BASE}/deliveries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                showNotification('retailer-feedback', `Success! Tracking Code: ${data.trackingCode || 'REF-' + Math.floor(1000 + Math.random() * 9000)}`, 'success');
                form.reset();
            } else {
                // Handle Zod validation errors (standard format: { error: { issues: [{ message }] } })
                const errorMsg = data.error?.issues?.map(i => i.message).join(', ') || data.message || 'Failed to create delivery request.';
                showNotification('retailer-feedback', errorMsg, 'error');
            }
        } catch (err) {
            showNotification('retailer-feedback', 'Network error. Please ensure the backend server is running on port 5000.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

// --- VIEW 2: Dispatcher Hub ---
function startDispatcherPolling() {
    fetchDeliveries();
    pollingInterval = setInterval(fetchDeliveries, 10000); // 10 seconds
}

function stopDispatcherPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

async function fetchDeliveries() {
    try {
        const response = await fetch(`${API_BASE}/deliveries`);
        if (!response.ok) throw new Error('Failed to fetch deliveries');
        const data = await response.json();
        renderDispatcherTable(data);
    } catch (err) {
        console.error('Dispatcher fetch error:', err);
    }
}

function renderDispatcherTable(deliveries) {
    const tbody = document.getElementById('dispatcher-table-body');
    const emptyState = document.getElementById('dispatcher-empty');
    
    if (!deliveries || deliveries.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    tbody.innerHTML = deliveries.map(d => {
        const statusColor = getStatusColor(d.status);
        return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-reflex-black">${d.trackingCode}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    <div class="font-medium">${d.customerName}</div>
                    <div class="text-xs text-gray-500">${d.customerPhone}</div>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title="${d.deliveryAddress}">${d.deliveryAddress}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2.5 py-1 text-xs font-bold rounded-full ${statusColor}">${d.status.replace('_', ' ')}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    ${d.assignedRider || '<span class="text-gray-400 italic">Unassigned</span>'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <div class="flex items-center gap-2">
                        <select id="rider-select-${d.id}" class="text-xs border border-gray-300 rounded-md px-2 py-1.5 outline-none focus:border-reflex-red focus:ring-1 focus:ring-reflex-red bg-white">
                            <option value="">Select Rider</option>
                            <option value="Rider-001">Rider-001</option>
                            <option value="Rider-002">Rider-002</option>
                            <option value="Rider-003">Rider-003</option>
                        </select>
                        <button onclick="assignRider('${d.id}')" class="bg-reflex-black text-white text-xs font-bold px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors">Assign</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getStatusColor(status) {
    switch(status) {
        case 'ASSIGNED': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
        case 'PICKED_UP': return 'bg-blue-100 text-blue-800 border border-blue-200';
        case 'DELIVERED': return 'bg-green-100 text-green-800 border border-green-200';
        default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
}

async function assignRider(id) {
    const select = document.getElementById(`rider-select-${id}`);
    const riderName = select.value;
    if (!riderName) {
        alert('Please select a rider from the dropdown first.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/deliveries/${id}/assign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ riderId: riderName })
        });

        if (response.ok) {
            fetchDeliveries(); // Refresh to show updated state
        } else {
            const data = await response.json();
            alert(data.message || 'Failed to assign rider.');
        }
    } catch (err) {
        alert('Network error during assignment.');
    }
}

// --- VIEW 3: Rider Mobile View ---
document.getElementById('rider-context-select').addEventListener('change', (e) => {
    currentRiderId = e.target.value;
    fetchRiderDeliveries();
});

async function fetchRiderDeliveries() {
    try {
        // Fetching all and filtering client-side to simulate backend rider-specific endpoint
        const response = await fetch(`${API_BASE}/deliveries`);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        
        const myDeliveries = data.filter(d => d.assignedRider === currentRiderId && d.status !== 'DELIVERED');
        renderRiderCards(myDeliveries);
    } catch (err) {
        console.error('Rider fetch error:', err);
    }
}

function renderRiderCards(deliveries) {
    const container = document.getElementById('rider-cards-container');
    const emptyState = document.getElementById('rider-empty');

    if (deliveries.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = deliveries.map(d => {
        const isAssigned = d.status === 'ASSIGNED';
        const isPickedUp = d.status === 'PICKED_UP';
        
        return `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 transition-shadow hover:shadow-md">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-xs font-bold text-reflex-red bg-red-50 px-2.5 py-1 rounded-md border border-red-100">${d.trackingCode}</span>
                    <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">${d.status.replace('_', ' ')}</span>
                </div>
                <h3 class="font-bold text-reflex-black text-lg mb-1">${d.customerName}</h3>
                <p class="text-sm text-gray-600 mb-5 line-clamp-2">${d.deliveryAddress}</p>
                
                <div class="space-y-3">
                    ${isAssigned ? `
                        <button onclick="updateStatus('${d.id}', 'PICKED_UP')" class="w-full bg-reflex-black text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition-colors text-sm shadow-sm">
                            Mark Picked Up
                        </button>
                    ` : ''}
                    
                    ${isPickedUp ? `
                        <button onclick="openConfirmationModal('${d.id}')" class="w-full bg-reflex-red text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors text-sm shadow-sm flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Mark Delivered
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function updateStatus(id, newStatus, confirmationCode = null) {
    try {
        const payload = { status: newStatus };
        if (confirmationCode) payload.confirmationCode = confirmationCode;

        const response = await fetch(`${API_BASE}/deliveries/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            fetchRiderDeliveries();
            closeConfirmationModal();
        } else {
            const data = await response.json();
            alert(data.message || 'Failed to update status. Invalid transition or missing code.');
        }
    } catch (err) {
        alert('Network error during status update.');
    }
}

// --- Rider Modal Logic ---
function setupRiderModal() {
    document.getElementById('modal-cancel').addEventListener('click', closeConfirmationModal);
    document.getElementById('modal-confirm').addEventListener('click', () => {
        const code = document.getElementById('confirmation-code-input').value.trim();
        if (!code) {
            alert('Please enter the confirmation code provided by the customer.');
            return;
        }
        updateStatus(pendingDeliveryIdForConfirmation, 'DELIVERED', code);
    });
}

function openConfirmationModal(id) {
    pendingDeliveryIdForConfirmation = id;
    document.getElementById('confirmation-code-input').value = '';
    const modal = document.getElementById('confirmation-modal');
    modal.classList.remove('hidden');
    // Small timeout to allow CSS transition to trigger after removing 'hidden'
    setTimeout(() => {
        modal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0');
        modal.querySelector('.modal-content').classList.add('scale-100', 'opacity-100');
    }, 10);
    document.getElementById('confirmation-code-input').focus();
}

function closeConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    modal.querySelector('.modal-content').classList.remove('scale-100', 'opacity-100');
    modal.querySelector('.modal-content').classList.add('scale-95', 'opacity-0');
    
    setTimeout(() => {
        pendingDeliveryIdForConfirmation = null;
        modal.classList.add('hidden');
    }, 200); // Match CSS transition duration
}

// --- VIEW 4: Public Tracking ---
function setupTrackingForm() {
    document.getElementById('tracking-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const trackingCode = document.getElementById('tracking-input').value.trim().toUpperCase();
        if (!trackingCode) return;

        const resultDiv = document.getElementById('tracking-result');
        const errorDiv = document.getElementById('tracking-error');
        
        resultDiv.classList.add('hidden');
        errorDiv.classList.add('hidden');

        try {
            const response = await fetch(`${API_BASE}/deliveries/${trackingCode}`);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Tracking ID not found. Please check and try again.');
            }
            
            const data = await response.json();
            renderTrackingResult(data);
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('hidden');
        }
    });
}

function renderTrackingResult(data) {
    document.getElementById('result-tracking-code').textContent = data.trackingCode;
    document.getElementById('result-customer').textContent = data.customerName;
    
    const badge = document.getElementById('result-status-badge');
    badge.textContent = data.status.replace('_', ' ');
    badge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusColor(data.status)}`;

    // Timeline logic
    const steps = ['ASSIGNED', 'PICKED_UP', 'DELIVERED'];
    const currentIndex = steps.indexOf(data.status);

    document.querySelectorAll('.timeline-step').forEach((stepEl, index) => {
        stepEl.classList.remove('completed', 'active');
        const indicator = stepEl.querySelector('.step-indicator');
        
        // Reset base classes
        indicator.className = 'step-indicator w-10 h-10 rounded-full border-4 border-white flex items-center justify-center z-10 shrink-0 shadow-sm transition-all duration-300';
        
        if (index < currentIndex) {
            stepEl.classList.add('completed');
            indicator.classList.add('bg-green-500');
        } else if (index === currentIndex) {
            stepEl.classList.add('active');
            indicator.classList.add('bg-reflex-red');
        } else {
            indicator.classList.add('bg-gray-200');
        }
    });

    document.getElementById('tracking-result').classList.remove('hidden');
}