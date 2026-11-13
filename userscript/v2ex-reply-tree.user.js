// ==UserScript==
// @name         V2EX 回复树与个人信息模糊
// @namespace    local.v2ex.reply.tree
// @version      1.0.0
// @description  回复树、个人信息模糊，以及粘贴图片上传 Imgur
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

  function initReplyTree() {
  if (!/^\/t\/\d+/.test(location.pathname)) return;
  const cells = [...document.querySelectorAll('div.cell[id^="r_"]')]
    .filter(el => /^r_\d+$/.test(el.id) && el.querySelector('.reply_content'));
  if (!cells.length) return;
  const container = cells[0].parentElement;
  const pageCells = cells.filter(el => el.parentElement === container);
  if (!pageCells.length) return;

  const style = document.createElement('style');
  style.textContent = `
    .v2tree-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 14px; border-bottom:1px solid rgba(128,128,128,.18); font-size:12px; }
    .v2tree-toolbar button { cursor:pointer; font:inherit; color:inherit; background:transparent; border:1px solid rgba(128,128,128,.35); border-radius:6px; padding:4px 9px; }
    .v2tree-toolbar button:hover { background:rgba(128,128,128,.1); }
    .v2tree-note { opacity:.65; }
    .v2tree-node { position:relative; min-width:0; }
    .v2tree-node > .cell { overflow-wrap:anywhere; border-bottom:0; }
    .v2tree-node.v2tree-root { border-bottom:1px solid rgba(128,128,128,.18); padding-bottom:8px; }
    .v2tree-children { margin:0 12px 0 35px; border-left:2px solid rgba(128,128,128,.22); }
    .v2tree-children.v2tree-deep { margin-left:0; margin-right:0; border-left:0; }
    .v2tree-children > .v2tree-node > .cell { padding-top:9px; padding-bottom:8px; }
    .v2tree-children > .v2tree-node > .cell:hover { background:rgba(128,128,128,.035); }
    .v2tree-toggle { display:inline-flex; align-items:center; gap:4px; cursor:pointer; font:inherit; font-size:11px; line-height:1.4; color:inherit; opacity:.58; background:transparent; border:0; border-radius:4px; padding:2px 5px; margin-left:5px; vertical-align:middle; }
    .v2tree-toggle:hover, .v2tree-toggle:focus-visible { opacity:1; background:rgba(128,128,128,.12); }
    .v2tree-parent { display:inline-block; font-size:11px; opacity:.55; margin-left:6px; white-space:nowrap; }
    @media(max-width:600px) { .v2tree-children { margin-left:18px; margin-right:4px; } .v2tree-children.v2tree-deep-mobile { margin-left:0; margin-right:0; border-left:0; } .v2tree-note { width:100%; } }
  `;
  document.head.appendChild(style);

  const toolbar = document.createElement('div');
  toolbar.className = 'v2tree-toolbar';
  const switcher = document.createElement('button');
  switcher.type = 'button';
  const note = document.createElement('span');
  note.className = 'v2tree-note';
  note.textContent = '仅整理当前页；仅 @ 用户名时按最近回复推测';
  toolbar.append(switcher, note);
  container.insertBefore(toolbar, pageCells[0]);

  const entries = pageCells.map((cell, index) => {
    const placeholder = document.createComment('v2tree-original-position');
    cell.before(placeholder);
    const authorLink = cell.querySelector('strong a[href^="/member/"]');
    const author = authorLink?.getAttribute('href')?.split('/')[2]?.toLowerCase() || '';
    const floor = Number(cell.querySelector('.no')?.textContent.trim()) || 0;
    return { cell, placeholder, index, author, floor, parent: null, children: [] };
  });
  const byFloor = new Map(entries.filter(x => x.floor).map(x => [x.floor, x]));
  const previousByAuthor = new Map();
  for (const entry of entries) {
    const content = entry.cell.querySelector('.reply_content');
    // 仅识别正文开头的 @，避免把普通提及误判为回复关系。
    const text = content.textContent.replace(/\u00a0/g, ' ').trimStart();
    const match = text.match(/^@([\w.-]+)(?:\s*#(\d+))?(?=\s|[,:，：]|$)/);
    if (match) {
      const username = match[1].toLowerCase();
      const floor = match[2] ? Number(match[2]) : null;
      const candidate = floor ? byFloor.get(floor) : previousByAuthor.get(username);
      if (candidate && candidate.index < entry.index && candidate.author === username) {
        entry.parent = candidate;
        entry.inferred = !floor;
        candidate.children.push(entry);
      }
    }
    if (entry.author) previousByAuthor.set(entry.author, entry);
  }

  let treeMode = false;
  const wrappers = [];
  function renderEntry(entry, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = 'v2tree-node' + (depth === 0 ? ' v2tree-root' : '');
    wrappers.push(wrapper);
    wrapper.append(entry.cell);
    if (entry.parent) {
      const badge = document.createElement('span');
      badge.className = 'v2tree-parent';
      badge.textContent = `↳ #${entry.parent.floor || '?'}${entry.inferred ? '（推测）' : ''}`;
      entry.cell.querySelector('.no')?.after(badge);
    }
    if (entry.children.length) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'v2tree-toggle';
      const children = document.createElement('div');
      children.className = 'v2tree-children';
      // 限制视觉缩进，避免深层回复在窄屏上无法阅读。
      if (depth >= 5) children.classList.add('v2tree-deep');
      if (depth >= 3) children.classList.add('v2tree-deep-mobile');
      for (const child of entry.children) children.append(renderEntry(child, depth + 1));
      const update = () => {
        button.textContent = children.hidden ? `▸ ${entry.children.length} 条回复` : `▾ ${entry.children.length} 条回复`;
        button.setAttribute('aria-expanded', String(!children.hidden));
      };
      button.addEventListener('click', () => { children.hidden = !children.hidden; update(); });
      update();
      // 将控制按钮放进回复头部，避免在每层之间占用一整行。
      const header = entry.cell.querySelector('strong');
      if (header) header.after(button);
      else entry.cell.prepend(button);
      wrapper.append(children);
    }
    return wrapper;
  }
  function setMode(enabled) {
    treeMode = enabled;
    if (enabled) {
      const fragment = document.createDocumentFragment();
      for (const entry of entries) if (!entry.parent) fragment.append(renderEntry(entry, 0));
      toolbar.after(fragment);
    } else {
      for (const entry of entries) {
        entry.cell.querySelectorAll('.v2tree-parent, .v2tree-toggle').forEach(el => el.remove());
        entry.placeholder.after(entry.cell);
      }
      wrappers.splice(0).forEach(el => el.remove());
    }
    switcher.textContent = enabled ? '切换为原始顺序' : '切换为回复树';
    switcher.setAttribute('aria-pressed', String(enabled));
  }
  switcher.addEventListener('click', () => setMode(!treeMode));
  setMode(true);
  // 打开带回复锚点的链接时，确保被移动后的目标仍然可见。
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && target.matches('div.cell[id^="r_"]')) target.scrollIntoView();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initImagePaste(); initReplyTree(); }, { once: true });
  } else {
    initImagePaste();
    initReplyTree();
  }
})();
