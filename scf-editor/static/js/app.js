/* ==========================================================================
   SCF Editor — Client JavaScript
   Minimal JS for tree toggling, tab switching, and htmx integration.
   ========================================================================== */

// =============================================================================
// Tree collapse state persistence
// =============================================================================

const TREE_STATE_KEY = 'scf-tree-collapse-state';

function getTreeState() {
    try {
        return JSON.parse(localStorage.getItem(TREE_STATE_KEY)) || {};
    } catch { return {}; }
}

function saveTreeState() {
    const state = {};
    document.querySelectorAll('.tree-group-header').forEach(header => {
        const group = header.closest('.tree-entity-group');
        if (group) {
            const type = group.dataset.entityType;
            if (type) {
                state[type] = header.classList.contains('collapsed');
            }
        }
    });
    localStorage.setItem(TREE_STATE_KEY, JSON.stringify(state));
}

function applyTreeState() {
    const state = getTreeState();
    const hasState = Object.keys(state).length > 0;

    document.querySelectorAll('.tree-entity-group').forEach(group => {
        const type = group.dataset.entityType;
        const header = group.querySelector('.tree-group-header');
        const items = group.querySelector('.tree-items');
        if (!header || !items) return;

        // If we have saved state, use it; otherwise default to collapsed
        const shouldCollapse = hasState ? (state[type] !== false) : true;

        if (shouldCollapse) {
            header.classList.add('collapsed');
            items.classList.add('collapsed');
        } else {
            header.classList.remove('collapsed');
            items.classList.remove('collapsed');
        }
    });
}

// -- Tree toggling -----------------------------------------------------------

function toggleTreeGroup(header) {
    const items = header.nextElementSibling;
    if (!items) return;
    header.classList.toggle('collapsed');
    items.classList.toggle('collapsed');
    saveTreeState();
}

// -- Tab switching -----------------------------------------------------------

function switchTab(btn, tabId) {
    // Deactivate all tabs
    const tabBar = btn.closest('.tab-bar');
    tabBar.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    // Show/hide tab content
    const editor = btn.closest('.entity-editor');
    editor.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    const target = editor.querySelector(`#tab-${tabId}`);
    if (target) target.classList.add('active');
}

// -- Delete entity -----------------------------------------------------------

function deleteEntity(entityType, entityId) {
    if (!confirm(`Delete this ${entityType}? This cannot be undone.`)) return;

    fetch(`/api/${entityType}/${entityId}`, {
        method: 'DELETE',
        headers: { 'HX-Request': 'true' },
    }).then(resp => {
        if (resp.ok) {
            // Check for redirect
            const redirect = resp.headers.get('HX-Redirect');
            if (redirect) {
                window.location.href = redirect;
            } else {
                window.location.href = '/browse';
            }
        }
    });
}

// -- Refresh tree after save -------------------------------------------------

function refreshTree() {
    // Get current selection from URL
    const params = new URLSearchParams(window.location.search);
    const type = params.get('entity_type');
    const id = params.get('entity_id');

    fetch(`/htmx/tree?selected_type=${type || ''}&selected_id=${id || ''}`)
        .then(r => r.text())
        .then(html => {
            const scroll = document.querySelector('.tree-scroll');
            if (scroll) {
                scroll.innerHTML = html;
                applyTreeState();
            }
        });
}

// -- Search dropdown visibility ----------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.querySelector('.search-box input');
    const dropdown = document.getElementById('search-dropdown');

    if (searchInput && dropdown) {
        // Show dropdown when results arrive
        const observer = new MutationObserver(() => {
            if (dropdown.innerHTML.trim()) {
                dropdown.classList.remove('hidden');
            }
        });
        observer.observe(dropdown, { childList: true, subtree: true });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-box')) {
                dropdown.classList.add('hidden');
            }
        });

        // Show dropdown on focus if it has content
        searchInput.addEventListener('focus', () => {
            if (dropdown.innerHTML.trim() && searchInput.value.length >= 2) {
                dropdown.classList.remove('hidden');
            }
        });

        // Clear and hide on escape
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                dropdown.classList.add('hidden');
                dropdown.innerHTML = '';
            }
        });
    }

    // -- Keyboard shortcut: Ctrl/Cmd + K for search --------------------------
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            const si = document.querySelector('.search-box input');
            if (si) { si.focus(); si.select(); }
        }
    });

    // -- Apply saved tree collapse state --
    applyTreeState();

    // -- Init link panels on page load --
    initLinkPanels();

    // -- Init panel resize --
    initPanelResize();
});

