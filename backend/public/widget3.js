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

  window.addEventListener('message', function (e) {
    if (e.source !== iframe.contentWindow || e.origin !== widgetOrigin) return;
    var data = e.data || {};
    if (data.source !== 'ai-video-agent') return;

    if (data.type === 'ready') {
      frameReady = true;
      queued.splice(0).forEach(post);
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
