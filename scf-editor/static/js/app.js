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
    const tabBar = btn.closest('.tab-bar');
    tabBar.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

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
            const redirect = resp.headers.get('HX-Redirect');
            window.location.href = redirect || '/browse';
        }
    });
}

// -- Refresh tree after save -------------------------------------------------

function refreshTree() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('entity_type');
    const id = params.get('entity_id');

    const scroll = document.querySelector('.tree-scroll');
    const savedScroll = scroll ? scroll.scrollTop : 0;

    fetch(`/htmx/tree?selected_type=${type || ''}&selected_id=${id || ''}`)
        .then(r => r.text())
        .then(html => {
            if (scroll) {
                scroll.innerHTML = html;
                applyTreeState();
                initTreeSortToggles();
                scroll.scrollTop = savedScroll;
            }
        });
}

// =============================================================================
// Tree Scroll Position Preservation
// =============================================================================

const TREE_SCROLL_KEY = 'scf-tree-scroll-top';

function initTreeScrollPreservation() {
    const scroll = document.querySelector('.tree-scroll');
    if (!scroll) return;

    // Restore saved scroll position from before page navigation
    const saved = sessionStorage.getItem(TREE_SCROLL_KEY);
    if (saved !== null) {
        // Use requestAnimationFrame to ensure DOM is laid out
        requestAnimationFrame(() => {
            scroll.scrollTop = parseInt(saved, 10);
        });
        sessionStorage.removeItem(TREE_SCROLL_KEY);
    }

    // Save scroll position when clicking any tree item link (before navigation)
    scroll.addEventListener('click', (e) => {
        const link = e.target.closest('a.tree-item');
        if (link) {
            sessionStorage.setItem(TREE_SCROLL_KEY, scroll.scrollTop);
        }
    });
}

// =============================================================================
// Tree Sort Toggles (alphabetical vs creation/screenplay order)
// =============================================================================

const TREE_SORT_KEY = 'scf-tree-sort-state';

function getTreeSortState() {
    try { return JSON.parse(localStorage.getItem(TREE_SORT_KEY)) || {}; } catch { return {}; }
}
function saveTreeSortState(s) { localStorage.setItem(TREE_SORT_KEY, JSON.stringify(s)); }

