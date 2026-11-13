(() => {
  'use strict';
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
    .v2tree-node > .cell { border-bottom:0; }
    .v2tree-node .reply_content { overflow-wrap:anywhere; }
    .v2tree-node > .cell strong, .v2tree-node > .cell .no { white-space:nowrap; }
    .v2tree-node.v2tree-root { border-bottom:1px solid rgba(128,128,128,.18); padding-bottom:8px; }
    .v2tree-children { margin:0 0 0 20px; border-left:2px solid rgba(128,128,128,.22); }
    .v2tree-children.v2tree-deep { margin-left:0; margin-right:0; border-left:0; }
    .v2tree-children > .v2tree-node > .cell { padding-top:9px; padding-bottom:8px; }
    .v2tree-children > .v2tree-node > .cell:hover { background:rgba(128,128,128,.035); }
    .v2tree-toggle { display:inline-flex; align-items:center; gap:4px; cursor:pointer; font:inherit; font-size:11px; line-height:1.4; white-space:nowrap; color:inherit; opacity:.58; background:transparent; border:0; border-radius:4px; padding:2px 5px; margin-left:5px; vertical-align:middle; }
    .v2tree-toggle:hover, .v2tree-toggle:focus-visible { opacity:1; background:rgba(128,128,128,.12); }
    .v2tree-parent { display:inline-block; font-size:11px; opacity:.55; margin-left:6px; white-space:nowrap; }
    @media(max-width:600px) { .v2tree-children { margin-left:12px; margin-right:0; } .v2tree-children.v2tree-deep-mobile { margin-left:0; margin-right:0; border-left:0; } .v2tree-note { width:100%; } }
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
      if (depth >= 3) children.classList.add('v2tree-deep');
      if (depth >= 2) children.classList.add('v2tree-deep-mobile');
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
})();
