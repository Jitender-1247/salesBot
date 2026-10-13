(function () {
  // Get product ID from script tag
  const script = document.currentScript;
  const productId = script.getAttribute('data-product-id');
  const serverUrl = script.getAttribute('data-server') || (window.location.origin.includes('localhost') ? 'http://localhost:5000' : window.location.origin);
  const widgetUrl = script.getAttribute('data-widget-url') || (window.location.origin.includes('localhost') ? 'http://localhost:5175' : `${serverUrl}/widget2`);

  if (!productId) {
    console.error('SalesBot Chat: data-product-id is required');
    return;
  }

  // Prevent double injection
  if (document.getElementById('salesbot-chat-widget')) return;

  // Create floating button
  const button = document.createElement('div');
  button.id = 'salesbot-chat-button';
  button.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:10px;height:10px;background:#10b981;border-radius:50%;animation:salesbot-pulse 2s infinite;"></div>
      <span>💬 Chat with Sofia</span>
    </div>
  `;
  button.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: white;
    padding: 14px 20px;
    border-radius: 50px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 24px rgba(124,58,237,0.45);
    z-index: 99998;
    transition: transform 0.2s, box-shadow 0.2s;
    user-select: none;
  `;

  button.onmouseenter = () => {
    button.style.transform = 'scale(1.05)';
    button.style.boxShadow = '0 8px 32px rgba(124,58,237,0.55)';
  };
  button.onmouseleave = () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 24px rgba(124,58,237,0.45)';
  };

  // Create iframe with microphone permission
  const iframe = document.createElement('iframe');
  iframe.id = 'salesbot-chat-widget';
  iframe.src = `${widgetUrl}/?pid=${productId}`;
  iframe.allow = 'microphone; camera; autoplay; display-capture';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = `
    display: none;
    position: fixed;
    bottom: 90px;
    right: 24px;
    width: 420px;
    height: 640px;
    border: none;
    border-radius: 24px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.35);
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
    @media (max-width: 480px) {
      #salesbot-chat-widget {
        bottom: 0 !important;
        right: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0 !important;
      }
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
          <div style="width:10px;height:10px;background:#10b981;border-radius:50%;animation:salesbot-pulse 2s infinite;"></div>
          <span>💬 Chat with Sofia</span>
        </div>
      `;
    }
  };

  // Inject into page
  document.body.appendChild(button);
  document.body.appendChild(iframe);

  console.log('SalesBot 1-on-1 Avatar Chat widget loaded for product:', productId);
})();
