// ==UserScript==
// @name         V2EX 隐私模糊与图片上传
// @namespace    local.v2ex.privacy.imgur
// @version      1.0.1
// @description  模糊个人信息，以及粘贴图片上传 Imgur
// @match        https://v2ex.com/*
// @match        https://*.v2ex.com/*
// @match        http://v2ex.com/*
// @match        http://*.v2ex.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
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
    if (!/^\/(?:t\/\d+|new|write)(?:\/|$)/.test(location.pathname)) return;
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
    function getEditor(target) {
      const cmElement = target.closest?.('.CodeMirror');
      const cm = cmElement && unsafeWindow.document.querySelectorAll('.CodeMirror');
      const cmNode = cm && [...cm].find(node => node === cmElement);
      const codeMirror = cmNode?.CodeMirror;
      if (codeMirror && !codeMirror.getOption('readOnly')) {
        return {
          element: cmElement,
          insert: text => codeMirror.replaceSelection(text, 'end'),
          replace: (token, text) => {
            const pos = codeMirror.getValue().indexOf(token);
            if (pos < 0) return false;
            codeMirror.replaceRange(text, codeMirror.posFromIndex(pos), codeMirror.posFromIndex(pos + token.length));
            return true;
          }
        };
      }
      const aceElement = target.closest?.('.ace_editor');
      const aceNode = aceElement && [...unsafeWindow.document.querySelectorAll('.ace_editor')].find(node => node === aceElement);
      const ace = aceNode?.env?.editor;
      if (ace && !ace.getReadOnly()) {
        return {
          element: aceElement,
          insert: text => ace.insert(text),
          replace: (token, text) => {
            const doc = ace.session.doc;
            const pos = doc.getValue().indexOf(token);
            if (pos < 0) return false;
            ace.session.replace({ start: doc.indexToPosition(pos, 0), end: doc.indexToPosition(pos + token.length, 0) }, text);
            return true;
          }
        };
      }
      if (!(target instanceof HTMLTextAreaElement) || target.disabled || target.readOnly) return null;
      if (!/^(?:content|reply_content)$/i.test(target.name || '') && !/^(?:content|reply_content)$/i.test(target.id || '')) return null;
      return {
        element: target,
        insert: text => {
          target.setRangeText(text, target.selectionStart, target.selectionEnd, 'end');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        },
        replace: (token, text) => {
          const pos = target.value.indexOf(token);
          if (pos < 0) return false;
          target.setRangeText(text, pos, pos + token.length, 'preserve');
          target.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        }
      };
    }
    document.addEventListener('paste', event => {
      const editor = getEditor(event.target);
      if (!editor) return;
      const images = [...(event.clipboardData?.items || [])]
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile()).filter(Boolean);
      if (!images.length) return;
      const clientId = GM_getValue('imgurClientId', DEFAULT_IMGUR_CLIENT_ID) || configureImgur();
      if (!clientId) {
        statusFor(editor.element).textContent = '未设置 Imgur Client ID，图片未上传。可在油猴菜单中设置。';
        return;
      }
      event.preventDefault();
      const plainText = event.clipboardData.getData('text/plain');
      const tokens = images.map(() => `[Imgur 上传中 ${Date.now()}-${Math.random().toString(36).slice(2, 10)}]`);
      const insertion = [plainText, ...tokens].filter(Boolean).join('\n');
      editor.insert(insertion);
      const status = statusFor(editor.element);
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
          const replaced = editor.replace(token, url || '');
          if (url && !replaced) {
            messages.push(`上传成功（占位文字已删除）：${url}`);
          } else if (!url) {
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
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImagePaste, { once: true });
  } else {
    initImagePaste();
  }
})();