// =============================================================================
// Panel Resize (draggable tree panel width)
// =============================================================================

function initPanelResize() {
    const panel = document.querySelector('.panel-tree');
    if (!panel) return;

    // Create resize handle
    const handle = document.createElement('div');
    handle.className = 'panel-resize-handle';
    panel.appendChild(handle);

    // Restore saved width
    const savedWidth = localStorage.getItem('scf-panel-tree-width');
    if (savedWidth) {
        panel.style.width = savedWidth + 'px';
    }

    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');

        const onMouseMove = (e) => {
            const newWidth = Math.max(220, Math.min(800, startWidth + (e.clientX - startX)));
            panel.style.width = newWidth + 'px';
        };

        const onMouseUp = () => {
            handle.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // Save width
            localStorage.setItem('scf-panel-tree-width', panel.getBoundingClientRect().width);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// =============================================================================
// Inline Relationship Link Panels
// =============================================================================

function initLinkPanels() {
    document.querySelectorAll('.link-panel').forEach(panel => {
        const input = panel.querySelector('.link-search-input');
        const dropdown = panel.querySelector('.link-autocomplete-dropdown');
        if (!input || !dropdown) return;

        const entityType = panel.dataset.linkEntityType;
        const junctionType = panel.dataset.junctionType;
        const parentId = panel.dataset.parentId;
        const metaField = panel.dataset.metaField;

        let debounceTimer = null;
        let highlightIndex = -1;
        let currentResults = [];

        // -- Debounced autocomplete search --
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            if (q.length < 1) {
                hideDropdown();
                return;
            }
            debounceTimer = setTimeout(() => {
                fetch(`/api/autocomplete/${entityType}?q=${encodeURIComponent(q)}`)
                    .then(r => r.json())
                    .then(results => {
                        currentResults = results;
                        highlightIndex = -1;
                        renderDropdown(results, q);
                    });
            }, 200);
        });

        // -- Keyboard navigation --
        input.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.link-autocomplete-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightIndex = Math.min(highlightIndex + 1, items.length - 1);
                updateHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightIndex = Math.max(highlightIndex - 1, -1);
                updateHighlight(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (highlightIndex >= 0 && highlightIndex < items.length) {
                    items[highlightIndex].click();
                } else if (input.value.trim()) {
                    // No match selected — create new entity + link
                    createAndLink(input.value.trim());
                }
            } else if (e.key === 'Escape') {
                hideDropdown();
                input.value = '';
            }
        });

        // -- Hide dropdown on outside click --
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.link-search')) {
                hideDropdown();
            }
        });

        function renderDropdown(results, query) {
            if (results.length === 0 && query) {
                dropdown.innerHTML = `
                    <div class="link-autocomplete-item link-autocomplete-create"
                         data-create-name="${escapeHtml(query)}">
                        + Create "${escapeHtml(query)}"
                    </div>`;
                currentResults = [{ id: null, name: query, isCreate: true }];
            } else {
                let html = results.map((r, i) => `
                    <div class="link-autocomplete-item"
                         data-entity-id="${r.id}"
                         data-index="${i}">
                        ${escapeHtml(r.name)}
                    </div>`).join('');

                // Always show "create new" option at bottom if query doesn't exactly match
                const exactMatch = results.some(r => r.name.toLowerCase() === query.toLowerCase());
                if (!exactMatch && query) {
                    html += `
                        <div class="link-autocomplete-item link-autocomplete-create"
                             data-create-name="${escapeHtml(query)}">
                            + Create "${escapeHtml(query)}"
                        </div>`;
                }
                dropdown.innerHTML = html;
            }

            // Bind click handlers
            dropdown.querySelectorAll('.link-autocomplete-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (item.dataset.createName) {
                        createAndLink(item.dataset.createName);
                    } else {
                        linkExisting(parseInt(item.dataset.entityId));
                    }
                });
            });

            dropdown.classList.remove('hidden');
        }

        function updateHighlight(items) {
            items.forEach((item, i) => {
                item.classList.toggle('highlighted', i === highlightIndex);
            });
        }

        function hideDropdown() {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            highlightIndex = -1;
            currentResults = [];
        }

        function linkExisting(childId) {
            const body = { parent_id: parseInt(parentId), child_id: childId };
            fetch(`/api/link/${junctionType}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            .then(r => r.json())
            .then(data => {
                if (data.duplicate) {
                    showToast('Already linked');
                } else {
                    addChipToDOM(data.id, childId, currentResults.find(r => r.id === childId)?.name || '', false);
                    refreshTree();
                }
                input.value = '';
                hideDropdown();
            });
        }

        function createAndLink(name) {
            const body = { parent_id: parseInt(parentId), new_name: name };
            fetch(`/api/link/${junctionType}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            .then(r => r.json())
            .then(data => {
                addChipToDOM(data.id, data.child_id, name, data.is_new);
                input.value = '';
                hideDropdown();
                refreshTree();
            });
        }

        function addChipToDOM(linkId, entityId, name, isNew) {
            const chipsContainer = panel.querySelector('.link-chips');
            const chip = document.createElement('div');
            chip.className = 'link-chip';
            chip.dataset.linkId = linkId;

            const isOrder = panel.querySelector('.link-chip-order') !== null ||
                            junctionType === 'scene-sequence';

            let metaHtml;
            if (isOrder) {
                metaHtml = `<input type="number" class="link-chip-order" value="" placeholder="#" title="Order" min="1" step="1">`;
            } else {
                // Get meta options from existing chip or from the panel config
                const existingSelect = panel.querySelector('.link-chip-meta');
                let options = '<option value="">' + (metaField === 'role_in_scene' ? 'Role' : metaField === 'significance' ? 'Significance' : 'Meta') + '</option>';
                if (existingSelect) {
                    existingSelect.querySelectorAll('option').forEach(opt => {
                        if (opt.value) options += `<option value="${opt.value}">${opt.textContent}</option>`;
                    });
                } else {
                    // Hardcoded fallback based on junction type
                    const optMap = {
                        'scene-character': ['Featured', 'Supporting', 'Background', 'Mentioned', 'Voiceover'],
                        'scene-prop': ['Key', 'Present', 'Background', 'Mentioned'],
                    };
                    (optMap[junctionType] || []).forEach(o => {
                        options += `<option value="${o}">${o}</option>`;
                    });
                }
                metaHtml = `<select class="link-chip-meta" title="Role">${options}</select>`;
            }

            chip.innerHTML = `
                <a href="/browse?entity_type=${entityType}&entity_id=${entityId}"
                   class="link-chip-name">${escapeHtml(name)}</a>
                ${isNew ? '<span class="link-new-indicator">(new)</span>' : ''}
                ${metaHtml}
                <button type="button" class="link-chip-remove" title="Remove">&times;</button>
            `;

            chipsContainer.appendChild(chip);
            bindChipEvents(chip, junctionType, metaField);
        }

        // -- Bind events on server-rendered chips --
        panel.querySelectorAll('.link-chip').forEach(chip => {
            bindChipEvents(chip, junctionType, metaField);
        });
    });
}

