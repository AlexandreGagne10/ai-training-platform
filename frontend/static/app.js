// API Configuration
const API_CONFIG = {
    baseUrl: 'http://localhost:8000',
    endpoints: {
        health: '/health',
        yoloTrain: '/api/v1/training/yolo/',
        gemmaTrain: '/api/v1/training/gemma/',
        jobStatus: '/api/v1/training/jobs/{job_id}',
        jobsList: '/api/v1/training/jobs/',
        modelsList: '/api/v1/models/',
        cancelJob: '/api/v1/training/jobs/{job_id}',
        deleteJob: '/api/v1/training/jobs/{job_id}/delete' // Ajout de la nouvelle route
    }
};

// Application Data
const APP_DATA = {
    yoloModels: [
        { value: "yolov8n", label: "YOLOv8 Nano (6.2M params)", description: "Ultra-fast model for edge devices" },
        { value: "yolov8s", label: "YOLOv8 Small (11.2M params)", description: "Balanced speed/accuracy" },
        { value: "yolov8m", label: "YOLOv8 Medium (25.9M params)", description: "Higher accuracy applications" }
    ],
    gemmaModels: [
        { value: "gemma-1b", label: "Gemma 1B", description: "1B parameters, efficient for most tasks" },
        { value: "gemma-4b", label: "Gemma 4B", description: "4B parameters, higher capability model" }
    ]
};

// Application State
let appState = {
    apiConnected: false,
    activeJobs: new Map(),
    models: [],
    currentJobLogs: new Map(),
    pollingIntervals: new Map(),
    uploadedFiles: new Map(),
    connectionCheckAttempts: 0
};

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    console.log('🚀 Initializing AI Model Training Platform...');
    setupEventListeners();
    loadSelectOptions();
    setTimeout(checkApiConnection, 1000);
    await loadDashboardData();
    console.log('✅ Application initialized successfully');
}

// API Connection Management
async function checkApiConnection() {
    if (appState.connectionCheckAttempts > 3) {
        setOfflineMode();
        return;
    }
    const statusElement = document.getElementById('apiStatus');
    if (!statusElement) return;
    const statusDot = statusElement.querySelector('.status-dot');
    const statusText = statusElement.querySelector('.status-text');
    try {
        appState.connectionCheckAttempts++;
        const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.health}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(3000)
        });
        if (response.ok) {
            appState.apiConnected = true;
            appState.connectionCheckAttempts = 0;
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected';
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        setOfflineMode();
        console.log('API unavailable, offline mode activated');
    }
}

function setOfflineMode() {
    const statusElement = document.getElementById('apiStatus');
    if (!statusElement) return;
    const statusDot = statusElement.querySelector('.status-dot');
    const statusText = statusElement.querySelector('.status-text');
    appState.apiConnected = false;
    statusDot.className = 'status-dot warning';
    statusText.textContent = 'Demo Mode';
}

// Event Listeners Setup
function setupEventListeners() {
    document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', handleNavigation));
    document.querySelectorAll('.action-card').forEach(card => card.addEventListener('click', handleQuickAction));
    document.getElementById('yoloForm')?.addEventListener('submit', handleYoloSubmit);
    document.getElementById('gemmaForm')?.addEventListener('submit', handleGemmaSubmit);
    setupFileUploads();
    setupParameterSliders();
    setupModalControls();
    document.getElementById('validateYoloConfig')?.addEventListener('click', validateYoloConfig);
    document.getElementById('validateGemmaConfig')?.addEventListener('click', validateGemmaConfig);
    document.getElementById('refreshJobs')?.addEventListener('click', () => loadJobs(true));
    document.getElementById('refreshModels')?.addEventListener('click', () => loadModels(true));
    document.getElementById('jobTypeFilter')?.addEventListener('change', applyJobFilters);
    document.getElementById('jobStatusFilter')?.addEventListener('change', applyJobFilters);
}

// Navigation Handler
function handleNavigation(e) {
    e.preventDefault();
    const section = e.currentTarget.dataset.section;
    if (section) {
        showSection(section);
        switch(section) {
            case 'jobs': loadJobs(); break;
            case 'models': loadModels(); break;
            case 'dashboard': loadDashboardData(); break;
        }
    }
}

function showSection(sectionId) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');
}

