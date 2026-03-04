/* ==========================================================================
   SCF Editor — Client JavaScript
   Minimal JS for tree toggling, tab switching, and htmx integration.
   ========================================================================== */

// -- Tree toggling -----------------------------------------------------------

function toggleTreeGroup(header) {
    const items = header.nextElementSibling;
    if (!items) return;
    header.classList.toggle('collapsed');
    items.classList.toggle('collapsed');
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
            if (scroll) scroll.innerHTML = html;
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
});

// -- HTMX events -------------------------------------------------------------

// After any htmx swap in the editor, re-initialize save indicator fade
document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail.target.id === 'editor-panel') {
        // Show toast on save
        const ind = document.getElementById('save-indicator');
        if (ind && ind.classList.contains('show')) {
            showToast('Changes saved');
        }
    }
});

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}