function bindChipEvents(chip, junctionType, metaField) {
    const linkId = chip.dataset.linkId;

    // Meta dropdown change
    const metaSelect = chip.querySelector('.link-chip-meta');
    if (metaSelect) {
        metaSelect.addEventListener('change', () => {
            fetch(`/api/link/${junctionType}/${linkId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [metaField]: metaSelect.value }),
            });
        });
    }

    // Order input change
    const orderInput = chip.querySelector('.link-chip-order');
    if (orderInput) {
        let orderDebounce = null;
        orderInput.addEventListener('input', () => {
            clearTimeout(orderDebounce);
            orderDebounce = setTimeout(() => {
                const val = orderInput.value ? parseInt(orderInput.value) : null;
                fetch(`/api/link/${junctionType}/${linkId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ [metaField]: val }),
                });
            }, 500);
        });
    }

    // Remove button
    const removeBtn = chip.querySelector('.link-chip-remove');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            if (!confirm('Remove this link?')) return;
            fetch(`/api/link/${junctionType}/${linkId}`, {
                method: 'DELETE',
            })
            .then(r => r.json())
            .then(() => {
                chip.remove();
                refreshTree();
            });
        });
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// -- HTMX events -------------------------------------------------------------

// After any htmx swap in the editor, re-initialize save indicator fade and link panels
document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail.target.id === 'editor-panel') {
        // Show toast on save
        const ind = document.getElementById('save-indicator');
        if (ind && ind.classList.contains('show')) {
            showToast('Changes saved');
        }
        // Re-init link panels after form swap
        initLinkPanels();
    }
    // Re-apply tree state after any tree swap
    if (e.detail.target.id === 'tree-panel' || e.detail.target.querySelector('.tree-scroll')) {
        applyTreeState();
    }
});

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}
