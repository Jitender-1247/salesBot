/**
 * AI Video Agent — embed loader (widget3)
 *
 *   <script src="https://YOUR-SERVER/widget3.js" data-product-id="PRODUCT_ID" async></script>
 *
 * Optional: data-server (API origin, defaults to this script's origin),
 *           data-widget-url (widget origin+path, defaults to <server>/widget3/).
 *
 * The widget runs in an iframe. This loader resizes it between the floating bubble and the
 * full-screen consultation, and runs the proactive nudges ("Strike") that need the host page:
 * time on page, scroll depth, exit intent and URL rules.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var productId = script.getAttribute('data-product-id');
  if (!productId) {
    console.error('AI Video Agent: data-product-id is required');
    return;
  }
  if (document.getElementById('ai-video-agent-frame')) return;

  var server = (script.getAttribute('data-server') || new URL(script.src).origin).replace(/\/$/, '');
  var widgetUrl = (script.getAttribute('data-widget-url') || server + '/widget3/').replace(/\/?$/, '/');
  var widgetOrigin = new URL(widgetUrl, location.href).origin;

  var BUBBLE_STYLE = 'position:fixed;right:0;bottom:0;width:380px;max-width:100vw;height:200px;border:0;background:transparent;z-index:2147483646;color-scheme:normal;';
  var OPEN_STYLE = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;background:transparent;z-index:2147483646;color-scheme:normal;';

  var iframe = document.createElement('iframe');
  iframe.id = 'ai-video-agent-frame';
  iframe.title = 'AI video sales agent';
  iframe.allow = 'microphone; camera; autoplay; display-capture; clipboard-write';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = BUBBLE_STYLE;
  iframe.src = widgetUrl + '?pid=' + encodeURIComponent(productId) + '&embed=1';

  var frameReady = false;
  var queued = [];
  var isOpen = false;
  var fired = {};

  function post(msg) {
    msg.source = 'ai-video-agent-host';
    if (!frameReady) { queued.push(msg); return; }
    iframe.contentWindow.postMessage(msg, widgetOrigin);
  }

  function nudge(key, message, autoOpen) {
    if (fired[key] || isOpen || !message) return;
    fired[key] = true;
    post({ type: 'nudge', trigger: key, message: message, autoOpen: Boolean(autoOpen) });
  }

  // ── On-site guidance: the agent can scroll to, highlight and open pages on THIS site ──

  function clean(text, max) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function isShown(el) {
    var r = el.getBoundingClientRect();
    var s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  /** Compact outline of the visitor's current page for the agent (no form values, nothing hidden). */
  function pageContext() {
    var seen = {};
    var headings = [], links = [], buttons = [];
    document.querySelectorAll('h1, h2, h3').forEach(function (h) {
      var t = clean(h.innerText, 80);
      if (t && headings.length < 25 && !seen['h' + t] && isShown(h)) { seen['h' + t] = 1; headings.push(t); }
    });
    document.querySelectorAll('a[href]').forEach(function (a) {
      if (links.length >= 40 || a === iframe) return;
      var url;
      try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
      var t = clean(a.innerText || a.getAttribute('aria-label'), 60);
      var href = url.pathname + url.search;
      if (!t || seen['l' + t + href] || !isShown(a)) return;
      seen['l' + t + href] = 1;
      links.push({ text: t, href: href });
    });
    document.querySelectorAll('button, [role="button"]').forEach(function (b) {
      var t = clean(b.innerText || b.getAttribute('aria-label'), 50);
      if (t && buttons.length < 20 && !seen['b' + t] && isShown(b)) { seen['b' + t] = 1; buttons.push(t); }
    });
    return { url: location.href, origin: location.origin, title: clean(document.title, 120), headings: headings, links: links, buttons: buttons };
  }

  /** Best on-page match for what the agent named: exact text first, then partial; headings and controls only. */
  function findTarget(text) {
    var want = clean(text, 120).toLowerCase();
    if (!want) return null;
    var nodes = document.querySelectorAll('h1, h2, h3, h4, section[aria-label], a, button, [role="button"], label, summary, [id]');
    var partial = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el === iframe || !isShown(el)) continue;
      var t = clean(el.innerText || el.getAttribute('aria-label') || '', 200).toLowerCase();
      if (!t) continue;
      if (t === want) return el;
      if (!partial && t.length <= 200 && t.indexOf(want) !== -1) partial = el;
    }
    return partial;
  }

  var ring = null;
  function highlight(el) {
    if (!ring) {
      ring = document.createElement('div');
      ring.setAttribute('aria-hidden', 'true');
      ring.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;border:3px solid #8b5cf6;border-radius:10px;' +
        'box-shadow:0 0 0 6px rgba(139,92,246,.25),0 0 24px rgba(139,92,246,.45);transition:opacity .3s;opacity:0;';
      document.body.appendChild(ring);
    }
    var until = Date.now() + 4000;
    (function follow() {
      var r = el.getBoundingClientRect();
      ring.style.left = (r.left - 6) + 'px';
      ring.style.top = (r.top - 6) + 'px';
      ring.style.width = (r.width + 12) + 'px';
      ring.style.height = (r.height + 12) + 'px';
      ring.style.opacity = '1';
      if (Date.now() < until) requestAnimationFrame(follow);
      else ring.style.opacity = '0';
    })();
  }

  function runAction(action) {
    var kind = action && action.kind;
    if (kind === 'open_page') {
      var url;
      try { url = new URL(action.target, location.href); } catch (err) { return { ok: false, error: 'invalid URL' }; }
      // Only ever navigate within the merchant's own site
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return { ok: false, error: 'other site' };
      post({ type: 'navigating', url: url.href });
      setTimeout(function () { location.href = url.href; }, 250);
      return { ok: true };
    }
    var el = findTarget(action && action.target);
    if (!el) return { ok: false, error: 'not found on page' };
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (kind === 'highlight' || kind === 'scroll_to') highlight(el);
    return { ok: true };
  }

  // Keep the agent's view of the page current (SPA route changes included)
  var lastContextUrl = '';
  function sendContext(force) {
    if (!force && location.href === lastContextUrl) return;
    lastContextUrl = location.href;
    post({ type: 'page-context', context: pageContext() });
  }
  setInterval(function () { sendContext(false); }, 1500);

  window.addEventListener('message', function (e) {
    if (e.source !== iframe.contentWindow || e.origin !== widgetOrigin) return;
    var data = e.data || {};
    if (data.source !== 'ai-video-agent') return;

    if (data.type === 'ready') {
      frameReady = true;
      queued.splice(0).forEach(post);
    } else if (data.type === 'request-page-context') {
      sendContext(true);
    } else if (data.type === 'host-action') {
      var result = runAction(data.action);
      post({ type: 'host-action-result', id: data.action && data.action.id, result: result });
    } else if (data.type === 'state') {
      // 'open' = full-screen consultation, 'bubble' = bubble + tooltip, 'compact' = bubble only
      isOpen = data.state === 'open';
      iframe.style.cssText = isOpen ? OPEN_STYLE
        : data.state === 'compact' ? BUBBLE_STYLE + 'width:130px;height:130px;'
        : BUBBLE_STYLE;
    }
  });

  function setupNudges(cfg) {
    var n = cfg && cfg.nudges;
    if (!n || !n.enabled) return;

    // URL rules (checked on load and on SPA navigation)
    var lastUrl = '';
    function checkUrl() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      (n.urlRules || []).forEach(function (rule, i) {
        if (rule.urlContains && location.href.indexOf(rule.urlContains) !== -1) {
          nudge('url:' + i + ':' + location.pathname, rule.message, false);
        }
      });
    }
    checkUrl();
    setInterval(checkUrl, 1000);

    // Time on page
    setTimeout(function () { nudge('time', n.message, n.autoOpen); }, Math.max(0, n.delaySeconds || 0) * 1000);

    // Scroll depth
    if (n.scrollPercent > 0) {
      window.addEventListener('scroll', function onScroll() {
        var doc = document.documentElement;
        var depth = (window.scrollY + window.innerHeight) / Math.max(1, doc.scrollHeight) * 100;
        if (depth >= n.scrollPercent) {
          window.removeEventListener('scroll', onScroll);
          nudge('scroll', n.message, n.autoOpen);
        }
      }, { passive: true });
    }

    // Exit intent (desktop: pointer leaves through the top of the viewport), once per browser session
    if (n.exitIntent) {
      document.addEventListener('mouseout', function onOut(e) {
        if (e.relatedTarget || e.clientY > 0) return;
        var seen = false;
        try { seen = sessionStorage.getItem('ai-video-agent-exit') === '1'; } catch (err) { /* storage blocked */ }
        if (seen) return;
        try { sessionStorage.setItem('ai-video-agent-exit', '1'); } catch (err) { /* storage blocked */ }
        document.removeEventListener('mouseout', onOut);
        nudge('exit', n.exitMessage, true);
      });
    }
  }

  function mount() {
    document.body.appendChild(iframe);
    fetch(server + '/api/embed/' + encodeURIComponent(productId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(setupNudges)
      .catch(function () { /* widget still works without nudges */ });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