// Quick Actions Handler
function handleQuickAction(e) {
    e.preventDefault();
    const action = e.currentTarget.dataset.action;
    if (action) showSection(action);
}

// Load Select Options
function loadSelectOptions() {
    const yoloModelSelect = document.getElementById('yoloModel');
    if (yoloModelSelect) {
        yoloModelSelect.innerHTML = '<option value="">Select a model</option>';
        APP_DATA.yoloModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.label;
            option.title = model.description;
            yoloModelSelect.appendChild(option);
        });
    }
    const gemmaModelSelect = document.getElementById('gemmaModel');
    if (gemmaModelSelect) {
        gemmaModelSelect.innerHTML = '<option value="">Select a model</option>';
        APP_DATA.gemmaModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.label;
            option.title = model.description;
            gemmaModelSelect.appendChild(option);
        });
    }
}

// File Upload Setup
function setupFileUploads() {
    ['yolo', 'gemma'].forEach(type => {
        const uploadZone = document.getElementById(`${type}Upload`);
        const fileInput = document.getElementById(`${type}FileInput`);
        if (uploadZone && fileInput) {
            uploadZone.addEventListener('click', () => fileInput.click());
            uploadZone.addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); });
            uploadZone.addEventListener('dragleave', e => e.currentTarget.classList.remove('dragover'));
            uploadZone.addEventListener('drop', e => {
                e.preventDefault();
                e.currentTarget.classList.remove('dragover');
                processFiles(e.dataTransfer.files, type);
            });
            fileInput.addEventListener('change', e => processFiles(e.target.files, type));
        }
    });
}

function processFiles(files, type) {
    if (files.length === 0) return;
    const uploadZone = document.getElementById(`${type}Upload`);
    uploadZone.innerHTML = `
        <div class="upload-icon">✅</div>
        <div class="upload-text">
            <h4>Files received</h4>
            <p>${files.length} file(s) ready</p>
        </div>
    `;
    appState.uploadedFiles.set(type, files);
    updateSubmitButton(type);
    showToast('Files Staged', `${files.length} file(s) ready for training.`, 'success');
}

// Parameter Sliders Setup
function setupParameterSliders() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const valueSpan = document.getElementById(`${slider.id}Value`);
        if (valueSpan) {
            const updateValue = () => {
                valueSpan.textContent = slider.id.includes('LearningRate') ? parseFloat(slider.value).toFixed(4) : slider.value;
            };
            slider.addEventListener('input', updateValue);
            updateValue();
        }
    });
}

function updateSubmitButton(type) {
    const submitBtn = document.getElementById(`start${type.charAt(0).toUpperCase() + type.slice(1)}Training`);
    if (submitBtn) submitBtn.disabled = !validateForm(type);
}

// Form Validation
function validateYoloConfig() { validateAndNotify('yolo'); }
function validateGemmaConfig() { validateAndNotify('gemma'); }

function validateAndNotify(type) {
    const isValid = validateForm(type);
    document.getElementById(`start${type.charAt(0).toUpperCase() + type.slice(1)}Training`).disabled = !isValid;
    if (isValid) showToast('Configuration Valid', `All ${type.toUpperCase()} parameters are correct`, 'success');
    else showToast('Configuration Invalid', 'Please check missing parameters', 'error');
}

function validateForm(type) {
    const name = document.getElementById(`${type}TrainingName`).value.trim();
    const model = document.getElementById(`${type}Model`).value;
    const hasFiles = appState.uploadedFiles.has(type);
    return name !== '' && model !== '' && hasFiles;
}

// Form Submissions
async function handleYoloSubmit(e) {
    e.preventDefault();
    if (!validateForm('yolo')) return;
    const config = {
        name: document.getElementById('yoloTrainingName').value,
        model: document.getElementById('yoloModel').value,
        dataset_path: '/app/datasets/vehicles', // This is a placeholder for the backend
        epochs: parseInt(document.getElementById('yoloEpochs').value),
        batch_size: parseInt(document.getElementById('yoloBatchSize').value),
        learning_rate: parseFloat(document.getElementById('yoloLearningRate').value),
        image_size: parseInt(document.getElementById('yoloImageSize').value),
        device: document.getElementById('yoloDevice').value
    };
    await submitTrainingJob('yolo', config);
}

