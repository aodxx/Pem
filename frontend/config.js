(() => {
  'use strict';

  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwttI8iFWVls788jXX-nV_7MZsFvwGkwDaIU3JdfcmEqH9zYYzQ5pxGeSza6NLJqmxQGA/exec';
  const API_URL_STORAGE_KEY = 'palmApiUrl';
  const PAIRING_PENDING_KEY = 'palmOwnerPairingPending';
  const savedApiUrl = String(localStorage.getItem(API_URL_STORAGE_KEY) || '').trim();

  window.PALM_CONFIG = Object.freeze({
    apiUrl: savedApiUrl || DEFAULT_API_URL,
    defaultApiUrl: DEFAULT_API_URL,
    multiOwner: true,
    version: '2.6.4'
  });

  // Multi-owner pairing layer. app.js remains owner-agnostic and reads the
  // selected endpoint from PALM_CONFIG. When an owner changes endpoint we save
  // it locally, reload once, then let the existing connection test run against
  // the newly selected Apps Script deployment.
  document.addEventListener('DOMContentLoaded', () => {
    const apiInput = document.querySelector('#api-url');
    const tokenInput = document.querySelector('#access-token');
    const saveButton = document.querySelector('#save-settings');
    const resultBox = document.querySelector('#connection-result');

    const settingsView = document.querySelector('#view-settings');
    if (settingsView && !settingsView.querySelector('.developer-credit')) {
      const credit = document.createElement('div');
      credit.className = 'developer-credit';
      credit.setAttribute('aria-label', 'เครดิตผู้พัฒนา');
      credit.innerHTML = `
        <div class="developer-credit-copy">
          <span>CRAFTED FOR PALM LEDGER</span>
          <strong>Developed by <b>aod</b></strong>
        </div>
        <a class="developer-facebook" href="https://www.facebook.com/share/1AWvhjdr44/" target="_blank" rel="noopener noreferrer" aria-label="Facebook ของผู้พัฒนา aod" title="Facebook — aod">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 22v-9h3l.45-3.5H13.7V7.27c0-1.01.28-1.7 1.73-1.7h1.85V2.44c-.32-.04-1.42-.14-2.7-.14-2.67 0-4.5 1.63-4.5 4.62V9.5H7.05V13h3.03v9h3.62Z"/></svg>
        </a>`;
      settingsView.appendChild(credit);
    }

    if (!apiInput || !saveButton) return;

    apiInput.readOnly = false;
    apiInput.removeAttribute('readonly');
    apiInput.setAttribute('inputmode', 'url');
    apiInput.setAttribute('autocomplete', 'off');
    apiInput.setAttribute('placeholder', 'https://script.google.com/macros/s/.../exec');
    apiInput.value = window.PALM_CONFIG.apiUrl;

    saveButton.addEventListener('click', event => {
      const nextApiUrl = String(apiInput.value || '').trim();
      const valid = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(nextApiUrl);
      if (!valid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (resultBox) {
          resultBox.className = 'notice error';
          resultBox.textContent = 'Web App URL ไม่ถูกต้อง กรุณาใช้ URL ที่ลงท้ายด้วย /exec จาก Apps Script Deployment ของเจ้าของรายนี้';
        }
        return;
      }

      if (nextApiUrl !== window.PALM_CONFIG.apiUrl) {
        event.preventDefault();
        event.stopImmediatePropagation();
        localStorage.setItem(API_URL_STORAGE_KEY, nextApiUrl);
        if (tokenInput && tokenInput.value.trim()) {
          localStorage.setItem('palmAccessToken', tokenInput.value.trim());
        }
        localStorage.setItem(PAIRING_PENDING_KEY, '1');
        if (resultBox) {
          resultBox.className = 'notice';
          resultBox.textContent = 'กำลังสลับไปยังข้อมูลของเจ้าของรายนี้…';
        }
        window.setTimeout(() => window.location.reload(), 120);
      }
    }, true);

    if (localStorage.getItem(PAIRING_PENDING_KEY) === '1') {
      localStorage.removeItem(PAIRING_PENDING_KEY);
      window.setTimeout(() => {
        const button = document.querySelector('#save-settings');
        if (button) button.click();
      }, 250);
    }
  });
})();
