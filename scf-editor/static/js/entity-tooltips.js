/* ==========================================================================
   SCF Editor — Entity Tree Tooltips
   Shows entity description on hover with a 450ms delay.
   Tooltip element lives on document.body to escape .tree-scroll overflow.
   ========================================================================== */

(function() {
    'use strict';

    let tooltipEl = null;
    let showTimer = null;

    function getTooltip() {
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'tree-tooltip';
            document.body.appendChild(tooltipEl);
        }
        return tooltipEl;
    }

    function show(target) {
        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        const tip = getTooltip();
        tip.textContent = text;

        // Position below the header, aligned to the label text
        const rect = target.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left + 42;

        // Keep within viewport
        tip.style.left = '0';
        tip.style.top = '0';
        tip.classList.add('visible');

        const tipRect = tip.getBoundingClientRect();
        if (left + tipRect.width > window.innerWidth - 12) {
            left = window.innerWidth - tipRect.width - 12;
        }
        if (top + tipRect.height > window.innerHeight - 12) {
            top = rect.top - tipRect.height - 6;
        }

        tip.style.left = Math.max(8, left) + 'px';
        tip.style.top = top + 'px';
    }

    function hide() {
        clearTimeout(showTimer);
        showTimer = null;
        if (tooltipEl) tooltipEl.classList.remove('visible');
    }

    function init() {
        const treeScroll = document.querySelector('.tree-scroll');
        if (!treeScroll) return;

        // Event delegation on .tree-scroll
        treeScroll.addEventListener('mouseenter', function(e) {
            const header = e.target.closest('.tree-group-header[data-tooltip]');
            if (!header) return;
            clearTimeout(showTimer);
            showTimer = setTimeout(function() { show(header); }, 450);
        }, true);

        treeScroll.addEventListener('mouseleave', function(e) {
            const header = e.target.closest('.tree-group-header[data-tooltip]');
            if (!header) return;
            hide();
        }, true);

        // Also hide on scroll and click (tooltip shouldn't linger)
        treeScroll.addEventListener('scroll', hide);
        treeScroll.addEventListener('click', hide);
    }

    // Init on load
    init();

    // Re-init after htmx tree refresh
    document.body.addEventListener('htmx:afterSwap', function(e) {
        if (e.detail.target && e.detail.target.querySelector &&
            e.detail.target.querySelector('.tree-scroll')) {
            init();
        }
    });

})();
