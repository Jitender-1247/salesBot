(function () {
  const script = document.currentScript;
  const productId = script?.getAttribute('data-product-id') || 'test-product';
  const serverUrl = script?.getAttribute('data-server') || (window.location.origin.includes('localhost') ? 'http://localhost:5000' : window.location.origin);
  const widgetUrl = script?.getAttribute('data-widget-url') || (window.location.origin.includes('localhost') ? 'http://localhost:5176/widget3/' : `${serverUrl}/widget3/`);

  if (!productId) {
    console.warn('[VideoAgent] data-product-id is missing');
  }

  if (document.getElementById('salesassist-video-widget-frame')) return;

  const iframe = document.createElement('iframe');
  iframe.id = 'salesassist-video-widget-frame';
  iframe.src = `${widgetUrl}?pid=${productId}`;
  iframe.allow = 'microphone; camera; autoplay; display-capture';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    border: none;
    z-index: 999999;
    pointer-events: auto;
    background: transparent;
  `;

  document.body.appendChild(iframe);
})();
