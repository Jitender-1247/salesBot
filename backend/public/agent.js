(function () {
  // Get product ID from script tag
  const script = document.currentScript;
  const productId = script.getAttribute('data-product-id');
  const serverUrl = script.getAttribute('data-server') || 'http://localhost:5000';
  const widgetUrl = script.getAttribute('data-widget-url') || 'http://localhost:5174';

  if (!productId) {
    console.error('SalesBot: data-product-id is required');
    return;
  }

  // Prevent double injection
  if (document.getElementById('salesbot-widget')) return;

  // Create floating button
  const button = document.createElement('div');
  button.id = 'salesbot-button';
  button.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:10px;height:10px;background:#22c55e;border-radius:50%;animation:salesbot-pulse 2s infinite;"></div>
      <span>Live Demo</span>
    </div>
  `;
  button.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #6366f1;
    color: white;
    padding: 14px 20px;
    border-radius: 50px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 24px rgba(99,102,241,0.4);
    z-index: 99998;
    transition: transform 0.2s, box-shadow 0.2s;
    user-select: none;
  `;

  button.onmouseenter = () => {
    button.style.transform = 'scale(1.05)';
    button.style.boxShadow = '0 8px 32px rgba(99,102,241,0.5)';
  };
  button.onmouseleave = () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 24px rgba(99,102,241,0.4)';
  };

  // Create iframe with microphone permission — uses configurable widget URL
  const iframe = document.createElement('iframe');
  iframe.id = 'salesbot-widget';
  iframe.src = `${widgetUrl}/?pid=${productId}`;
  iframe.allow = 'microphone; camera; autoplay; display-capture';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = `
    display: none;
    position: fixed;
    bottom: 90px;
    right: 24px;
    width: 400px;
    height: 620px;
    border: none;
    border-radius: 20px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.15);
    z-index: 99999;
    transition: opacity 0.3s, transform 0.3s;
    opacity: 0;
    transform: translateY(10px);
  `;

  // Add pulse animation
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes salesbot-pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);

  // Toggle widget
  let isOpen = false;
  button.onclick = () => {
    isOpen = !isOpen;
    if (isOpen) {
      iframe.style.display = 'block';
      setTimeout(() => {
        iframe.style.opacity = '1';
        iframe.style.transform = 'translateY(0)';
      }, 10);
      button.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span>✕ Close</span>
        </div>
      `;
    } else {
      iframe.style.opacity = '0';
      iframe.style.transform = 'translateY(10px)';
      setTimeout(() => { iframe.style.display = 'none'; }, 300);
      button.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:10px;height:10px;background:#22c55e;border-radius:50%;animation:salesbot-pulse 2s infinite;"></div>
          <span>Live Demo</span>
        </div>
      `;
    }
  };

  // Inject into page
  document.body.appendChild(button);
  document.body.appendChild(iframe);

  console.log('SalesBot widget loaded for product:', productId);
})();