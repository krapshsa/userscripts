// ==UserScript==
// @name         Gemini Bulk Delete
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Bulk delete Gemini conversations
// @author       Antigravity
// @match        https://gemini.google.com/app*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // Utilities
    // =========================================================================
    const policy = window.trustedTypes && window.trustedTypes.createPolicy ?
        window.trustedTypes.createPolicy('geminiBulkDeletePolicy', { createHTML: s => s }) :
        { createHTML: s => s };

    function html(strings, ...values) {
        const raw = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
        return policy.createHTML(raw);
    }

    function css(strings, ...values) {
        const raw = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
        const style = document.createElement('style');
        style.textContent = raw;
        document.head.appendChild(style);
    }

    // =========================================================================
    // Styles
    // =========================================================================
    const CHECKBOX_STYLE_CLASS = 'gemini-bulk-checkbox';
    const CHECKBOX_ITEM_CLASS = 'gemini-bulk-item-checkbox';
    const CHECKBOX_SELECT_ALL_CLASS = 'gemini-bulk-select-all';
    const TOOLBAR_CLASS = 'gemini-bulk-toolbar';

    css`
        :root {
            --gemini-bulk-bg: rgba(30, 30, 30, 0.9);
            --gemini-bulk-border: rgba(255, 255, 255, 0.3);
            --gemini-bulk-text: #e3e3e3;
            --gemini-bulk-accent: #8ab4f8;
            --gemini-bulk-accent-hover: #aecbfa;
            --gemini-bulk-danger: #ea4335;
            --gemini-bulk-danger-hover: #f28b82;
            --gemini-bulk-selected-bg: rgba(255, 255, 255, 0.1);
            --gemini-bulk-checkmark: #1e1e1e;
        }
        
        body.light-theme {
            --gemini-bulk-bg: rgba(255, 255, 255, 0.9);
            --gemini-bulk-border: rgba(0, 0, 0, 0.4);
            --gemini-bulk-text: #1f1f1f;
            --gemini-bulk-accent: #0b57d0;
            --gemini-bulk-accent-hover: #0842a0;
            --gemini-bulk-danger: #d93025;
            --gemini-bulk-danger-hover: #b3261e;
            --gemini-bulk-selected-bg: rgba(0, 0, 0, 0.08);
            --gemini-bulk-checkmark: #ffffff;
        }

        .${CHECKBOX_STYLE_CLASS} {
            appearance: none;
            -webkit-appearance: none;
            width: 20px;
            height: 20px;
            border: 2px solid var(--gemini-bulk-border);
            border-radius: 6px;
            cursor: pointer;
            position: relative;
            transition: all 0.2s ease;
            background-color: transparent;
            flex-shrink: 0;
            z-index: 1000;
        }
        .${CHECKBOX_STYLE_CLASS}:checked {
            background-color: var(--gemini-bulk-accent);
            border-color: var(--gemini-bulk-accent);
        }
        .${CHECKBOX_STYLE_CLASS}:checked::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 5px;
            height: 10px;
            border: solid var(--gemini-bulk-checkmark);
            border-width: 0 2px 2px 0;
            transform: translate(-50%, -50%) rotate(45deg);
            margin-top: -2px;
        }
        .${CHECKBOX_STYLE_CLASS}:hover {
            border-color: var(--gemini-bulk-accent-hover);
        }
        .gemini-bulk-selected {
            background-color: var(--gemini-bulk-selected-bg);
        }

        /* Inline Toolbar */
        .${TOOLBAR_CLASS} {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-left: 16px;
            padding-left: 16px;
            opacity: 0;
            transition: opacity 0.3s ease, visibility 0.3s;
            visibility: hidden;
        }
        .${TOOLBAR_CLASS}.visible {
            opacity: 1;
            visibility: visible;
        }
        .${TOOLBAR_CLASS} span {
            color: var(--gemini-bulk-text);
        }
        .${TOOLBAR_CLASS} button {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--gemini-bulk-danger);
            transition: background 0.2s ease;
        }
        .${TOOLBAR_CLASS} button:hover {
            background: rgba(234, 67, 53, 0.1);
        }
        .${TOOLBAR_CLASS} button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .${TOOLBAR_CLASS} svg {
            width: 20px;
            height: 20px;
            fill: currentColor;
        }
        
        /* Select All Container Alignment */
        .gemini-bulk-title-container {
            display: flex !important;
            align-items: center !important;
        }
        
        /* Select All Checkbox Specifics */
        .gemini-bulk-select-all {
            margin: 0 0 0 10px !important; /* Margin-left for separation */
            width: 18px !important;
            height: 18px !important;
        }
    `;

    // =========================================================================
    // Core Logic
    // =========================================================================
    class GeminiBulkDelete {
        constructor() {
            this.state = this.createStore({
                selectedCount: 0
            }, (state) => {
                this.updateToolbar(state);
            });

            this.toolbarEl = null;
            this.countEl = null;
            this.deleteBtn = null;
        }

        createStore(initialState, onChange) {
            return new Proxy(initialState, {
                set: (target, property, value) => {
                    target[property] = value;
                    onChange(target);
                    return true;
                }
            });
        }

        init() {
            console.log('[Bulk Delete] Initializing...');
            this.initObserver();
            this.injectCheckboxes();
            this.injectSelectAll();
        }

        updateToolbar(state) {
            if (!this.toolbarEl) {
                return;
            }

            if (state.selectedCount > 0) {
                this.toolbarEl.classList.add('visible');
                this.countEl.textContent = `${state.selectedCount} selected`;
                this.deleteBtn.disabled = false;
            } else {
                this.toolbarEl.classList.remove('visible');
                this.deleteBtn.disabled = true;
            }
        }

        initObserver() {
            const observer = new MutationObserver((mutations) => {
                let shouldUpdate = false;
                for (const m of mutations) {
                    if (m.addedNodes.length > 0) {
                        shouldUpdate = true;
                        break;
                    }
                }
                if (shouldUpdate) {
                    this.injectCheckboxes();
                    this.injectSelectAll();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        injectCheckboxes() {
            const links = document.querySelectorAll('a[href^="/app/"][data-test-id="conversation"]');
            links.forEach(link => {
                if (link.dataset.bulkDeleteProcessed) {
                    return;
                }

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = `${CHECKBOX_STYLE_CLASS} ${CHECKBOX_ITEM_CLASS}`;

                // Bind events
                checkbox.addEventListener('click', (e) => e.stopPropagation());
                checkbox.addEventListener('change', (e) => this.handleCheckboxChange(e));

                link.insertBefore(checkbox, link.firstChild);
                link.dataset.bulkDeleteProcessed = 'true';
                link.style.display = 'flex';
                link.style.alignItems = 'center';
            });
        }

        injectSelectAll() {
            const titleContainer = document.querySelector('.chat-history .title-container');
            if (!titleContainer || titleContainer.querySelector(`.${CHECKBOX_SELECT_ALL_CLASS}`)) {
                return;
            }

            // Add class for styling logic
            titleContainer.classList.add('gemini-bulk-title-container');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = `${CHECKBOX_STYLE_CLASS} ${CHECKBOX_SELECT_ALL_CLASS}`;
            checkbox.title = 'Select All';

            checkbox.addEventListener('click', (e) => e.stopPropagation());
            checkbox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                const checkboxes = document.querySelectorAll(`.${CHECKBOX_ITEM_CLASS}`);
                let count = 0;

                checkboxes.forEach(cb => {
                    cb.checked = checked;
                    const link = cb.closest('a');
                    if (checked) {
                        link.classList.add('gemini-bulk-selected');
                        count++;
                    } else {
                        link.classList.remove('gemini-bulk-selected');
                    }
                });
                this.state.selectedCount = count;
            });

            // Append Select All Checkbox
            titleContainer.appendChild(checkbox);

            // Create Toolbar
            const toolbar = document.createElement('div');
            toolbar.classList.add(TOOLBAR_CLASS, 'gds-label-l');
            toolbar.innerHTML = html`
                <span>0 selected</span>
                <button title="Delete Selected">
                    <svg viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            `;

            this.toolbarEl = toolbar;
            this.countEl = toolbar.querySelector('span');
            this.deleteBtn = toolbar.querySelector('button');

            this.deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSelectedItems();
            });

            titleContainer.appendChild(toolbar);
        }

        handleCheckboxChange(e) {
            const link = e.target.closest('a');
            if (e.target.checked) {
                link.classList.add('gemini-bulk-selected');
                this.state.selectedCount++;
            } else {
                link.classList.remove('gemini-bulk-selected');
                this.state.selectedCount--;
            }

            // Uncheck 'Select All' if a single item is unchecked
            if (!e.target.checked) {
                const selectAllCtx = document.querySelector(`.${CHECKBOX_SELECT_ALL_CLASS}`);
                if (selectAllCtx && selectAllCtx.checked) {
                    selectAllCtx.checked = false;
                }
            }
        }

        async deleteSelectedItems() {
            if (this.state.selectedCount === 0) {
                return;
            }

            console.log('[Bulk Delete] Starting deletion...');
            const checkboxes = document.querySelectorAll(`.${CHECKBOX_ITEM_CLASS}:checked`);

            // Disable delete button during processing
            this.deleteBtn.disabled = true;

            // Process each selected item
            for (const checkbox of checkboxes) {
                const row = checkbox.closest('a');
                if (row) {
                    await this.deleteConversation(row);
                }
            }

            // Sync state after all operations
            this.state.selectedCount = 0;
            this.deleteBtn.disabled = false;

            // Uncheck Select All if present
            const selectAllCtx = document.querySelector(`.${CHECKBOX_SELECT_ALL_CLASS}`);
            if (selectAllCtx) {
                selectAllCtx.checked = false;
            }

            console.log('[Bulk Delete] Finished');
        }

        isVisible(el) {
            if (!el) {
                return false;
            }
            if (el.checkVisibility) {
                return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
            }
            const style = window.getComputedStyle(el);
            return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) &&
                style.display !== 'none' &&
                style.visibility !== 'hidden';
        }

        async waitFor(predicate, timeout = 5000, context = 'condition') {
            const check = () => {
                try {
                    const result = predicate();
                    return result;
                } catch (e) {
                    return false;
                }
            };

            const initial = check();
            if (initial) {
                return initial;
            }

            return new Promise((resolve, reject) => {
                const observer = new MutationObserver(() => {
                    const result = check();
                    if (result) {
                        observer.disconnect();
                        resolve(result);
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    characterData: true
                });

                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout waiting for: ${context}`));
                }, timeout);
            });
        }

        async deleteConversation(row) {
            try {
                const menuButtonSelector = 'button[data-test-id="actions-menu-button"]';

                // Try finding button in row (<a>) or parent container
                let menuButton = row.querySelector(menuButtonSelector);

                // If not found in <a>, check parent. 
                // SAFETY: Ensure parent only contains THIS row to avoid selecting a sibling's button.
                if (!menuButton && row.parentElement) {
                    const parentData = row.parentElement.querySelectorAll('a[data-test-id="conversation"]');
                    if (parentData.length === 1) {
                        menuButton = row.parentElement.querySelector(menuButtonSelector);
                    }
                }

                if (!menuButton) {
                    throw new Error('Menu button not found in row or immediate parent');
                }

                // Scroll just in case
                menuButton.scrollIntoView({ block: 'nearest' });

                // Try to force visibility via events
                [row, row.parentElement].forEach(el => {
                    if (el) {
                        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                        el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
                    }
                });

                // Force CSS visibility
                menuButton.style.visibility = 'visible';
                menuButton.style.opacity = '1';
                menuButton.style.display = 'block';

                // Click menu to open
                try {
                    await this.waitFor(
                        () => this.isVisible(menuButton),
                        1000,
                        'Menu button visibility'
                    );
                } catch (e) {
                    // Ignore visibility timeout if we can click it anyway
                    console.warn('Button not visible, trying to click anyway');
                }

                menuButton.click();

                // 2. Wait for the menu to appear (global, usually appended to body or near end)
                // We identify it by role="menu". To be safe, look for the 'Delete' option immediately.
                const deleteOptionSelector = '[role="menuitem"][data-test-id="delete-button"]';
                const deleteOption = await this.waitFor(
                    () => {
                        const el = document.querySelector(deleteOptionSelector);
                        return (el && this.isVisible(el)) ? el : null;
                    },
                    2000,
                    'Delete menu option'
                );

                // 3. Click Delete
                deleteOption.click();

                // 4. Wait for confirmation dialog
                const confirmButtonSelector = 'button[data-test-id="confirm-button"]';
                const confirmButton = await this.waitFor(
                    () => {
                        const el = document.querySelector(confirmButtonSelector);
                        return (el && this.isVisible(el)) ? el : null;
                    },
                    2000,
                    'Confirm deletion button'
                );

                // 5. Click Confirm
                confirmButton.click();

                // 6. KEY VERIFICATION: Wait for the row to be removed from DOM
                // This guarantees the action is effectively complete before moving on.
                await this.waitFor(
                    () => !row.isConnected,
                    10000,
                    'Row detachment'
                );

                // Small breath to let UI settle if needed, though detachment is a strong signal
                // await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                console.error('Delete failed for conversation:', err);
                // Optionally visually flag the failure
                row.style.outline = '2px solid red';
            }
        }
    }

    // --- Main Entry ---
    const app = new GeminiBulkDelete();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        app.init();
    } else {
        window.addEventListener('load', () => app.init());
    }
})();
