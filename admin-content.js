/* ── Project Nithya — Admin: Website Text editor ──
   Shows the real page in a preview frame (?nithya-edit=1). Click any text
   to edit it in place. Edits stay as drafts until Publish, which first checks
   the layout at mobile, tablet and desktop widths.

   Layout safeguards
   - plain text only (paste is flattened; italic/bold/line breaks kept)
   - a character limit per block, scaled from the original length
   - live warnings when a heading/button starts wrapping onto more lines
     or text spills out of its box
   - a pre-publish check at three screen widths

   Photos: empty image cards (data-edit-img) take an uploaded photo. It is
   resized in the browser, uploaded to Storage (assets/site/), and fills the
   card with object-fit: cover around a focal point the admin picks.
*/
(function () {
  'use strict';

  var PAGES = {
    'index':           { file: 'index.html',           label: 'Home' },
    'safety':          { file: 'safety.html',          label: 'Safety' },
    'health-guidance': { file: 'health-guidance.html', label: 'Health Guidance' },
  };
  var DEVICES = { desktop: 1280, tablet: 768, mobile: 390 };
  var DEVICE_LABEL = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
  var SECTION_LABEL = {
    'nav': 'Top menu', 'mobilemenu': 'Mobile menu', 'hero': 'Hero', 'page-hero': 'Hero',
    'causes': 'Service cards', 'about': 'Story & about', 'founder': "Founder's letter",
    'impact': 'Impact', 'volunteer': 'Volunteer form', 'support': 'Footer', 'footer': 'Footer',
    'reach-out': 'Reach-out section', 'reach-form-wrap': 'Reach-out form', 'helpform': 'Reach-out form',
    'haematology': 'Haematology', 'areas': 'Other areas', 'page': 'Page content',
  };

  var sb = null, getUser = null;
  var started = false;
  var state = {
    page: 'index',
    device: 'desktop',
    published: {},   // key -> { html, updated_at, updated_by }
    drafts: {},      // key -> html (sanitized)
    dbOk: true,
    win: null, doc: null, api: null,
    activeEl: null, activeKey: null, activeStart: null,
    base: {},        // key -> how the original text lays out at the current width
    imgPublished: {}, // key -> { url, alt, pos, updated_at, updated_by }
    imgDrafts: {},    // key -> { url, alt, pos, preview } | null (= make the card empty again)
    activeImg: null, activeImgKey: null, uploading: false,
  };
  var MAX_SIDE = 2000;           // photos are resized to at most this many px
  var MAX_FILE = 30 * 1024 * 1024;

  var $ = function (id) { return document.getElementById(id); };

  /* ── Public entry ───────────────────────────── */
  function init(opts) {
    if (started) { fitFrame(); return; }
    started = true;
    sb = opts.sb; getUser = opts.getUser;
    wireToolbar();
    window.addEventListener('resize', fitFrame);
    window.addEventListener('beforeunload', function (e) {
      if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; }
    });
    loadPage('index');
  }

  /* ── Helpers ────────────────────────────────── */
  function norm(html) { return String(html || '').replace(/\s+/g, ' ').trim(); }
  function textOf(html) {
    var d = document.createElement('div'); d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function original(key) { return norm(state.api ? state.api.originals[key] : ''); }
  function publishedHtml(key) { return state.published[key] ? norm(state.published[key].html) : null; }
  function liveHtml(key) { var p = publishedHtml(key); return p != null ? p : original(key); }
  function currentHtml(key) { return key in state.drafts ? state.drafts[key] : liveHtml(key); }
  function dirtyCount() { return Object.keys(state.drafts).length + Object.keys(state.imgDrafts).length; }

  function currentImg(key) {
    return key in state.imgDrafts ? state.imgDrafts[key] : (state.imgPublished[key] || null);
  }
  function sameImg(a, b) {
    if (!a || !b) return !a && !b;
    return a.url === b.url && (a.alt || '') === (b.alt || '') && (a.pos || '50% 50%') === (b.pos || '50% 50%');
  }
  function firstSlot(key) { return state.api && state.api.imageSlots(key)[0]; }
  function slotLabel(slot) { return slot.getAttribute('data-img-label') || 'Photo'; }
  function slotPicture(slot) {
    return slot.tagName === 'IMG' ? slot : slot.querySelector(':scope > img.slot-img');
  }

  function kindOf(el, key) {
    var tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) return 'heading';
    if (tag === 'BUTTON' || tag === 'A' || tag === 'LABEL') return 'short';
    return textOf(original(key)).length <= 60 ? 'short' : 'long';
  }
  function limitFor(el, key) {
    var n = textOf(original(key)).length;
    var k = kindOf(el, key);
    if (k === 'long') return Math.ceil(n * 1.6) + 40;
    return Math.ceil(n * 1.5) + (k === 'heading' ? 10 : 8);
  }
  function kindLabel(el, key) {
    var t = el.tagName;
    if (/^H1$/.test(t)) return 'Main heading';
    if (/^H[2-6]$/.test(t)) return 'Heading';
    if (t === 'BUTTON') return 'Button';
    if (t === 'A') return 'Link';
    if (t === 'LABEL') return 'Form label';
    if (t === 'BLOCKQUOTE') return 'Quote';
    return kindOf(el, key) === 'long' ? 'Paragraph' : 'Short text';
  }
  function sectionOf(key) {
    var s = key.split('.')[1] || 'page';
    return SECTION_LABEL[s] || s.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function isVisible(el) { return el.getClientRects().length > 0; }
  function hasFormatting(html) { return /<(em|strong|b|i|br)\b/i.test(html); }

  /* Count rendered lines: cluster the line boxes of the text by vertical position. */
  function lineCount(el) {
    var r = el.ownerDocument.createRange();
    r.selectNodeContents(el);
    var rects = Array.prototype.filter.call(r.getClientRects(), function (x) { return x.width > 0.5 && x.height > 0.5; });
    if (!rects.length) return 0;
    var fs = parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize) || 16;
    var mids = rects.map(function (x) { return (x.top + x.bottom) / 2; }).sort(function (a, b) { return a - b; });
    var lines = 1, last = mids[0];
    for (var i = 1; i < mids.length; i++) {
      if (mids[i] - last > fs * 0.6) { lines++; last = mids[i]; }
    }
    return lines;
  }
  function overflows(el) {
    var cs = el.ownerDocument.defaultView.getComputedStyle(el);
    if (cs.display === 'inline') return false;
    return el.scrollWidth > el.clientWidth + 1;
  }
  function pageOverflows(doc) {
    return doc.documentElement.scrollWidth > doc.defaultView.innerWidth + 1;
  }

  /* How the ORIGINAL text lays out in this element. Briefly swaps the text,
     so never call it on the block currently being typed in. */
  function baseFor(el, origHtml) {
    var cur = el.innerHTML;
    el.innerHTML = origHtml;
    var b = { visible: isVisible(el), lines: lineCount(el), pageOverflow: pageOverflows(el.ownerDocument) };
    el.innerHTML = cur;
    return b;
  }

  function firstEl(api, key) {
    return Array.prototype.find.call(api.elements(key), function (x) { return !x.closest('[aria-hidden="true"]'); });
  }

  /* Baselines for every block in the preview at the current screen size. */
  function computeBaselines() {
    state.base = {};
    if (!state.api) return;
    Object.keys(state.api.originals).forEach(function (k) {
      var el = firstEl(state.api, k);
      if (el) state.base[k] = baseFor(el, state.api.originals[k]);
    });
  }

  /* Layout warnings: compare the element as it is now against its baseline. */
  function issuesFor(el, key, base, deviceName) {
    var issues = [];
    if (!base || !base.visible || !isVisible(el)) return issues;
    var lines = lineCount(el);
    var kind = kindOf(el, key);
    var where = deviceName ? ' on ' + DEVICE_LABEL[deviceName] : ' at this screen size';
    if (overflows(el) || (!base.pageOverflow && pageOverflows(el.ownerDocument))) {
      issues.push({ level: 'bad', msg: 'Text spills outside its box' + where + '.' });
    }
    if (kind !== 'long' && lines > base.lines) {
      issues.push({ level: 'warn', msg: 'Now wraps onto ' + lines + ' lines (originally ' + base.lines + ')' + where + '.' });
    } else if (kind === 'long' && lines > Math.ceil(base.lines * 1.5) + 1) {
      issues.push({ level: 'info', msg: 'Noticeably longer than the original (' + lines + ' lines vs ' + base.lines + ')' + where + '.' });
    }
    return issues;
  }

  /* ── Toolbar ────────────────────────────────── */
  function wireToolbar() {
    document.querySelectorAll('.ce-page').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.page === state.page) return;
        if (dirtyCount() && !confirm('You have unpublished changes on this page. Discard them?')) return;
        loadPage(b.dataset.page);
      });
    });
    document.querySelectorAll('.ce-device').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = state.activeKey;
        deactivate();
        state.device = b.dataset.device;
        document.querySelectorAll('.ce-device').forEach(function (x) { x.classList.toggle('active', x === b); });
        fitFrame();
        // wait for the preview to reflow at the new width, then re-measure
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          computeBaselines();
          var el = key && state.api && firstEl(state.api, key);
          if (el) activate(el);
        }); });
      });
    });
    $('ce-discard').addEventListener('click', function () {
      if (!dirtyCount()) return;
      if (!confirm('Discard all ' + dirtyCount() + ' unpublished change(s)?')) return;
      deactivate();
      state.drafts = {};
      state.imgDrafts = {};
      applyAll();
      refreshUI();
      toast('Changes discarded.');
    });
    $('ce-publish').addEventListener('click', prePublish);
    $('ce-search').addEventListener('input', renderList);
    $('ce-modal').addEventListener('click', function (e) { if (e.target.id === 'ce-modal') closeModal(); });
  }

  function fitFrame() {
    var stage = $('ce-stage'), wrap = $('ce-frame-wrap'), frame = $('ce-frame');
    if (!stage || !stage.clientWidth) return;
    var w = DEVICES[state.device];
    var avail = stage.clientWidth - 24;
    var scale = Math.min(1, avail / w);
    var h = stage.clientHeight - 24;
    frame.style.width = w + 'px';
    frame.style.height = (h / scale) + 'px';
    frame.style.transform = 'scale(' + scale + ')';
    wrap.style.width = (w * scale) + 'px';
    wrap.style.height = h + 'px';
    $('ce-scale').textContent = scale < 1 ? 'Shown at ' + Math.round(scale * 100) + '% · ' + w + 'px wide' : w + 'px wide';
  }

  /* ── Loading a page ─────────────────────────── */
  function loadPage(page) {
    deactivate();
    state.page = page;
    state.drafts = {};
    state.published = {};
    state.imgDrafts = {};
    state.imgPublished = {};
    state.base = {};
    state.api = null; state.win = null; state.doc = null;
    document.querySelectorAll('.ce-page').forEach(function (b) { b.classList.toggle('active', b.dataset.page === page); });
    $('ce-stage').classList.add('loading');
    renderField(); refreshUI();

    var frameReady = new Promise(function (resolve) {
      function onMsg(e) {
        if (e.origin !== location.origin || !e.data || e.data.type !== 'nithya-edit-ready') return;
        if (e.source !== $('ce-frame').contentWindow) return;
        window.removeEventListener('message', onMsg);
        resolve();
      }
      window.addEventListener('message', onMsg);
    });
    $('ce-frame').src = PAGES[page].file + '?nithya-edit=1';
    fitFrame();

    var dataReady = Promise.all([
      sb.from('nithya_site_content').select('key,html,updated_at,updated_by').eq('page', page),
      sb.from('nithya_site_images').select('key,url,alt,pos,updated_at,updated_by').eq('page', page),
    ])
      .then(function (res) {
        if (res[0].error) throw res[0].error;
        if (res[1].error) throw res[1].error;
        state.dbOk = true;
        (res[0].data || []).forEach(function (r) { state.published[r.key] = r; });
        (res[1].data || []).forEach(function (r) { state.imgPublished[r.key] = r; });
      })
      .catch(function (err) {
        console.error(err);
        state.dbOk = false;
      });

    Promise.all([frameReady, dataReady]).then(function () {
      if (state.page !== page) return;
      setupFrame();
      $('ce-stage').classList.remove('loading');
      $('ce-dberr').classList.toggle('vis', !state.dbOk);
      refreshUI();
    });
  }

  function applyAll() {
    if (!state.api) return;
    var map = {};
    Object.keys(state.api.originals).forEach(function (k) { map[k] = currentHtml(k); });
    state.api.apply(map);
    applyImagesToFrame();
    markChanged();
  }

  // Preview uses the local copy of a just-uploaded photo (instant, no CDN wait).
  function imageMap() {
    var map = {};
    Object.keys(state.api.imgOriginals).forEach(function (k) {
      var c = currentImg(k);
      if (c) map[k] = { url: c.preview || c.url, alt: c.alt, pos: c.pos };
    });
    return map;
  }
  function applyImagesToFrame() {
    if (!state.api) return;
    state.api.applyImages(imageMap());
  }

  /* ── Wiring the preview frame ───────────────── */
  var FRAME_CSS = [
    '[data-edit]{outline:1.5px dashed transparent;outline-offset:3px;cursor:text}',
    'body.ce-on [data-edit]:hover{outline-color:rgba(232,137,158,.75)}',
    '[data-edit].ce-changed{outline:1.5px solid rgba(242,206,58,.95)}',
    // outline only: never touch the element's own colours (e.g. white text on navy buttons)
    '[data-edit].ce-active{outline:2px solid #E8899E!important;outline-offset:4px}',
    '[data-edit].ce-issue{outline:2px solid #D9822B!important}',
    '[data-edit][contenteditable]{caret-color:#E8899E}',
    '[data-edit] *{cursor:text}',
    '[data-edit-img]{cursor:pointer;outline:1.5px dashed transparent;outline-offset:3px}',
    'body.ce-on [data-edit-img]:hover{outline-color:rgba(232,137,158,.75)}',
    '[data-edit-img].ce-changed{outline:1.5px solid rgba(242,206,58,.95)}',
    '[data-edit-img].ce-active{outline:2px solid #E8899E!important;outline-offset:4px}',
    '[data-edit-img].ce-drop-over{outline:3px dashed #E8899E!important;outline-offset:-6px}',
  ].join('\n');

  function setupFrame() {
    var frame = $('ce-frame');
    state.win = frame.contentWindow;
    state.doc = frame.contentDocument;
    state.api = state.win.NithyaContent;
    var doc = state.doc;

    var st = doc.createElement('style'); st.textContent = FRAME_CSS; doc.head.appendChild(st);
    doc.body.classList.add('ce-on');
    applyAll();
    computeBaselines();
    // web fonts change line wrapping — re-measure once they're in
    if (doc.fonts) doc.fonts.ready.then(function () { if (!state.activeEl) computeBaselines(); });

    // Start editing on mousedown so the caret lands where the person clicked.
    doc.addEventListener('mousedown', function (e) {
      var slot = e.target.closest && e.target.closest('[data-edit-img]');
      if (slot && !(e.target.closest('[data-edit]') && slot.contains(e.target.closest('[data-edit]')))) {
        e.preventDefault();
        activateImage(slot);
        return;
      }
      var el = e.target.closest && e.target.closest('[data-edit]');
      if (!el || el.closest('[aria-hidden="true"]')) { deactivate(); renderField(); return; }
      if (el !== state.activeEl) activate(el, { fromClick: true });
    }, true);

    // Links, buttons and forms do nothing in the preview.
    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.closest) return;
      var a = t.closest('a, button[type="submit"], label, [data-edit]');
      if (a && !t.closest('#navBurger')) e.preventDefault();
    }, true);
    doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);

    // Drop a photo file straight onto an image card in the preview.
    // Anywhere else, dropping a file must not navigate the preview away.
    var overSlot = null;
    function setOver(s) {
      if (overSlot && overSlot !== s) overSlot.classList.remove('ce-drop-over');
      overSlot = s; if (s) s.classList.add('ce-drop-over');
    }
    doc.addEventListener('dragover', function (e) {
      e.preventDefault();
      var s = e.target.closest && e.target.closest('[data-edit-img]');
      e.dataTransfer.dropEffect = s ? 'copy' : 'none';
      setOver(s);
    }, true);
    doc.addEventListener('dragleave', function (e) { if (!e.relatedTarget) setOver(null); }, true);
    doc.addEventListener('drop', function (e) {
      e.preventDefault();
      var s = e.target.closest && e.target.closest('[data-edit-img]');
      setOver(null);
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (s && file) { activateImage(s); handleFile(s.dataset.editImg, file); }
    }, true);

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.activeEl) {
        state.activeEl.innerHTML = state.activeStart;
        onEdit();
        deactivate();
      }
    });

    renderList();
  }

  /* ── Editing one block ──────────────────────── */
  function activate(el, opts) {
    opts = opts || {};
    deactivate();
    var key = el.dataset.edit;
    state.activeEl = el;
    state.activeKey = key;
    state.activeStart = el.innerHTML;
    state.lastGood = el.innerHTML;
    el.classList.add('ce-active');

    var inline = isVisible(el) && el.tagName !== 'BUTTON';
    if (inline) {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      el.addEventListener('keydown', onKey);
      el.addEventListener('beforeinput', onBeforeInput);
      el.addEventListener('input', onEdit);
      el.addEventListener('paste', onPaste);
      el.addEventListener('drop', stop);
      el.addEventListener('blur', onBlur);
      if (!opts.fromClick) {
        el.focus({ preventScroll: true });
        var sel = state.win.getSelection(), r = state.doc.createRange();
        r.selectNodeContents(el); r.collapse(false);
        sel.removeAllRanges(); sel.addRange(r);
      }
    }
    if (!opts.fromClick && isVisible(el)) {
      // scroll the preview only — not the admin page around it
      var rect = el.getBoundingClientRect();
      state.win.scrollTo({ top: state.win.scrollY + rect.top - (state.win.innerHeight - rect.height) / 2, behavior: 'smooth' });
    }
    renderField();
    highlightListItem();
  }

  function deactivate() {
    if (state.activeImg) {
      state.activeImg.classList.remove('ce-active');
      state.activeImg = null; state.activeImgKey = null;
    }
    var el = state.activeEl;
    if (!el) return;
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    el.classList.remove('ce-active');
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('beforeinput', onBeforeInput);
    el.removeEventListener('input', onEdit);
    el.removeEventListener('paste', onPaste);
    el.removeEventListener('drop', stop);
    el.removeEventListener('blur', onBlur);
    var key = state.activeKey;
    state.activeEl = null; state.activeKey = null;
    // Empty text isn't allowed — it would leave a hole in the layout.
    if (!textOf(el.innerHTML)) {
      setValue(key, liveHtml(key));
      toast('Text can’t be left empty, so it was put back.');
    } else {
      // tidy up stray whitespace / browser-inserted markup
      var clean = state.api.sanitize(el.innerHTML);
      if (el.innerHTML !== clean) setValue(key, clean);
    }
    renderField();
    highlightListItem();
  }

  function stop(e) { e.preventDefault(); }

  function onBlur() {
    // Focus moving to the admin side panel keeps the block selected (so
    // "Restore original" etc. still apply to it). Focus moving elsewhere
    // inside the preview ends the edit.
    setTimeout(function () {
      if (state.activeEl && state.doc.hasFocus() && state.doc.activeElement !== state.activeEl) deactivate();
    }, 120);
  }

  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey && kindOf(state.activeEl, state.activeKey) !== 'short') {
        insertLineBreak();
      } else {
        state.activeEl.blur();
        deactivate();
      }
    }
  }

  function insertLineBreak() {
    var sel = state.win.getSelection();
    if (!sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    r.deleteContents();
    var br = state.doc.createElement('br');
    r.insertNode(br);
    r.setStartAfter(br); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    onEdit();
  }

  function remaining() {
    var el = state.activeEl;
    var sel = state.win.getSelection();
    var selected = sel && sel.rangeCount ? sel.toString().length : 0;
    return limitFor(el, state.activeKey) - textOf(el.innerHTML).length + selected;
  }

  function onBeforeInput(e) {
    var t = e.inputType || '';
    if (t === 'insertParagraph' || t === 'insertLineBreak') { e.preventDefault(); return; }
    if (t.indexOf('format') === 0 && t !== 'formatBold' && t !== 'formatItalic') { e.preventDefault(); return; }
    if (t === 'insertText' || t === 'insertReplacementText' || t === 'insertCompositionText') {
      var add = (e.data || '').length || 1;
      if (remaining() - add < 0) { e.preventDefault(); bumpCounter(); }
    }
  }

  function onPaste(e) {
    e.preventDefault();
    var txt = (e.clipboardData || state.win.clipboardData).getData('text/plain') || '';
    txt = txt.replace(/\s+/g, ' ');
    var room = remaining();
    if (txt.length > room) { txt = txt.slice(0, Math.max(0, room)); bumpCounter(); }
    if (txt) state.doc.execCommand('insertText', false, txt);
  }

  function onEdit() {
    var el = state.activeEl, key = state.activeKey;
    if (!el) return;
    // Backstop for inputs that skip beforeinput (autocorrect, IME, some
    // browsers): never let the text go past its limit.
    if (textOf(el.innerHTML).length > limitFor(el, key) &&
        textOf(el.innerHTML).length > textOf(state.lastGood || '').length) {
      el.innerHTML = state.lastGood;
      var sel = state.win.getSelection(), r = state.doc.createRange();
      r.selectNodeContents(el); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
      bumpCounter();
      return;
    }
    state.lastGood = el.innerHTML;
    var clean = state.api.sanitize(el.innerHTML);
    // keep marquee duplicates (aria-hidden copies) in step
    state.api.elements(key).forEach(function (x) { if (x !== el) x.innerHTML = el.innerHTML; });
    if (clean === liveHtml(key)) delete state.drafts[key];
    else state.drafts[key] = clean;
    markChanged();
    refreshUI();
    renderField(true);
  }

  /* Set a value from outside the inline editor (side panel, restore, discard). */
  function setValue(key, html) {
    html = state.api.sanitize(html);
    state.api.elements(key).forEach(function (x) { x.innerHTML = html; });
    if (html === liveHtml(key)) delete state.drafts[key];
    else state.drafts[key] = html;
    markChanged();
    refreshUI();
    renderList();
  }

  function markChanged() {
    if (!state.doc) return;
    state.api.elements().forEach(function (el) {
      el.classList.toggle('ce-changed', el.dataset.edit in state.drafts);
    });
    state.api.imageSlots().forEach(function (el) {
      el.classList.toggle('ce-changed', el.dataset.editImg in state.imgDrafts);
    });
  }

  /* ── Photos for empty image cards ───────────── */
  function activateImage(slot, opts) {
    opts = opts || {};
    deactivate();
    state.activeImg = slot;
    state.activeImgKey = slot.dataset.editImg;
    slot.classList.add('ce-active');
    if (opts.scroll) {
      var rect = slot.getBoundingClientRect();
      state.win.scrollTo({ top: state.win.scrollY + rect.top - Math.max(40, (state.win.innerHeight - rect.height) / 2), behavior: 'smooth' });
    }
    renderField();
    highlightListItem();
  }

  function setImg(key, img) {
    if (sameImg(img, state.imgPublished[key] || null)) delete state.imgDrafts[key];
    else state.imgDrafts[key] = img;
    applyImagesToFrame();
    markChanged();
    refreshUI();
  }

  /* Resize + convert to JPG in the browser, so a 6 MB phone photo becomes a
     few hundred KB and the page stays fast. EXIF rotation is applied. */
  function prepareImage(file) {
    if (!/^image\//.test(file.type)) return Promise.reject(new Error('type'));
    if (file.size > MAX_FILE) return Promise.reject(new Error('size'));
    var decode = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' })
      : Promise.reject(new Error('decode'));
    return decode.catch(function () { throw new Error('decode'); }).then(function (bmp) {
      var s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // transparent PNGs → white, not black
      ctx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve, reject) {
        c.toBlob(function (b) { b ? resolve({ blob: b, w: w, h: h }) : reject(new Error('decode')); }, 'image/jpeg', 0.86);
      });
    });
  }

  function handleFile(key, file) {
    if (state.uploading) return;
    if (!state.dbOk) { toast('Saving is unavailable right now, so photos can’t be uploaded.'); return; }
    state.uploading = true;
    renderField();
    var preview = null;
    prepareImage(file).then(function (img) {
      preview = URL.createObjectURL(img.blob);
      var path = 'site/' + key.replace(/[^a-z0-9.-]/gi, '-') + '-' + Date.now() + '.jpg';
      return sb.storage.from('assets').upload(path, img.blob, {
        contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
      }).then(function (res) {
        if (res.error) throw res.error;
        var url = sb.storage.from('assets').getPublicUrl(path).data.publicUrl;
        var prev = currentImg(key);
        var slot = firstSlot(key);
        var defaultAlt = slot && slot.tagName === 'IMG' ? state.api.imgOriginals[key].alt : '';
        setImg(key, { url: url, preview: preview, w: img.w, h: img.h,
                      alt: prev && prev.alt || defaultAlt, pos: '50% 50%' });
        toast('Photo added — publish to make it live.');
      });
    }).catch(function (err) {
      console.error(err);
      if (preview) URL.revokeObjectURL(preview);
      var m = err && err.message;
      toast(m === 'type' ? 'That file isn’t a photo. Please choose a JPG, PNG or WebP image.'
          : m === 'size' ? 'That photo is over 30 MB. Please choose a smaller one.'
          : m === 'decode' ? 'This photo couldn’t be read. Please use JPG or PNG (iPhone HEIC photos: export as JPG first).'
          : (err && (err.statusCode === '403' || /row-level security|unauthorized/i.test(err.message || '')))
            ? 'Your account isn’t allowed to upload photos. Ask an admin to check your access.'
          : 'Upload failed. Please try again.');
    }).then(function () {
      state.uploading = false;
      if (state.activeImgKey === key) renderField();
      renderList();
    });
  }

  function renderImageField() {
    var box = $('ce-field');
    var key = state.activeImgKey, slot = state.activeImg;
    var cur = currentImg(key);
    var pub = state.imgPublished[key];
    var head =
      '<div class="ce-field-head">' +
        '<span class="ce-kind">' + esc(slotLabel(slot)) + '</span>' +
        '<span class="ce-sec">' + esc(sectionOf(key)) + '</span>' +
      '</div>';
    var fileInput = '<input type="file" id="ce-file" accept="image/jpeg,image/png,image/webp" hidden>';

    if (state.uploading) {
      box.innerHTML = head + '<div class="ce-drop busy"><div class="ce-spin"></div><span>Preparing and uploading…</span></div>';
      return;
    }
    if (!cur) {
      box.innerHTML = head +
        '<label class="ce-drop" id="ce-drop">' + fileInput +
          '<span class="ce-drop-icon">＋</span>' +
          '<span><strong>Drop a photo here</strong> or <u>choose a file</u></span>' +
          '<small>JPG, PNG or WebP. Large photos are resized automatically.</small>' +
        '</label>' +
        '<p class="ce-note">The photo fills the card at its current size and shape, so the page layout stays the same on every screen. You can also drag a photo straight onto the card in the preview.</p>' +
        '';
    } else {
      var pos = (cur.pos || '50% 50%').split(' ');
      box.innerHTML = head +
        '<div class="ce-imgbox"><span class="ce-imgframe" id="ce-imgbox" title="Click to set the focal point">' +
          '<img src="' + esc(cur.preview || cur.url) + '" alt="">' +
          '<i class="ce-focal" style="left:' + pos[0] + ';top:' + pos[1] + '"></i>' +
        '</span></div>' +
        '<p class="ce-note">Click the photo to pick the part that should always stay in view — the card crops differently on phones and computers.</p>' +
        '<div id="ce-imgwarn"></div>' +
        '<label class="ce-label" for="ce-alt">Describe the photo <span>(for screen readers)</span></label>' +
        '<input class="ce-input" id="ce-alt" maxlength="300" placeholder="e.g. what or who is in the photo" value="' + esc(cur.alt || '') + '">' +
        '<div class="ce-imgbtns">' + fileInput +
          '<button class="ce-btn-ghost ce-btn-sm" id="ce-replace">Replace photo</button>' +
          '<button class="ce-link" id="ce-remove">Remove photo</button>' +
        '</div>';
    }
    box.innerHTML +=
      '<div class="ce-field-foot">' +
        ((key in state.imgDrafts) ? '<button class="ce-link" id="ce-imgundo">↺ Undo photo changes</button>' : '<span></span>') +
        (pub ? '<span class="ce-pubinfo">Last published ' + esc(fmtDate(pub.updated_at)) + (pub.updated_by ? ' by ' + esc(pub.updated_by) : '') + '</span>' : '') +
      '</div>';

    var file = $('ce-file');
    file.addEventListener('change', function () { if (file.files[0]) handleFile(key, file.files[0]); });
    var drop = $('ce-drop');
    if (drop) {
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault(); drop.classList.remove('over');
        if (e.dataTransfer.files[0]) handleFile(key, e.dataTransfer.files[0]);
      });
    }
    if ($('ce-replace')) $('ce-replace').addEventListener('click', function () { file.click(); });
    if ($('ce-remove')) $('ce-remove').addEventListener('click', function () {
      setImg(key, null);
      renderField(); renderList();
      toast(pub ? 'Photo removed — publish to take it off the site.' : 'Photo removed.');
    });
    if ($('ce-imgundo')) $('ce-imgundo').addEventListener('click', function () {
      delete state.imgDrafts[key];
      applyImagesToFrame(); markChanged(); refreshUI();
      renderField();
    });
    var alt = $('ce-alt');
    if (alt) alt.addEventListener('input', function () {
      var c = currentImg(key);
      setImg(key, Object.assign({}, c, { alt: alt.value.replace(/\s+/g, ' ').trimStart() }));
    });
    var ib = $('ce-imgbox');
    if (ib) {
      ib.addEventListener('click', function (e) {
        var img = ib.querySelector('img').getBoundingClientRect();
        var x = Math.round(Math.min(1, Math.max(0, (e.clientX - img.left) / img.width)) * 100);
        var y = Math.round(Math.min(1, Math.max(0, (e.clientY - img.top) / img.height)) * 100);
        var p = x + '% ' + y + '%';
        ib.querySelector('.ce-focal').style.left = x + '%';
        ib.querySelector('.ce-focal').style.top = y + '%';
        setImg(key, Object.assign({}, currentImg(key), { pos: p }));
      });
      ib.querySelector('img').addEventListener('load', imageWarnings);
      imageWarnings();
    }
  }

  /* Warn when a photo has too few pixels for the card (it would look soft). */
  function imageWarnings() {
    var w = $('ce-imgwarn'), slot = state.activeImg;
    if (!w || !slot) return;
    var cur = currentImg(state.activeImgKey);
    var nw = cur && cur.w, nh = cur && cur.h;
    if (!nw) {
      var pic = slotPicture(slot);
      if (pic && pic.complete && pic.naturalWidth) { nw = pic.naturalWidth; nh = pic.naturalHeight; }
    }
    var r = slot.getBoundingClientRect();
    if (!nw || !r.width) { w.innerHTML = ''; return; }
    // cover-crop: the photo is scaled until it fills the card
    var need = Math.max(r.width / nw, r.height / nh);
    w.innerHTML = need > 0.75
      ? '<ul class="ce-issues"><li class="warn">This photo is quite small (' + nw + '×' + nh + ') for this card and may look blurry on sharp screens. A larger photo will look better.</li></ul>'
      : '';
  }

  /* ── Side panel: selected block ─────────────── */
  function renderField(onlyMeta) {
    var box = $('ce-field');
    var key = state.activeKey;
    if (state.activeImgKey && state.api) { renderImageField(); return; }
    if (!key || !state.api) {
      box.innerHTML =
        '<div class="ce-empty">' +
          '<div class="ce-empty-icon">✎</div>' +
          '<p><strong>Click any text in the preview</strong> to change it.</p>' +
          '<ul class="ce-tips">' +
            '<li><b>Enter</b> finishes editing · <b>Esc</b> undoes this edit</li>' +
            '<li><b>Shift + Enter</b> adds a line break in longer text</li>' +
            '<li><b>Ctrl/⌘ + I</b> italic · <b>Ctrl/⌘ + B</b> bold</li>' +
            '<li>Switch Desktop / Tablet / Mobile to see how it fits</li>' +
            '<li>Click an empty photo card to add a photo</li>' +
          '</ul>' +
        '</div>';
      return;
    }
    var el = state.activeEl;
    var cur = currentHtml(key);
    var len = textOf(cur).length;
    var lim = limitFor(el, key);
    var pct = Math.min(100, Math.round(len / lim * 100));
    var issues = issuesFor(el, key, state.base[key], null);
    state.api.elements(key).forEach(function (x) { x.classList.toggle('ce-issue', issues.some(function (i) { return i.level !== 'info'; })); });

    var metaHtml =
      '<div class="ce-count ' + (pct >= 100 ? 'full' : pct >= 85 ? 'near' : '') + '">' +
        '<div class="ce-count-bar"><span style="width:' + pct + '%"></span></div>' +
        '<div class="ce-count-txt">' + len + ' / ' + lim + ' characters' +
          (pct >= 100 ? ' — limit reached' : '') + '</div>' +
      '</div>' +
      (issues.length
        ? '<ul class="ce-issues">' + issues.map(function (i) {
            return '<li class="' + i.level + '">' + esc(i.msg) + (i.level === 'info' ? '' : ' Try a shorter wording.') + '</li>';
          }).join('') + '</ul>'
        : (isVisible(el) ? '<div class="ce-fits">✓ Fits the layout at this screen size</div>' : ''));

    if (onlyMeta && $('ce-meta')) { $('ce-meta').innerHTML = metaHtml; syncRestore(); return; }

    var pub = state.published[key];
    var useInput = !isVisible(el) || el.tagName === 'BUTTON';
    var html =
      '<div class="ce-field-head">' +
        '<span class="ce-kind">' + esc(kindLabel(el, key)) + '</span>' +
        '<span class="ce-sec">' + esc(sectionOf(key)) + '</span>' +
      '</div>';
    if (useInput) {
      var formatted = hasFormatting(cur);
      html += (!isVisible(el)
          ? '<p class="ce-note">This text isn’t shown at the ' + DEVICE_LABEL[state.device].toLowerCase() +
            ' size (for example it’s in the mobile menu), so edit it here.</p>' : '') +
        (formatted
          ? '<p class="ce-note">This text has italic/bold styling. Switch screen size to edit it directly in the preview.</p>'
          : '<input class="ce-input" id="ce-input" maxlength="' + lim + '" value="' + esc(textOf(cur)) + '">');
    }
    html += '<div id="ce-meta">' + metaHtml + '</div>' +
      '<div class="ce-field-foot">' +
        '<button class="ce-link" id="ce-restore">↺ Restore original text</button>' +
        (pub ? '<span class="ce-pubinfo">Last published ' + esc(fmtDate(pub.updated_at)) + (pub.updated_by ? ' by ' + esc(pub.updated_by) : '') + '</span>' : '') +
      '</div>' +
      '<details class="ce-orig"><summary>See original text</summary><p>' + state.api.sanitize(state.api.originals[key]) + '</p></details>';
    box.innerHTML = html;

    var input = $('ce-input');
    if (input) {
      input.addEventListener('input', function () {
        setValue(key, esc(input.value.replace(/\s+/g, ' ')));
        renderField(true);
      });
      input.addEventListener('blur', function () {
        if (!input.value.trim()) { setValue(key, liveHtml(key)); input.value = textOf(liveHtml(key)); toast('Text can’t be left empty, so it was put back.'); renderField(true); }
      });
    }
    $('ce-restore').addEventListener('mousedown', function (e) { e.preventDefault(); });
    $('ce-restore').addEventListener('click', function () {
      setValue(key, original(key));
      if (input) input.value = textOf(original(key));
      renderField(true);
      toast('Original text restored' + (pub ? ' — publish to make it live.' : '.'));
    });
    syncRestore();
  }

  function syncRestore() {
    var btn = $('ce-restore');
    if (btn) btn.disabled = currentHtml(state.activeKey) === original(state.activeKey);
  }

  function bumpCounter() {
    var c = document.querySelector('.ce-count');
    if (!c) return;
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }

  function fmtDate(s) {
    var d = new Date(s);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ── Side panel: list of all text ───────────── */
  function renderList() {
    var ul = $('ce-list');
    if (!state.api) { ul.innerHTML = ''; return; }
    var q = ($('ce-search').value || '').toLowerCase().trim();
    var seen = {}, groups = [], byName = {};
    // text blocks and photo cards, in page order
    state.doc.querySelectorAll('[data-edit], [data-edit-img]').forEach(function (el) {
      var isImg = el.hasAttribute('data-edit-img');
      var k = isImg ? el.dataset.editImg : el.dataset.edit;
      if (seen[k] || el.closest('[aria-hidden="true"]')) return;
      seen[k] = 1;
      var txt = isImg ? slotLabel(el) + (currentImg(k) ? '' : ' — empty, add a photo') : textOf(currentHtml(k));
      if (q && txt.toLowerCase().indexOf(q) < 0 && !(isImg && 'photo'.indexOf(q) >= 0)) return;
      var g = sectionOf(k);
      if (!byName[g]) { byName[g] = { name: g, items: [] }; groups.push(byName[g]); }
      byName[g].items.push({ key: k, txt: txt, el: el, img: isImg });
    });
    if (!groups.length) { ul.innerHTML = '<li class="ce-list-empty">No text matches “' + esc(q) + '”.</li>'; return; }
    ul.innerHTML = groups.map(function (g) {
      return '<li class="ce-grp"><div class="ce-grp-h">' + esc(g.name) + '</div><ul>' +
        g.items.map(function (it) {
          var drafts = it.img ? state.imgDrafts : state.drafts;
          var live = it.img ? state.imgPublished : state.published;
          var flag = it.key in drafts ? '<i class="ce-dot draft" title="Unpublished change"></i>'
                   : live[it.key] ? '<i class="ce-dot live" title="Edited (live)"></i>' : '';
          return '<li><button class="ce-item' + (it.img ? ' ce-item--img' : '') + '" data-key="' + esc(it.key) + '"' +
            (it.img ? ' data-img="1"' : '') + '>' + flag +
            (it.img ? '<b class="ce-item-ico" aria-hidden="true">▣</b>' : '') +
            '<span>' + esc(it.txt.length > 70 ? it.txt.slice(0, 68) + '…' : it.txt) + '</span></button></li>';
        }).join('') + '</ul></li>';
    }).join('');
    ul.querySelectorAll('.ce-item').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.img) {
          var s = firstSlot(b.dataset.key);
          if (s) activateImage(s, { scroll: true });
          return;
        }
        var el = Array.prototype.find.call(state.api.elements(b.dataset.key), function (x) { return !x.closest('[aria-hidden="true"]'); });
        if (el) activate(el);
      });
    });
    highlightListItem();
  }

  function highlightListItem() {
    document.querySelectorAll('.ce-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.key === (b.dataset.img ? state.activeImgKey : state.activeKey));
    });
  }

  /* ── Status & buttons ───────────────────────── */
  function refreshUI() {
    var n = dirtyCount();
    $('ce-status').textContent = !state.dbOk ? 'Saving unavailable'
      : n ? n + ' unpublished change' + (n === 1 ? '' : 's') : 'All changes published';
    $('ce-status').classList.toggle('dirty', n > 0);
    $('ce-discard').disabled = !n;
    $('ce-publish').disabled = !n || !state.dbOk;
    var link = document.querySelector('.ce-viewlive');
    if (link) link.href = PAGES[state.page].file;
    if (state.api) {
      clearTimeout(refreshUI._t);
      refreshUI._t = setTimeout(renderList, 150);
    }
  }

  /* ── Publish (with layout check) ────────────── */
  function prePublish() {
    if (!dirtyCount()) return;
    if (state.uploading) { toast('Please wait for the photo to finish uploading.'); return; }
    deactivate();
    // Photos always fill their card, so only text changes need the layout check.
    if (!Object.keys(state.drafts).length) { publish(); return; }
    openModal('<h3>Checking the layout…</h3><p class="ce-modal-sub">Trying your changes on mobile, tablet and desktop.</p><div class="ce-spin"></div>');
    checkAllDevices().then(function (problems) {
      if (!problems.length) { publish(); return; }
      var body = '<h3>Some text may not fit well</h3>' +
        '<p class="ce-modal-sub">Your changes will still work, but these spots may look different from the original design.</p>' +
        '<ul class="ce-problems">' + problems.map(function (p) {
          return '<li class="' + p.level + '"><button class="ce-goto" data-key="' + esc(p.key) + '" data-device="' + p.device + '">' +
            '<span class="ce-prob-txt">“' + esc(p.text) + '”</span><span class="ce-prob-msg">' + esc(p.msg) + '</span></button></li>';
        }).join('') + '</ul>' +
        '<div class="ce-modal-foot"><button class="ce-btn-ghost" id="ce-m-back">Go back and edit</button>' +
        '<button class="btn-primary" id="ce-m-go">Publish anyway</button></div>';
      openModal(body);
      $('ce-m-back').addEventListener('click', closeModal);
      $('ce-m-go').addEventListener('click', publish);
      document.querySelectorAll('.ce-goto').forEach(function (b) {
        b.addEventListener('click', function () {
          closeModal();
          var dev = document.querySelector('.ce-device[data-device="' + b.dataset.device + '"]');
          if (dev) dev.click();
          setTimeout(function () {
            var el = Array.prototype.find.call(state.api.elements(b.dataset.key), function (x) { return !x.closest('[aria-hidden="true"]'); });
            if (el) activate(el);
          }, 120);
        });
      });
    }).catch(function (err) {
      console.error(err);
      publish();   // the check is advisory; never block publishing on it
    });
  }

  function checkAllDevices() {
    var keys = Object.keys(state.drafts);
    var devs = Object.keys(DEVICES);
    return devs.reduce(function (p, dev) {
      return p.then(function (acc) {
        return measureIn(dev, keys).then(function (list) { return acc.concat(list); });
      });
    }, Promise.resolve([])).then(function (all) {
      return all.filter(function (x) { return x.level !== 'info'; });
    });
  }

  function measureIn(dev, keys) {
    var width = DEVICES[dev];
    return new Promise(function (resolve, reject) {
      var f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.name = 'nithya-edit';
      f.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + width + 'px;height:900px;border:0;visibility:hidden';
      var timer = setTimeout(function () { cleanup(); reject(new Error('layout check timed out')); }, 15000);
      function cleanup() { clearTimeout(timer); window.removeEventListener('message', onMsg); f.remove(); }
      function onMsg(e) {
        if (e.source !== f.contentWindow || !e.data || e.data.type !== 'nithya-edit-ready') return;
        var doc = f.contentDocument, api = f.contentWindow.NithyaContent;
        (doc.fonts ? doc.fonts.ready : Promise.resolve()).then(function () {
          var out = [];
          var bases = {};
          keys.forEach(function (k) {
            var el = firstEl(api, k);
            if (el) bases[k] = baseFor(el, api.originals[k]);
          });
          keys.forEach(function (k) {
            api.elements(k).forEach(function (x) { x.innerHTML = state.drafts[k]; });
          });
          keys.forEach(function (k) {
            var el = firstEl(api, k);
            if (!el) return;
            issuesFor(el, k, bases[k], dev).forEach(function (i) {
              out.push({ key: k, text: truncate(textOf(state.drafts[k]), 60), msg: i.msg, level: i.level });
            });
          });
          cleanup();
          resolve(out);
        });
      }
      window.addEventListener('message', onMsg);
      f.src = PAGES[state.page].file + '?nithya-edit=1';
      document.body.appendChild(f);
    });
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function publish() {
    openModal('<h3>Publishing…</h3><div class="ce-spin"></div>');
    var user = getUser && getUser();
    var email = user && user.email || null;
    var now = new Date().toISOString();
    var upserts = [], deletes = [];
    Object.keys(state.drafts).forEach(function (k) {
      var html = state.drafts[k];
      if (html === original(k)) { if (state.published[k]) deletes.push(k); }
      else upserts.push({ key: k, page: state.page, html: html, updated_at: now, updated_by: email });
    });
    var imgUpserts = [], imgDeletes = [];
    Object.keys(state.imgDrafts).forEach(function (k) {
      var d = state.imgDrafts[k];
      if (!d) { if (state.imgPublished[k]) imgDeletes.push(k); }
      else imgUpserts.push({ key: k, page: state.page, url: d.url, alt: (d.alt || '').trim(),
                             pos: d.pos || '50% 50%', updated_at: now, updated_by: email });
    });
    var jobs = [];
    if (upserts.length) jobs.push(sb.from('nithya_site_content').upsert(upserts, { onConflict: 'key' }));
    if (deletes.length) jobs.push(sb.from('nithya_site_content').delete().in('key', deletes));
    if (imgUpserts.length) jobs.push(sb.from('nithya_site_images').upsert(imgUpserts, { onConflict: 'key' }));
    if (imgDeletes.length) jobs.push(sb.from('nithya_site_images').delete().in('key', imgDeletes));
    Promise.all(jobs).then(function (results) {
      var bad = results.find(function (r) { return r.error; });
      if (bad) throw bad.error;
      upserts.forEach(function (r) { state.published[r.key] = r; });
      deletes.forEach(function (k) { delete state.published[k]; });
      imgUpserts.forEach(function (r) {
        var d = state.imgDrafts[r.key];
        state.imgPublished[r.key] = Object.assign({}, r, { preview: d && d.preview, w: d && d.w, h: d && d.h });
      });
      imgDeletes.forEach(function (k) { delete state.imgPublished[k]; });
      var n = upserts.length + deletes.length + imgUpserts.length + imgDeletes.length;
      state.drafts = {};
      state.imgDrafts = {};
      markChanged();
      refreshUI();
      renderField();
      openModal('<div class="ce-done">✓</div><h3>Published</h3>' +
        '<p class="ce-modal-sub">' + n + ' change' + (n === 1 ? ' is' : 's are') + ' now live on the ' + esc(PAGES[state.page].label) + ' page.</p>' +
        '<div class="ce-modal-foot"><a class="ce-btn-ghost" href="' + PAGES[state.page].file + '" target="_blank" rel="noopener">View page ↗</a>' +
        '<button class="btn-primary" id="ce-m-ok">Done</button></div>');
      $('ce-m-ok').addEventListener('click', closeModal);
    }).catch(function (err) {
      console.error(err);
      openModal('<h3>Couldn’t publish</h3><p class="ce-modal-sub">' +
        (err && (err.code === '42501' || /row-level security/i.test(err.message || ''))
          ? 'Your account isn’t allowed to change website text. Ask an admin to check your access.'
          : 'Something went wrong. Your changes are still here — please try again.') +
        '</p><div class="ce-modal-foot"><button class="btn-primary" id="ce-m-ok">OK</button></div>');
      $('ce-m-ok').addEventListener('click', closeModal);
    });
  }

  /* ── Modal & toast ──────────────────────────── */
  function openModal(html) { $('ce-modal-box').innerHTML = html; $('ce-modal').classList.add('vis'); }
  function closeModal() { $('ce-modal').classList.remove('vis'); }

  function toast(msg) {
    var t = $('ce-toast');
    t.textContent = msg;
    t.classList.add('vis');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('vis'); }, 3200);
  }

  window.NithyaContentEditor = { init: init };
})();