async function handleGemmaSubmit(e) {
    e.preventDefault();
    if (!validateForm('gemma')) return;
    const config = {
        name: document.getElementById('gemmaTrainingName').value,
        model: document.getElementById('gemmaModel').value,
        dataset_path: '/app/datasets/gemma_text_example.json', // Placeholder
        task: 'text-generation',
        epochs: parseInt(document.getElementById('gemmaEpochs').value),
        batch_size: parseInt(document.getElementById('gemmaBatchSize').value),
        learning_rate: parseFloat(document.getElementById('gemmaLearningRate').value),
        max_length: parseInt(document.getElementById('gemmaMaxLength').value)
    };
    await submitTrainingJob('gemma', config);
}

async function submitTrainingJob(type, config) {
    const endpoint = type === 'yolo' ? API_CONFIG.endpoints.yoloTrain : API_CONFIG.endpoints.gemmaTrain;
    const submitBtn = document.getElementById(`start${type.charAt(0).toUpperCase() + type.slice(1)}Training`);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting...';

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'API Error');
        
        showToast('Job Submitted', `Job ${result.job_id} started`, 'success');
        
        // --- CORRECTION ---
        // Switch to the jobs page first, then refresh after a short delay
        showSection('jobs');
        setTimeout(() => {
            loadJobs();
            loadDashboardData();
        }, 500); // 500ms delay to allow backend to update

        resetForm(type);

    } catch (error) {
        showToast('Error', `Failed to start training: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Start Training';
    }
}


function resetForm(type) {
    const form = document.getElementById(`${type}Form`);
    if (form) form.reset();
    const uploadZone = document.getElementById(`${type}Upload`);
    if (uploadZone) {
        uploadZone.innerHTML = `
            <div class="upload-icon">${type === 'yolo' ? '📁' : '📄'}</div>
            <div class="upload-text"><h4>Drop dataset here</h4><p>Or click to browse</p></div>
        `;
    }
    appState.uploadedFiles.delete(type);
    setupParameterSliders();
}

// Load Dashboard, Jobs, Models (main functions)
async function loadDashboardData() {
    await Promise.all([loadJobs(false), loadModels(false)]); // Load data without re-rendering
    updateDashboardUI();
    updateRecentActivity();
}

async function loadJobs(render = true) {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.jobsList}`);
        if (!response.ok) throw new Error('API request failed');
        const result = await response.json();
        const jobs = result.jobs || [];
        
        const currentJobIds = jobs.map(j => j.job_id);
        
        // Stop polling for jobs that are no longer present or are completed/failed
        appState.pollingIntervals.forEach((intervalId, jobId) => {
            const job = jobs.find(j => j.job_id === jobId);
            if (!job || !['running', 'pending'].includes(job.status)) {
                clearInterval(intervalId);
                appState.pollingIntervals.delete(jobId);
            }
        });

        appState.activeJobs.clear();
        jobs.forEach(job => {
            appState.activeJobs.set(job.job_id, {
                id: job.job_id,
                name: job.name,
                model_type: job.model_type,
                status: job.status,
                progress: job.progress || 0,
                created_at: job.created_at,
                results: job.results,
                metrics: job.metrics || {}
            });
            // Start polling if it's running/pending and not already being polled
            if (['running', 'pending'].includes(job.status) && !appState.pollingIntervals.has(job.job_id)) {
                startJobPolling(job.job_id);
            }
        });

        if (render) renderJobsUI();

    } catch (error) {
        console.error('❌ Error loading jobs:', error);
        if (render) {
            showToast('Error', 'Unable to load jobs', 'error');
            const jobsContainer = document.getElementById('jobsContainer');
            if(jobsContainer) jobsContainer.innerHTML = `<div class="no-data-placeholder"><h3>Error loading jobs. Please try again.</h3></div>`;
        }
    }
}


