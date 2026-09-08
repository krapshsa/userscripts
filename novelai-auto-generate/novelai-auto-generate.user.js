// ==UserScript==
// @name         NovelAI Auto Generate
// @namespace    http://tampermonkey.net/
// @version      2026-09-08
// @description  Toggle automatic image generation
// @author       You
// @match        https://novelai.net/image
// @icon         https://www.google.com/s2/favicons?sz=64&domain=novelai.net
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    GM_addStyle(`
        .image-gen-footer.auto-gen-layout {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto;
            column-gap: 4px;
        }

        /* 其他元素維持各占一整列 */
        .image-gen-footer.auto-gen-layout > * {
            grid-column: 1 / -1;
        }

        .image-gen-footer.auto-gen-layout > button.image-gen-generate-button {
            grid-column: 1;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }

        .image-gen-footer.auto-gen-layout > button.auto-gen {
            grid-column: 2;
            align-self: stretch;
            padding: 0 12px;
            cursor: pointer;
            background-color: rgb(245, 243, 194);
            color: rgb(19, 21, 44);
            border-radius: 4px;
            font-size: 16px;
            font-weight: 700;
        }
    `);

    let running = false;
    let timer = null;
    let pendingButton = null;
    let stateObserver = null;

    function getGenerateButton() {
        return document.querySelector('button.image-gen-generate-button');
    }

    function isEnabled(button) {
        return button?.isConnected &&
            !button.matches(':disabled') &&
            button.getAttribute('aria-disabled') !== 'true';
    }

    function cancelTimer() {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }

        pendingButton = null;
    }

    function updateToggleText() {
        document.querySelectorAll('button.auto-gen').forEach(button => {
            const text = running ? 'stop' : 'start';

            if (button.textContent !== text) {
                button.textContent = text;
            }
        });
    }

    function checkState() {
        if (!running) return;

        const button = getGenerateButton();

        // 停用、移除或替換按鈕時，取消原本的等待。
        if (!isEnabled(button) || (timer !== null && pendingButton !== button)) {
            cancelTimer();
        }

        if (!isEnabled(button) || timer !== null) return;

        pendingButton = button;
        const delay = 3000 + Math.random() * 2000;

        timer = setTimeout(() => {
            timer = null;
            pendingButton = null;

            if (!running) return;

            const currentButton = getGenerateButton();

            // 點擊前再次確認，避免點擊已停用或被替換的按鈕。
            if (currentButton === button && isEnabled(currentButton)) {
                currentButton.click();
            }

            // 若仍可用，就安排下一次；否則等待狀態恢復。
            checkState();
        }, delay);
    }

    function toggleAutoGenerate() {
        running = !running;

        if (running) {
            stateObserver = new MutationObserver(checkState);

            stateObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['disabled', 'aria-disabled'],
                childList: true,
                subtree: true
            });

            checkState();
        } else {
            stateObserver?.disconnect();
            stateObserver = null;
            cancelTimer();
        }

        updateToggleText();
    }

    function setupAutoButton() {
        const footer = document.querySelector('div.image-gen-footer');
        const button = footer?.querySelector(
            ':scope > button.image-gen-generate-button'
        );

        if (!footer || !button) return;

        footer.classList.add('auto-gen-layout');

        let autoButton = footer.querySelector(':scope > button.auto-gen');

        if (!autoButton) {
            autoButton = document.createElement('button');
            autoButton.type = 'button';
            autoButton.className = 'auto-gen';
            autoButton.textContent = running ? 'stop' : 'start';
            autoButton.addEventListener('click', toggleAutoGenerate);
        }

        // 只插入或調整 auto-gen，不移動原本的生成按鈕。
        if (button.nextElementSibling !== autoButton) {
            button.after(autoButton);
        }
    }

    setupAutoButton();

    // 持續處理網頁動態載入；自動點擊的狀態監聽另外管理。
    const layoutObserver = new MutationObserver(setupAutoButton);

    layoutObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
})();