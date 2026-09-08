// ==UserScript==
// @name         Twitch Auto Claim Channel Points
// @namespace    twitch-auto-claim
// @version      2026-09-02
// @description  Automatically claim Twitch channel point bonuses
// @author       You
// @match        https://www.twitch.tv/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitch.tv
// @grant        none
// @run-at       document-idle
// ==/UserScript==


(() => {
    'use strict';

    const CLICK_COOLDOWN_MS = 2000;

    let lastClick = 0;

    function log(...args) {
        console.log('[Twitch Auto Claim]', ...args);
    }

    function tryClaimBonus() {
        const icon = document.querySelector('.claimable-bonus__icon');
        const button = icon?.closest('button') ?? null;

        if (!button) {
            return;
        }

        const now = Date.now();

        if (now - lastClick < CLICK_COOLDOWN_MS) {
            return;
        }

        lastClick = now;

        log('Claim bonus button found, clicking...');
        button.click();
    }

    // Twitch 是 SPA，而且 bonus icon 會動態加入 DOM，
    // 所以直接監聽整個 body。
    const observer = new MutationObserver(() => {
        tryClaimBonus();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // 腳本啟動時先檢查一次，
    // 避免 icon 在 observer 建立前就已經存在。
    tryClaimBonus();

    log('Observer started');
})();