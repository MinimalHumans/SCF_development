/**
 * SCF Screenplay Versions — Publish / Restore / History
 * ======================================================
 * Manages the version drawer UI and API calls.
 * Loaded as a regular script (not module) from screenplay.html.
 */

(function() {
    'use strict';

    const overlay = document.getElementById('version-drawer-overlay');
    const drawer = document.getElementById('version-drawer');
    const publishInput = document.getElementById('version-publish-input');
    const publishBtn = document.getElementById('version-publish-btn');
    const versionList = document.getElementById('version-list');
    const openBtn = document.getElementById('btn-versions');

    if (!drawer || !overlay) return;

    // ── Open / Close ──

    function openDrawer() {
        overlay.classList.add('active');
        drawer.classList.add('open');
        fetchVersions();
        publishInput.value = '';
        publishInput.focus();
    }

    function closeDrawer() {
        overlay.classList.remove('active');
        drawer.classList.remove('open');
    }

    openBtn?.addEventListener('click', openDrawer);
    overlay.addEventListener('click', closeDrawer);
    document.getElementById('version-drawer-close')?.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) {
            closeDrawer();
            e.stopPropagation();
        }
    });

    // ── Publish ──

    publishBtn?.addEventListener('click', doPublish);
    publishInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doPublish();
    });

    async function doPublish() {
        const desc = publishInput.value.trim();
        if (!desc) {
            publishInput.focus();
            publishInput.style.borderColor = 'var(--warning)';
            setTimeout(() => { publishInput.style.borderColor = ''; }, 1500);
            return;
        }

        publishBtn.disabled = true;
        publishBtn.textContent = 'Publishing…';

        try {
            const res = await fetch('/api/screenplay-v2/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: desc }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Publish failed');
            }

            const data = await res.json();
            showToast(`Published v${data.version_number}: ${desc}`);
            publishInput.value = '';
            fetchVersions();

        } catch (e) {
            showToast('Publish error: ' + e.message);
        } finally {
            publishBtn.disabled = false;
            publishBtn.textContent = 'Publish';
        }
    }

    // ── Fetch & Render Versions ──

    async function fetchVersions() {
        try {
            const res = await fetch('/api/screenplay-v2/versions');
            if (!res.ok) throw new Error('Failed to load versions');
            const versions = await res.json();
            renderVersions(versions);
        } catch (e) {
            versionList.innerHTML = '<div class="version-empty">Failed to load versions</div>';
        }
    }

    function renderVersions(versions) {
        if (!versions.length) {
            versionList.innerHTML = '<div class="version-empty">No published versions yet.<br>Publish your first draft above.</div>';
            return;
        }

        versionList.innerHTML = versions.map(v => {
            const date = v.published_at ? formatDate(v.published_at) : '';
            return `
                <div class="version-item" data-version-id="${v.id}">
                    <div class="version-item-header">
                        <span class="version-item-number">v${v.version_number}</span>
                        <span class="version-item-desc" title="${esc(v.description)}">${esc(v.description)}</span>
                        <span class="version-item-date">${date}</span>
                    </div>
                    <div class="version-item-stats">
                        <span class="version-item-stat">🎬 ${v.scene_count} scenes</span>
                        <span class="version-item-stat">👤 ${v.character_count} chars</span>
                        <span class="version-item-stat">📍 ${v.location_count} locs</span>
                        <span class="version-item-stat">${(v.word_count || 0).toLocaleString()} words</span>
                    </div>
                    <div class="version-item-actions">
                        <button class="btn btn-sm version-restore-btn"
                                onclick="window._restoreVersion(${v.id}, ${v.version_number})">
                            Restore
                        </button>
                        <button class="btn btn-sm version-delete-btn"
                                onclick="window._deleteVersion(${v.id}, ${v.version_number})">
                            Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── Restore ──

    window._restoreVersion = async function(versionId, versionNumber) {
        if (!confirm(
            `Restore v${versionNumber}?\n\n` +
            `This will replace the current live screenplay with the content from v${versionNumber}.\n\n` +
            `Your entities (characters, locations, scenes) will NOT be deleted — only their screenplay links will update.\n\n` +
            `Consider publishing the current version first if you haven't already.`
        )) return;

        try {
            const res = await fetch(`/api/screenplay-v2/restore/${versionId}`, {
                method: 'POST',
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Restore failed');
            }

            const data = await res.json();
            showToast(`Restored v${data.version_number} — ${data.lines_restored} lines, ${data.junctions_rebuilt} junctions`);

            closeDrawer();

            // Reload the editor to pick up restored content
            setTimeout(() => window.location.reload(), 800);

        } catch (e) {
            showToast('Restore error: ' + e.message);
        }
    };

    // ── Delete ──

    window._deleteVersion = async function(versionId, versionNumber) {
        if (!confirm(`Delete v${versionNumber}? This cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/screenplay-v2/versions/${versionId}`, {
                method: 'DELETE',
            });

            if (!res.ok) throw new Error('Delete failed');

            showToast(`Deleted v${versionNumber}`);
            fetchVersions();

        } catch (e) {
            showToast('Delete error: ' + e.message);
        }
    };

    // ── Helpers ──

    function formatDate(isoStr) {
        try {
            const d = new Date(isoStr);
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            return `${d.getFullYear()}-${month}-${day} ${hours}:${mins}`;
        } catch { return isoStr; }
    }

    function esc(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

})();