async function loadModels(render = true) {
    try {
        const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.modelsList}`);
        if (!response.ok) throw new Error('API request failed');
        const result = await response.json();
        appState.models = result.models || [];
        if (render) renderModelsUI();
    } catch (error) {
        console.error('❌ Error loading models:', error);
        if (render) showToast('Error', 'Unable to load models', 'error');
    }
}

// UI Rendering Functions
function updateDashboardUI() {
    const running = Array.from(appState.activeJobs.values()).filter(j => ['running', 'pending'].includes(j.status)).length;
    const completed = Array.from(appState.activeJobs.values()).filter(j => j.status === 'completed').length;
    const failed = Array.from(appState.activeJobs.values()).filter(j => j.status === 'failed').length;
    document.getElementById('runningJobs').textContent = running;
    document.getElementById('completedJobs').textContent = completed;
    document.getElementById('failedJobs').textContent = failed;
    document.getElementById('totalModels').textContent = appState.models.length;
}

function renderJobsUI() {
    const jobsContainer = document.getElementById('jobsContainer');
    jobsContainer.innerHTML = ''; // Clear previous content
    applyJobFilters();
}

function renderModelsUI() {
    const modelsContainer = document.getElementById('modelsContainer');
    if (!modelsContainer) return;
    if (appState.models.length === 0) {
        modelsContainer.innerHTML = `<div class="no-data-placeholder"><h3>No trained models found.</h3></div>`;
        return;
    }
    modelsContainer.innerHTML = appState.models.map(createModelCard).join('');
    // Re-attach event listeners
    modelsContainer.querySelectorAll('.model-test-btn').forEach(btn => btn.addEventListener('click', e => showModelTest(e.currentTarget.dataset.modelId)));
    modelsContainer.querySelectorAll('.model-download-btn').forEach(btn => btn.addEventListener('click', e => downloadModel(e.currentTarget.dataset.modelId)));
}

// Job Polling
function startJobPolling(jobId) {
    if (!jobId || appState.pollingIntervals.has(jobId)) return;
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.jobStatus.replace('{job_id}', jobId)}`);
            if (!response.ok) { // Handles 404 not found, etc.
                throw new Error(`Status ${response.status}`);
            }
            const jobData = await response.json();
            const job = appState.activeJobs.get(jobId);
            if (job) {
                job.status = jobData.status;
                job.progress = jobData.progress || job.progress;
                job.results = jobData.results || job.results;
                job.metrics = jobData.metrics || job.metrics;
                
                updateJobUI(jobId, job);

                if (!['running', 'pending'].includes(job.status)) {
                    clearInterval(interval);
                    appState.pollingIntervals.delete(jobId);
                    showToast('Job Update', `Job ${job.name} is ${job.status}.`, 'info');
                    loadDashboardData();
                }
            }
        } catch (error) {
            console.error(`Error polling job ${jobId}:`, error);
            clearInterval(interval);
            appState.pollingIntervals.delete(jobId);
        }
    }, 5000);
    appState.pollingIntervals.set(jobId, interval);
}

function updateJobUI(jobId, jobData) {
    const jobCard = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
    if (!jobCard) return;

    const statusClass = {pending: 'warning', running: 'info', completed: 'success', failed: 'error', cancelled: 'error'}[jobData.status] || 'info';
    jobCard.querySelector('.status').className = `status status--${statusClass}`;
    jobCard.querySelector('.status').textContent = jobData.status.charAt(0).toUpperCase() + jobData.status.slice(1);
    jobCard.querySelector('.job-progress-text').textContent = `${jobData.progress || 0}%`;
    jobCard.querySelector('.progress-fill').style.width = `${jobData.progress || 0}%`;
    
    const cancelButton = jobCard.querySelector('.job-cancel-btn');
    if (cancelButton) cancelButton.style.display = ['running', 'pending'].includes(jobData.status) ? 'inline-block' : 'none';
    
    const deleteButton = jobCard.querySelector('.job-delete-btn');
    if (deleteButton) deleteButton.style.display = ['completed', 'failed', 'cancelled'].includes(jobData.status) ? 'inline-block' : 'none';


    const metricsContainer = jobCard.querySelector('.job-metrics');
    if (metricsContainer && jobData.metrics && Object.keys(jobData.metrics).length > 0) {
        metricsContainer.innerHTML = Object.entries(jobData.metrics).map(([key, value]) => `
            <div class="metric">
                <span class="metric-label">${key}</span>
                <span class="metric-value">${typeof value === 'number' ? value.toFixed(3) : value}</span>
            </div>
        `).join('');
    }
}

