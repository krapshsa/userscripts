// ==UserScript==
// @name         Gemini Bulk Delete
// @namespace    http://tampermonkey.net/
// @version      0.3
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
    const CHECKBOX_CLASS = 'gemini-bulk-del-checkbox';

    css`
        :root {
            --gemini-bulk-bg: rgba(30, 30, 30, 0.9);
            --gemini-bulk-border: rgba(255, 255, 255, 0.1);
            --gemini-bulk-text: #e3e3e3;
            --gemini-bulk-accent: #8ab4f8;
            --gemini-bulk-accent-hover: #aecbfa;
            --gemini-bulk-danger: #ea4335;
            --gemini-bulk-danger-hover: #f28b82;
        }
        .${CHECKBOX_CLASS} {
            appearance: none;
            -webkit-appearance: none;
            width: 20px;
            height: 20px;
            border: 2px solid var(--gemini-bulk-border);
            border-radius: 6px;
            margin-right: 12px;
            cursor: pointer;
            position: relative;
            transition: all 0.2s ease;
            background-color: transparent;
            flex-shrink: 0;
            z-index: 1000;
        }
        .${CHECKBOX_CLASS}:checked {
            background-color: var(--gemini-bulk-accent);
            border-color: var(--gemini-bulk-accent);
        }
        .${CHECKBOX_CLASS}:checked::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 5px;
            height: 10px;
            border: solid #1e1e1e;
            border-width: 0 2px 2px 0;
            transform: translate(-50%, -50%) rotate(45deg);
            margin-top: -2px;
        }
        .${CHECKBOX_CLASS}:hover {
            border-color: var(--gemini-bulk-accent-hover);
        }
        .gemini-bulk-selected {
            background-color: var(--gemini-bulk-border);
        }
        /* Floating Bar */
        .gemini-floating-bar {
            position: absolute !important;
            bottom: 20px; /* Start slightly lower (safe zone) */
            left: 50%;
            transform: translateX(-50%); /* Center horizontally only - No vertical transform! */
            background: var(--gemini-bulk-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: var(--gemini-bulk-text);
            padding: 12px 24px;
            border-radius: 16px;
            display: flex;
            align-items: center;
            gap: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            border: 1px solid var(--gemini-bulk-border);
            z-index: 9999;
            font-family: 'Google Sans', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            transition: bottom 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease; /* Animate BOTTOM property */
            opacity: 0;
            pointer-events: none;
            width: max-content;
            margin: 0 !important;
        }
        .gemini-floating-bar.visible {
            bottom: 30px; /* Slide UP to final position */
            opacity: 1;
            pointer-events: auto;
        }
        .gemini-floating-bar button {
            background: var(--gemini-bulk-danger);
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            letter-spacing: 0.5px;
            transition: background-color 0.2s, transform 0.1s;
            box-shadow: 0 2px 8px rgba(234, 67, 53, 0.3);
        }
        .gemini-floating-bar button:hover {
            background: var(--gemini-bulk-danger-hover);
            box-shadow: 0 4px 12px rgba(234, 67, 53, 0.4);
        }
        .gemini-floating-bar button:active {
            transform: scale(0.96);
        }
    `;

    // =========================================================================
    // Core Logic
    // =========================================================================
    class GeminiBulkDelete {
        constructor() {
            this.selectedCount = 0;
            this.floatingBarEl = null;
            this.countEl = null;
            this.deleteBtn = null;
        }

        init() {
            console.log('[Bulk Delete] Initializing...');
            this.createFloatingBar();
            this.initObserver();
            this.injectCheckboxes();
        }

        createFloatingBar() {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html`
                <div id="gemini-bulk-del-bar" class="gemini-floating-bar">
                    <span>0 selected</span>
                    <button id="gemini-bulk-del-btn">Delete</button>
                </div>
            `;
            this.floatingBarEl = wrapper.firstElementChild;
            this.countEl = this.floatingBarEl.querySelector('span');
            this.deleteBtn = this.floatingBarEl.querySelector('button');

            this.deleteBtn.addEventListener('click', () => this.deleteSelectedItems());

            const appendToSidebar = async () => {
                try {
                    const sidebar = await this.waitForSelector('bard-sidenav', 10000);
                    sidebar.appendChild(this.floatingBarEl);
                    console.log('[Bulk Delete] Floating bar attached to sidebar');
                } catch (e) {
                    console.warn('[Bulk Delete] Sidebar not found, attaching to body as fallback');
                    document.body.appendChild(this.floatingBarEl);
                    this.floatingBarEl.style.position = 'fixed';
                    this.floatingBarEl.style.bottom = '30px';
                }
            };
            appendToSidebar();
        }

        updateFloatingBar() {
            if (this.selectedCount > 0) {
                this.floatingBarEl.classList.add('visible');
                this.countEl.textContent = `${this.selectedCount} selected`;
            } else {
                this.floatingBarEl.classList.remove('visible');
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
                if (shouldUpdate) this.injectCheckboxes();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        injectCheckboxes() {
            const links = document.querySelectorAll('a[href^="/app/"][data-test-id="conversation"]');
            links.forEach(link => {
                if (link.dataset.bulkDeleteProcessed) return;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = CHECKBOX_CLASS;

                // Bind events
                checkbox.addEventListener('click', (e) => e.stopPropagation());
                checkbox.addEventListener('change', (e) => this.handleCheckboxChange(e));

                link.insertBefore(checkbox, link.firstChild);
                link.dataset.bulkDeleteProcessed = 'true';
                link.style.display = 'flex';
                link.style.alignItems = 'center';
            });
        }

        handleCheckboxChange(e) {
            const link = e.target.closest('a');
            if (e.target.checked) {
                link.classList.add('gemini-bulk-selected');
            } else {
                link.classList.remove('gemini-bulk-selected');
            }
            this.syncState();
        }

        syncState() {
            this.selectedCount = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`).length;
            this.updateFloatingBar();
        }

        async deleteSelectedItems() {
            if (this.selectedCount === 0) return;

            console.log('[Bulk Delete] Starting deletion...');
            const checkboxes = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`);

            // Optional: Visually indicate processing could be added here
            this.deleteBtn.textContent = 'Deleting...';
            this.deleteBtn.disabled = true;

            for (const checkbox of checkboxes) {
                const menuButton = checkbox
                    .closest('div')
                    .querySelector('button[data-test-id="actions-menu-button"]');

                if (menuButton) {
                    await this.deleteItem(menuButton);
                }
            }

            this.syncState();
            this.deleteBtn.textContent = 'Delete';
            this.deleteBtn.disabled = false;
            console.log('[Bulk Delete] Finished');
        }

        async waitForSelector(selector, timeout = 5000) {
            if (document.querySelector(selector)) return document.querySelector(selector);
            return new Promise((resolve, reject) => {
                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout waiting for selector: ${selector}`));
                }, timeout);
            });
        }

        async waitForDisappearance(selector, timeout = 5000) {
            if (!document.querySelector(selector)) return;
            return new Promise((resolve, reject) => {
                const observer = new MutationObserver(() => {
                    if (!document.querySelector(selector)) {
                        observer.disconnect();
                        resolve();
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`Timeout waiting for disappearance: ${selector}`));
                }, timeout);
            });
        }

        async deleteItem(menuButton) {
            try {
                menuButton.click();

                const deleteSelector = '[role="menuitem"][data-test-id="delete-button"]';
                const deleteOption = await this.waitForSelector(deleteSelector);
                deleteOption.click();

                const confirmSelector = 'button[data-test-id="confirm-button"]';
                const confirmButton = await this.waitForSelector(confirmSelector);
                confirmButton.click();

                await this.waitForDisappearance(confirmSelector);
            } catch (err) {
                console.error('Delete failed for item', err);
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
