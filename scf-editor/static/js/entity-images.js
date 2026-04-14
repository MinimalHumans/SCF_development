/* ==========================================================================
   SCF Editor — Entity Images (Reference Tab)
   Upload, gallery, descriptions, lightbox preview.
   ========================================================================== */

(function() {
    'use strict';

    // ── State ──
    let currentImages = [];
    let lightboxIndex = -1;

    // ── Init (called on page load and after htmx swaps) ──
    function initImagePanel() {
        const panel = document.getElementById('image-reference-panel');
        if (!panel) return;

        const entityType = panel.dataset.entityType;
        const entityId = panel.dataset.entityId;
        if (!entityType || !entityId) return;

        initUploadZone(panel, entityType, entityId);
        fetchImages(entityType, entityId);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Upload Zone
    // ═══════════════════════════════════════════════════════════════════

    function initUploadZone(panel, entityType, entityId) {
        const zone = panel.querySelector('.image-upload-zone');
        const fileInput = panel.querySelector('.image-upload-input');
        if (!zone || !fileInput) return;

        // Click to open file browser
        zone.addEventListener('click', (e) => {
            if (e.target === fileInput) return;
            fileInput.click();
        });

        // File selected
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                uploadFiles(Array.from(fileInput.files), entityType, entityId, zone);
                fileInput.value = '';  // Reset so same file can be re-selected
            }
        });

        // Drag and drop
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files).filter(f => {
                const ext = f.name.split('.').pop().toLowerCase();
                return ['jpg', 'jpeg', 'png'].includes(ext);
            });

            if (files.length > 0) {
                uploadFiles(files, entityType, entityId, zone);
            } else {
                showToast('Only JPG and PNG files are supported');
            }
        });
    }

    async function uploadFiles(files, entityType, entityId, zone) {
        zone.classList.add('uploading');
        const progressEl = zone.querySelector('.image-upload-progress');

        for (let i = 0; i < files.length; i++) {
            if (progressEl) {
                progressEl.textContent = files.length > 1
                    ? `Uploading ${i + 1} of ${files.length}…`
                    : 'Uploading…';
            }

            const formData = new FormData();
            formData.append('file', files[i]);

            try {
                const res = await fetch(`/api/images/${entityType}/${entityId}`, {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    showToast('Upload failed: ' + (err.detail || 'unknown error'));
                    continue;
                }

                const data = await res.json();
                currentImages.push({
                    ...data,
                    exists: true,
                    created_at: new Date().toISOString(),
                });

            } catch (e) {
                showToast('Upload error: ' + e.message);
            }
        }

        zone.classList.remove('uploading');
        renderImageGrid(entityType, entityId);
        updateImageCount();
        showToast(files.length === 1 ? 'Image uploaded' : `${files.length} images uploaded`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Fetch & Render
    // ═══════════════════════════════════════════════════════════════════

    async function fetchImages(entityType, entityId) {
        try {
            const res = await fetch(`/api/images/${entityType}/${entityId}`);
            if (!res.ok) throw new Error('Failed to load images');
            currentImages = await res.json();
        } catch (e) {
            currentImages = [];
            console.error('Image fetch failed:', e);
        }
        renderImageGrid(entityType, entityId);
        updateImageCount();
    }

    function renderImageGrid(entityType, entityId) {
        const grid = document.getElementById('image-grid');
        if (!grid) return;

        if (currentImages.length === 0) {
            grid.innerHTML = '<div class="image-grid-empty">No reference images yet. Upload images above.</div>';
            return;
        }

        const project = getCookie('scf_project');
        const fragment = document.createDocumentFragment();

        currentImages.forEach((img, index) => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.dataset.imageId = img.id;

            const imgUrl = `/project-files/${project}/${img.relative_path}`;

            if (img.exists) {
                card.innerHTML = `
                    <div class="image-card-thumb" data-index="${index}">
                        <img src="${imgUrl}" alt="${escHtml(img.description || img.filename)}" loading="lazy">
                        <button class="image-card-zoom" title="View full size">⛶</button>
                    </div>
                    <div class="image-card-body">
                        <textarea class="image-card-desc"
                                  placeholder="Add a description…"
                                  data-image-id="${img.id}">${escHtml(img.description || '')}</textarea>
                    </div>
                    <div class="image-card-footer">
                        <span class="image-card-filename" title="${escHtml(img.filename)}">${escHtml(img.filename)}</span>
                        <button class="image-card-delete" data-image-id="${img.id}" title="Delete image">✕</button>
                    </div>
                `;
            } else {
                card.innerHTML = `
                    <div class="image-card-thumb image-card-missing">
                        <span>File missing</span>
                    </div>
                    <div class="image-card-footer">
                        <span class="image-card-filename">${escHtml(img.filename)}</span>
                        <button class="image-card-delete" data-image-id="${img.id}" title="Delete record">✕</button>
                    </div>
                `;
            }

            fragment.appendChild(card);
        });

        grid.innerHTML = '';
        grid.appendChild(fragment);

        // Bind events
        bindCardEvents(grid, entityType, entityId);
    }

    function bindCardEvents(grid, entityType, entityId) {
        // Thumbnail click → lightbox
        grid.querySelectorAll('.image-card-thumb').forEach(thumb => {
            thumb.addEventListener('click', (e) => {
                if (e.target.closest('.image-card-zoom')) {
                    // Zoom button clicked — same action
                }
                const index = parseInt(thumb.dataset.index);
                openLightbox(index);
            });
        });

        // Description editing (debounced save)
        grid.querySelectorAll('.image-card-desc').forEach(textarea => {
            let timer = null;
            textarea.addEventListener('input', () => {
                clearTimeout(timer);
                const imageId = textarea.dataset.imageId;
                timer = setTimeout(() => {
                    updateDescription(imageId, textarea.value);
                }, 600);
            });
        });

        // Delete buttons
        grid.querySelectorAll('.image-card-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                const imageId = parseInt(btn.dataset.imageId);
                deleteImage(imageId, entityType, entityId);
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // Update Description
    // ═══════════════════════════════════════════════════════════════════

    async function updateDescription(imageId, description) {
        try {
            const res = await fetch(`/api/images/${imageId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description }),
            });
            if (!res.ok) {
                showToast('Failed to save description');
            }
            // Update local cache
            const img = currentImages.find(i => i.id === parseInt(imageId));
            if (img) img.description = description;
        } catch (e) {
            showToast('Save error: ' + e.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Delete
    // ═══════════════════════════════════════════════════════════════════

    async function deleteImage(imageId, entityType, entityId) {
        if (!confirm('Delete this image? This cannot be undone.')) return;

        try {
            const res = await fetch(`/api/images/${imageId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');

            currentImages = currentImages.filter(i => i.id !== imageId);
            renderImageGrid(entityType, entityId);
            updateImageCount();
            showToast('Image deleted');
        } catch (e) {
            showToast('Delete error: ' + e.message);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Lightbox
    // ═══════════════════════════════════════════════════════════════════

    function getOrCreateLightbox() {
        let lb = document.getElementById('image-lightbox');
        if (lb) return lb;

        lb = document.createElement('div');
        lb.id = 'image-lightbox';
        lb.className = 'image-lightbox-overlay';
        lb.innerHTML = `
            <div class="image-lightbox-content">
                <button class="image-lightbox-close" title="Close">&times;</button>
                <button class="image-lightbox-nav image-lightbox-prev" title="Previous">‹</button>
                <img src="" alt="">
                <button class="image-lightbox-nav image-lightbox-next" title="Next">›</button>
                <div class="image-lightbox-caption"></div>
            </div>
        `;
        document.body.appendChild(lb);

        // Close on overlay click
        lb.addEventListener('click', (e) => {
            if (e.target === lb) closeLightbox();
        });

        // Close button
        lb.querySelector('.image-lightbox-close').addEventListener('click', closeLightbox);

        // Nav buttons
        lb.querySelector('.image-lightbox-prev').addEventListener('click', (e) => {
            e.stopPropagation();
            navigateLightbox(-1);
        });
        lb.querySelector('.image-lightbox-next').addEventListener('click', (e) => {
            e.stopPropagation();
            navigateLightbox(1);
        });

        // Keyboard nav
        document.addEventListener('keydown', (e) => {
            if (!lb.classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') navigateLightbox(-1);
            else if (e.key === 'ArrowRight') navigateLightbox(1);
        });

        return lb;
    }

    function openLightbox(index) {
        const existingImages = currentImages.filter(i => i.exists);
        if (index < 0 || index >= existingImages.length) return;

        lightboxIndex = index;
        const lb = getOrCreateLightbox();
        updateLightboxImage(lb, existingImages);
        lb.classList.add('active');
    }

    function closeLightbox() {
        const lb = document.getElementById('image-lightbox');
        if (lb) lb.classList.remove('active');
        lightboxIndex = -1;
    }

    function navigateLightbox(delta) {
        const existingImages = currentImages.filter(i => i.exists);
        if (existingImages.length === 0) return;
        lightboxIndex = (lightboxIndex + delta + existingImages.length) % existingImages.length;
        const lb = document.getElementById('image-lightbox');
        if (lb) updateLightboxImage(lb, existingImages);
    }

    function updateLightboxImage(lb, images) {
        const img = images[lightboxIndex];
        if (!img) return;

        const project = getCookie('scf_project');
        const imgUrl = `/project-files/${project}/${img.relative_path}`;

        lb.querySelector('img').src = imgUrl;
        lb.querySelector('img').alt = img.description || img.filename;

        const caption = lb.querySelector('.image-lightbox-caption');
        const parts = [];
        if (img.description) parts.push(img.description);
        parts.push(img.filename);
        if (images.length > 1) parts.push(`${lightboxIndex + 1} / ${images.length}`);
        caption.textContent = parts.join(' — ');

        // Show/hide nav buttons
        const prevBtn = lb.querySelector('.image-lightbox-prev');
        const nextBtn = lb.querySelector('.image-lightbox-next');
        const showNav = images.length > 1;
        prevBtn.style.display = showNav ? '' : 'none';
        nextBtn.style.display = showNav ? '' : 'none';
    }

    // ═══════════════════════════════════════════════════════════════════
    // Image count badge on Reference tab
    // ═══════════════════════════════════════════════════════════════════

    function updateImageCount() {
        const badge = document.getElementById('tab-image-count');
        if (badge) {
            badge.textContent = currentImages.length > 0 ? currentImages.length : '';
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function escHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Auto-init
    // ═══════════════════════════════════════════════════════════════════

    // Init on page load
    initImagePanel();

    // Re-init after htmx swaps (entity form loaded)
    document.body.addEventListener('htmx:afterSwap', (e) => {
        if (e.detail.target.id === 'editor-panel') {
            initImagePanel();
        }
    });

    // Expose for manual calls if needed
    window.initImagePanel = initImagePanel;

})();