// Card Creation
function createJobCard(job) {
    const statusClass = {pending: 'warning', running: 'info', completed: 'success', failed: 'error', cancelled: 'error'}[job.status] || 'info';
    const metricsHtml = job.metrics && Object.keys(job.metrics).length > 0 ?
        Object.entries(job.metrics).map(([key, value]) => `
            <div class="metric"><span class="metric-label">${key}</span><span class="metric-value">${typeof value === 'number' ? value.toFixed(3) : value}</span></div>
        `).join('') :
        `<div class="metric"><span class="metric-label">Metrics</span><span class="metric-value">N/A</span></div>`;

    const isRunning = ['running', 'pending'].includes(job.status);
    const isFinished = ['completed', 'failed', 'cancelled'].includes(job.status);

    return `
        <div class="job-card" data-job-id="${job.id}">
            <div class="job-header">
                <div class="job-info"><h4>${job.name}</h4><span class="job-type">${job.model_type.toUpperCase()}</span></div>
                <div class="job-actions">
                    <button class="btn btn--outline btn--sm job-details-btn" data-job-id="${job.id}">Details</button>
                    <button class="btn btn--outline btn--sm job-cancel-btn" data-job-id="${job.id}" style="display: ${isRunning ? 'inline-block' : 'none'};">Cancel</button>
                    <button class="btn btn--danger btn--sm job-delete-btn" data-job-id="${job.id}" style="display: ${isFinished ? 'inline-block' : 'none'};">Delete</button>
                </div>
            </div>
            <div class="job-progress">
                <div class="job-progress-header">
                    <span class="status status--${statusClass}">${job.status.charAt(0).toUpperCase() + job.status.slice(1)}</span>
                    <span class="job-progress-text">${job.progress}%</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width: ${job.progress}%"></div></div>
            </div>
            <div class="job-metrics">${metricsHtml}</div>
        </div>
    `;
}

function createModelCard(model) {
    const metricsDisplay = model.metrics ? Object.entries(model.metrics).map(([key, value]) => `
        <div class="metric"><span class="metric-label">${key}</span><span class="metric-value">${typeof value === 'number' ? value.toFixed(3) : value}</span></div>
    `).join('') : `<div class="metric"><span class="metric-label">Metrics</span><span class="metric-value">N/A</span></div>`;

    return `
        <div class="model-card">
            <div class="model-header">
                <div class="model-info"><h4>${model.name}</h4><span class="model-type">${model.type.toUpperCase()}</span></div>
                <div class="model-actions">
                    <button class="btn btn--outline btn--sm model-test-btn" data-model-id="${model.id}">Test</button>
                    <button class="btn btn--secondary btn--sm model-download-btn" data-model-id="${model.id}">Download</button>
                </div>
            </div>
            <div class="job-metrics">
                <div class="metric"><span class="metric-label">Path</span><span class="metric-value">${model.model_path}</span></div>
                <div class="metric"><span class="metric-label">Created</span><span class="metric-value">${new Date(model.created_at).toLocaleDateString()}</span></div>
                ${metricsDisplay}
            </div>
        </div>
    `;
}

// Modal and Actions
function setupModalControls() {
    document.querySelectorAll('.modal-overlay, .modal-close').forEach(el => {
        el.addEventListener('click', e => e.currentTarget.closest('.modal').classList.add('hidden'));
    });
}

async function showJobDetails(jobId) {
    if (!jobId || jobId === 'undefined') {
        showToast('Error', 'Invalid Job ID provided.', 'error');
        return;
    }
    try {
        const job = appState.activeJobs.get(jobId);
        if (!job) {
             throw new Error('Job not found in local state.');
        }

        const modal = document.getElementById('jobModal');
        document.getElementById('jobModalTitle').textContent = job.name;
        
        // Use the full job object from appState for display
        document.getElementById('jobModalBody').innerHTML = `<pre><code>${JSON.stringify(job.results || job, null, 2)}</code></pre>`;
        
        modal.classList.remove('hidden');
    } catch (error) {
        showToast('Error', `Unable to load job details: ${error.message}`, 'error');
    }
}


