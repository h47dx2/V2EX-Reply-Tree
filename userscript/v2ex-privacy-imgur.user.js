// ==UserScript==
// @name         V2EX 隐私模糊与图片上传
// @namespace    local.v2ex.privacy.imgur
// @version      1.0.0
// @description  模糊个人信息，以及粘贴图片上传 Imgur
// @match        https://v2ex.com/*
// @match        https://*.v2ex.com/*
// @match        http://v2ex.com/*
// @match        http://*.v2ex.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.imgur.com
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';
  // xfun 作者公开分享的 Client ID；可在油猴菜单中设置其他 ID。
  const DEFAULT_IMGUR_CLIENT_ID = '9f3460e67f308f6';
  const privacyStyle = document.createElement('style');
  privacyStyle.textContent = `
    #Rightbar .box:has(.bigger.flex-one-row.gap10) img.avatar,
    #Rightbar .bigger.flex-one-row.gap10,
    #Top .tools a[href^="/member/"] {
      filter: blur(8px) !important;
      transition: filter .2s ease;
    }
    #Rightbar .box:has(.bigger.flex-one-row.gap10) img.avatar:hover,
    #Rightbar .bigger.flex-one-row.gap10:hover,
    #Top .tools a[href^="/member/"]:hover,
    #Top .tools a[href^="/member/"]:focus-visible {
      filter: blur(0) !important;
    }
  `;
  (document.head || document.documentElement).appendChild(privacyStyle);

  function configureImgur() {
    const current = GM_getValue('imgurClientId', DEFAULT_IMGUR_CLIENT_ID);
    const value = prompt('请输入 Imgur API 的 Client ID（不是 Client Secret）：', current);
    if (value === null) return current;
    const id = value.trim();
    GM_setValue('imgurClientId', id);
    return id;
  }
  GM_registerMenuCommand('设置 Imgur Client ID', configureImgur);

  function initImagePaste() {
    if (!/^\/(?:t\/\d+|new)(?:\/|$)/.test(location.pathname)) return;
    const statuses = new WeakMap();
    function statusFor(editor) {
      let status = statuses.get(editor);
      if (!status) {
        status = document.createElement('div');
        status.style.cssText = 'padding:6px 2px;font-size:12px;line-height:1.5;color:#777;overflow-wrap:anywhere';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        editor.insertAdjacentElement('afterend', status);
        statuses.set(editor, status);
      }
      return status;
    }
    document.addEventListener('paste', event => {
      const editor = event.target;
      if (!(editor instanceof HTMLTextAreaElement) || editor.disabled || editor.readOnly) return;
      if (!/^(?:content|reply_content)$/i.test(editor.name || '') && !/^(?:content|reply_content)$/i.test(editor.id || '')) return;
      const images = [...(event.clipboardData?.items || [])]
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile()).filter(Boolean);
      if (!images.length) return;
      const clientId = GM_getValue('imgurClientId', DEFAULT_IMGUR_CLIENT_ID) || configureImgur();
      if (!clientId) {
        statusFor(editor).textContent = '未设置 Imgur Client ID，图片未上传。可在油猴菜单中设置。';
        return;
      }
      event.preventDefault();
      const plainText = event.clipboardData.getData('text/plain');
      const tokens = images.map(() => `[Imgur 上传中 ${Date.now()}-${Math.random().toString(36).slice(2, 10)}]`);
      const insertion = [plainText, ...tokens].filter(Boolean).join('\n');
      editor.setRangeText(insertion, editor.selectionStart, editor.selectionEnd, 'end');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      const status = statusFor(editor);
      let pending = images.length;
      const messages = [];
      const show = () => { status.textContent = [pending ? `正在上传 ${pending} 张图片…` : '', ...messages].filter(Boolean).join('  '); };
      show();
      images.forEach((image, index) => {
        const form = new FormData();
        form.append('image', image, image.name || 'clipboard.png');
        function finish(url, error) {
          pending--;
          const token = tokens[index];
          const pos = editor.value.indexOf(token);
          if (url && pos !== -1) {
            editor.setRangeText(url, pos, pos + token.length, 'preserve');
            editor.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (url) {
            messages.push(`上传成功（占位文字已删除）：${url}`);
          } else {
            if (pos !== -1) {
              editor.setRangeText('', pos, pos + token.length, 'preserve');
              editor.dispatchEvent(new Event('input', { bubbles: true }));
            }
            messages.push(`上传失败：${error}，请重新粘贴图片。`);
          }
          show();
        }
        GM_xmlhttpRequest({
          method: 'POST', url: 'https://api.imgur.com/3/image',
          headers: { Authorization: `Client-ID ${clientId}` }, data: form, timeout: 60000,
          onload: response => {
            try {
              const data = JSON.parse(response.responseText);
              const url = data?.data?.link;
              if (response.status >= 200 && response.status < 300 && data.success && /^https:\/\/i\.imgur\.com\//i.test(url || '')) finish(url);
              else finish(null, typeof data?.data?.error === 'string' ? data.data.error : `HTTP ${response.status}`);
            } catch (_) { finish(null, `无法解析服务器响应（HTTP ${response.status}）`); }
          },
          onerror: () => finish(null, '网络错误'),
          ontimeout: () => finish(null, '请求超时')
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImagePaste, { once: true });
  } else {
    initImagePaste();
  }
})();