function sortTreeItems(container, mode) {
    const items = Array.from(container.querySelectorAll('a.tree-item'));
    if (items.length < 2) return;

    if (mode === 'alpha') {
        items.sort((a, b) => {
            const nameA = a.textContent.trim().toLowerCase();
            const nameB = b.textContent.trim().toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else {
        // Sort by entity ID (creation order — matches screenplay order for imports)
        items.sort((a, b) => {
            return parseInt(a.dataset.entityId || 0) - parseInt(b.dataset.entityId || 0);
        });
    }

    // Re-append in sorted order (moves existing DOM nodes)
    for (const item of items) {
        container.appendChild(item);
    }
}

function initTreeSortToggles() {
    // Inject styles once
    if (!document.getElementById('tree-sort-styles')) {
        const style = document.createElement('style');
        style.id = 'tree-sort-styles';
        style.textContent = `
            .tree-sort-toggle {
                font-family: var(--font-mono);
                font-size: 9px;
                font-weight: 600;
                color: var(--text-muted);
                background: var(--bg-base);
                border: 1px solid var(--border-subtle);
                border-radius: 3px;
                padding: 1px 5px;
                margin-left: 4px;
                cursor: pointer;
                user-select: none;
                letter-spacing: 0.03em;
                transition: all 0.15s;
            }
            .tree-sort-toggle:hover {
                color: var(--text-accent);
                border-color: var(--accent);
                background: var(--accent-subtle);
            }
        `;
        document.head.appendChild(style);
    }

    document.querySelectorAll('.tree-entity-group').forEach(group => {
        const header = group.querySelector('.tree-group-header');
        const itemsContainer = group.querySelector('.tree-items');
        if (!header || !itemsContainer) return;

        // Don't double-init
        if (header.querySelector('.tree-sort-toggle')) return;

        const type = group.dataset.entityType;
        const state = getTreeSortState();
        const mode = state[type] || 'alpha';

        const btn = document.createElement('span');
        btn.className = 'tree-sort-toggle';
        btn.title = 'Toggle sort: alphabetical / screenplay order';
        btn.textContent = mode === 'alpha' ? 'A-Z' : '1st';

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const st = getTreeSortState();
            st[type] = st[type] === 'alpha' ? 'id' : 'alpha';
            saveTreeSortState(st);
            btn.textContent = st[type] === 'alpha' ? 'A-Z' : '1st';
            sortTreeItems(itemsContainer, st[type]);
        });

        // Insert before the add button form
        const addForm = header.querySelector('form');
        if (addForm) {
            header.insertBefore(btn, addForm);
        } else {
            header.appendChild(btn);
        }

        // Apply initial sort
        sortTreeItems(itemsContainer, mode);
    });
}

// =============================================================================
// Panel Resize (draggable tree panel width)
// =============================================================================

const PANEL_WIDTH_KEY = 'scf-panel-tree-width';

function initPanelResize() {
    const panel = document.querySelector('.panel-tree');
    if (!panel) return;

    // Don't double-init
    if (panel.querySelector('.panel-resize-handle')) return;

    // Create resize handle
    const handle = document.createElement('div');
    handle.className = 'panel-resize-handle';
    panel.appendChild(handle);

    // Restore saved width
    const savedWidth = localStorage.getItem(PANEL_WIDTH_KEY);
    if (savedWidth) {
        panel.style.width = savedWidth + 'px';
    }

    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (e) => {
            const newWidth = Math.max(220, Math.min(800, startWidth + (e.clientX - startX)));
            panel.style.width = newWidth + 'px';
        };

        const onMouseUp = () => {
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            localStorage.setItem(PANEL_WIDTH_KEY, Math.round(panel.getBoundingClientRect().width));
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// =============================================================================
// Search dropdown
// =============================================================================

function initSearch() {
    const searchInput = document.querySelector('.search-box input');
    const dropdown = document.getElementById('search-dropdown');
    if (!searchInput || !dropdown) return;

    const observer = new MutationObserver(() => {
        if (dropdown.innerHTML.trim()) {
            dropdown.classList.remove('hidden');
        }
    });
    observer.observe(dropdown, { childList: true, subtree: true });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            dropdown.classList.add('hidden');
        }
    });

    searchInput.addEventListener('focus', () => {
        if (dropdown.innerHTML.trim() && searchInput.value.length >= 2) {
            dropdown.classList.remove('hidden');
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
        }
    });
}

// =============================================================================
// Keyboard shortcuts
// =============================================================================

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            const si = document.querySelector('.search-box input');
            if (si) { si.focus(); si.select(); }
        }
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
                    createAndLink(input.value.trim());
                }
            } else if (e.key === 'Escape') {
                hideDropdown();
                input.value = '';
            }
        });

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
                const existingSelect = panel.querySelector('.link-chip-meta');
                let options = '<option value="">' + (metaField === 'role_in_scene' ? 'Role' : metaField === 'significance' ? 'Significance' : 'Meta') + '</option>';
                if (existingSelect) {
                    existingSelect.querySelectorAll('option').forEach(opt => {
                        if (opt.value) options += `<option value="${opt.value}">${opt.textContent}</option>`;
                    });
                } else {
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

        panel.querySelectorAll('.link-chip').forEach(chip => {
            bindChipEvents(chip, junctionType, metaField);
        });
    });
}

function bindChipEvents(chip, junctionType, metaField) {
    const linkId = chip.dataset.linkId;

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

document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail.target.id === 'editor-panel') {
        const ind = document.getElementById('save-indicator');
        if (ind && ind.classList.contains('show')) {
            showToast('Changes saved');
        }
        initLinkPanels();
    }
    // Re-apply tree state after any tree refresh
    applyTreeState();
    initTreeSortToggles();
});

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// =============================================================================
// INIT — called immediately (script is at bottom of <body>, DOM is ready)
// =============================================================================

applyTreeState();
initTreeSortToggles();
initPanelResize();
initSearch();
initKeyboardShortcuts();
initLinkPanels();
initTreeScrollPreservation();
