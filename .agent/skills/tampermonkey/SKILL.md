---
description: "Best practices and conventions for developing robust Tampermonkey userscripts."
---

# Tampermonkey Development Skills

This document outlines the mandatory conventions and best practices for developing Tampermonkey scripts in this workspace.

## 1. Execution Context

### Grant None
- **ALWAYS** start with `// @grant none`.
- **WHY**: This runs the script in the page's native context (not a sandbox). It provides the best performance, direct access to `window` variables, and avoids the complexity of `unsafeWindow`.

```javascript
// ==UserScript==
// ...
// @grant        none
// ==/UserScript==
```

## 2. Scope & Architecture

### IIFE & Strict Mode
- **ALWAYS** wrap your code in an **IIFE** (Immediately Invoked Function Expression).
- **ALWAYS** use `'use strict'`.
- **WHY**: This avoids polluting the global scope and catches common coding errors.

```javascript
(function () {
    'use strict';
    // Application code here
})();
```

## 3. Coding Conventions

### Control Structures
- **ALWAYS** use curly braces `{}` for all control structures, even single-line statements.

```javascript
// BAD
if (condition) doSomething();

// GOOD
if (condition) {
    doSomething();
}
```

## 4. Safe DOM & Styling

### Trusted Types (Policy)
- **ALWAYS** create a Trusted Types policy if the browser supports it. Google services (like Gemini) require this for `innerHTML` assignments.
- Use a helper function `html` to safely set HTML content.

```javascript
const policy = window.trustedTypes && window.trustedTypes.createPolicy ?
    window.trustedTypes.createPolicy('myScriptPolicy', { createHTML: s => s }) :
    { createHTML: s => s };

function html(strings, ...values) {
    const raw = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
    return policy.createHTML(raw);
}

// Usage
element.innerHTML = html`<div>Safe Content</div>`;
```

### Centralized CSS
- **DO NOT** Set styles dynamically in logic (e.g., `el.style.color = 'red'`).
- **INSTEAD**, use a helper to inject a `<style>` block at the beginning.
- **WHY**: Keeps logic separate from presentation and enables easier theming.

```javascript
function css(strings, ...values) {
    const raw = strings.reduce((acc, str, i) => acc + str + (values[i] || ''), '');
    const style = document.createElement('style');
    style.textContent = raw;
    document.head.appendChild(style);
}

// Usage
css`
    .my-custom-class {
        color: red;
        font-weight: bold;
    }
`;
```

## 5. Robustness & Stability

### Avoid `setTimeout`
- **DO NOT** rely on `setTimeout` for UI synchronization.
- **INSTEAD**, use `MutationObserver` or `requestAnimationFrame`.

### Waiting for Elements
Use a utility function to reliably wait for elements.

```javascript
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver((mutations, obs) => {
            const el = document.querySelector(selector);
            if (el) {
                resolve(el);
                obs.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        if (timeout > 0) {
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout: ${selector}`));
            }, timeout);
        }
    });
}
```

### Event Delegation
- **DO NOT** attach event listeners to elements that are frequently added/removed.
- **INSTEAD**, attach a single listener to a stable parent (or `document.body`) and check `e.target`.

```javascript
document.body.addEventListener('click', (e) => {
    if (e.target.matches('.dynamic-button')) {
        handleButtonClick(e);
    }
});
```

## 6. Dependencies

### Zero External Dependencies
- **DO NOT** use `@require` to load external libraries (like jQuery, Lodash) unless absolutely necessary.
- **INSTEAD**, implement simple helpers for what you need (e.g., debounce, throttle, selector wrappers).
- **WHY**: Ensures the script is self-contained, loads faster, and is easier to audit.