function cancelJob(jobId) {
    if (!jobId || jobId === 'undefined') {
        showToast('Error', 'Invalid Job ID provided.', 'error');
        return;
    }
    showConfirmationModal('Are you sure you want to cancel this job?', async () => {
        try {
            const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.cancelJob.replace('{job_id}', jobId)}`, { method: 'DELETE' });
            if (!response.ok) throw new Error( (await response.json()).detail || 'API error' );
            showToast('Job Cancelled', `Job ${jobId} was cancelled.`, 'success');
            loadJobs();
            loadDashboardData();
        } catch (error) {
            showToast('Error', `Failed to cancel job: ${error.message}`, 'error');
        }
    });
}

function deleteJob(jobId) {
    if (!jobId || jobId === 'undefined') {
        showToast('Error', 'Invalid Job ID provided.', 'error');
        return;
    }
    showConfirmationModal('Are you sure you want to permanently delete this job and its data?', async () => {
        try {
            const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.deleteJob.replace('{job_id}', jobId)}`, { method: 'DELETE' });
            if (!response.ok) throw new Error( (await response.json()).detail || 'API error' );
            showToast('Job Deleted', `Job ${jobId} is being deleted.`, 'success');
            
            // Remove from UI immediately
            const jobCard = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
            if (jobCard) jobCard.remove();
            appState.activeJobs.delete(jobId);
            
            loadDashboardData(); // Refresh dashboard stats
        } catch (error) {
            showToast('Error', `Failed to delete job: ${error.message}`, 'error');
        }
    });
}


function showModelTest(modelId) { showToast('Info', 'Test functionality is not implemented yet.', 'info'); }
function downloadModel(modelId) { showToast('Info', 'Download functionality is not implemented yet.', 'info'); }

function updateRecentActivity() {
    const activityList = document.getElementById('recentActivity');
    const recentJobs = Array.from(appState.activeJobs.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    if (recentJobs.length === 0) {
        activityList.innerHTML = `<div class="activity-item"><span>No recent activity.</span></div>`;
        return;
    }
    activityList.innerHTML = recentJobs.map(job => `
        <div class="activity-item">
            <div class="activity-icon">${job.model_type === 'yolo' ? '🎯' : '💬'}</div>
            <div class="activity-content">
                <div class="activity-title">${job.name} - ${job.status}</div>
                <div class="activity-time">${new Date(job.created_at).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
}

// Job Filters
function applyJobFilters() {
    const typeFilter = document.getElementById('jobTypeFilter').value;
    const statusFilter = document.getElementById('jobStatusFilter').value;
    const jobsContainer = document.getElementById('jobsContainer');
    
    const filteredJobs = Array.from(appState.activeJobs.values()).filter(job => {
        const typeMatch = !typeFilter || job.model_type.toLowerCase() === typeFilter;
        let statusMatch = !statusFilter || job.status.toLowerCase() === statusFilter;
        if (statusFilter === 'running' && job.status.toLowerCase() === 'pending') statusMatch = true;
        return typeMatch && statusMatch;
    });

    if (filteredJobs.length === 0) {
        jobsContainer.innerHTML = `<div class="no-data-placeholder"><h3>No jobs match filters.</h3></div>`;
        return;
    }

    jobsContainer.innerHTML = filteredJobs.map(createJobCard).join('');
    // Re-add event listeners
    jobsContainer.querySelectorAll('.job-details-btn').forEach(btn => btn.addEventListener('click', e => showJobDetails(e.currentTarget.dataset.jobId)));
    jobsContainer.querySelectorAll('.job-cancel-btn').forEach(btn => btn.addEventListener('click', e => cancelJob(e.currentTarget.dataset.jobId)));
    jobsContainer.querySelectorAll('.job-delete-btn').forEach(btn => btn.addEventListener('click', e => deleteJob(e.currentTarget.dataset.jobId)));
}

// Toast Notifications
function showToast(title, message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>
        <button class="toast-close">&times;</button>
    `;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Confirmation Modal
function showConfirmationModal(message, onConfirm) {
    const modal = document.getElementById('confirmationModal');
    if (!modal) return;
    
    const messageEl = modal.querySelector('#confirmationMessage');
    const confirmBtn = modal.querySelector('#confirmActionBtn');
    const cancelBtn = modal.querySelector('#cancelActionBtn');

    messageEl.textContent = message;

    // Clone and replace the confirm button to remove old event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const closeModal = () => modal.classList.add('hidden');

    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
    
    cancelBtn.addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    
    modal.classList.remove('hidden');
}
