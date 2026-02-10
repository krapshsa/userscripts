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
    // Mini Framework
    // =========================================================================

    const MiniFramework = (() => {
        // --- 1. Trusted Types & Template Literals ---

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

        // --- 2. State Management ---

        function createStore(initialState) {
            const listeners = new Set();

            const proxy = new Proxy(initialState, {
                set(target, prop, value) {
                    if (target[prop] !== value) {
                        target[prop] = value;
                        listeners.forEach(fn => fn(prop, value));
                    }
                    return true;
                }
            });

            return {
                state: proxy,
                subscribe(fn) {
                    listeners.add(fn);
                    return () => listeners.delete(fn);
                }
            };
        }

        // --- 3. Component System ---

        class Component {
            constructor(props = {}) {
                this.props = props;
                this.el = null;
                this._unsubscribe = null;
            }

            // To be implemented by subclass
            render() {
                return '';
            }

            // Lifecycle hooks
            onMount() { }
            onUnmount() { }
            onUpdate() { }

            mount(container) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = this.render();
                this.el = wrapper.firstElementChild;

                if (this.el) {
                    container.appendChild(this.el);
                    this.onMount();
                } else {
                    console.warn('Component render returned no element');
                }
            }

            unmount() {
                if (this.el && this.el.parentNode) {
                    this.el.parentNode.removeChild(this.el);
                }
                if (this._unsubscribe) {
                    this._unsubscribe();
                }
                this.onUnmount();
            }

            update() {
                if (!this.el) return;

                // Simple re-render strategy: update content or attributes
                // For this simple framework, we expect subclasses to implement specific DOM variable updates in `onUpdate`
                // or we could do a full replace (which kills event listeners, so we avoid that for now).
                this.onUpdate();
            }
        }

        return {
            html,
            css,
            createStore,
            Component
        };
    })();


    // =========================================================================
    // App Implementation - Gemini Bulk Delete
    // =========================================================================

    const { html, css, createStore, Component } = MiniFramework;

    // --- Constants & Styles ---
    const CHECKBOX_CLASS = 'gemini-bulk-del-checkbox';

    // Global Styles
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
        /* Floating Bar Component */
        .gemini-floating-bar {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
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
            transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease;
            opacity: 0;
            pointer-events: none;
        }
        .gemini-floating-bar.visible {
            transform: translateX(-50%) translateY(0);
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

    // --- Floating Bar Component ---

    class FloatingBar extends Component {
        constructor(props) {
            super(props);
            // props.store is required
        }

        render() {
            const count = this.props.store.state.selectedCount;
            const visibleClass = count > 0 ? 'visible' : '';

            return html`
                <div id="gemini-bulk-del-bar" class="gemini-floating-bar ${visibleClass}">
                    <span>${count} selected</span>
                    <button id="gemini-bulk-del-btn">Delete</button>
                </div>
            `;
        }

        onMount() {
            // Subscribe to store changes to trigger updates
            this.props.store.subscribe(() => this.update());

            // Bind delete button
            const btn = this.el.querySelector('#gemini-bulk-del-btn');
            if (btn && this.props.onDelete) {
                btn.addEventListener('click', this.props.onDelete);
            }
        }

        onUpdate() {
            const count = this.props.store.state.selectedCount;
            const countSpan = this.el.querySelector('span');

            // Update text
            if (countSpan) {
                countSpan.textContent = `${count} selected`;
            }

            // Update visibility
            if (count > 0) {
                this.el.classList.add('visible');
            } else {
                this.el.classList.remove('visible');
            }
        }
    }

    // --- Business Logic Controller ---

    class GeminiBulkDelete {
        constructor() {
            this.store = createStore({ selectedCount: 0 });
            this.floatingBar = new FloatingBar({
                store: this.store,
                onDelete: () => this.deleteSelectedItems()
            });
        }

        init() {
            console.log('[Bulk Delete] Initializing...');
            this.floatingBar.mount(document.body);
            this.initObserver();
            this.injectCheckboxes();
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
            this.store.state.selectedCount = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`).length;
        }

        async deleteSelectedItems() {
            console.log('[Bulk Delete] Starting deletion...');

            const checkboxes = document.querySelectorAll(`.${CHECKBOX_CLASS}:checked`);
            if (!checkboxes.length) {
                return;
            }

            for (const checkbox of checkboxes) {
                const menuButton = checkbox
                    .closest('div')
                    .querySelector('button[data-test-id="actions-menu-button"]');

                if (menuButton) {
                    await this.deleteItem(menuButton);
                }
            }

            this.syncState();
            console.log('[Bulk Delete] Finished');
        }

        async deleteItem(menuButton) {
            menuButton.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const deleteOption = document.querySelector('[role="menuitem"][data-test-id="delete-button"]');
            if (!deleteOption) {
                return;
            }

            deleteOption.click();

            await new Promise(resolve => setTimeout(resolve, 100));

            const confirmButton = document.querySelector('button[data-test-id="confirm-button"]');
            if (!confirmButton) {
                return;
            }

            confirmButton.click();
            await new Promise(resolve => setTimeout(resolve, 100));
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
