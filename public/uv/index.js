// Wait for the DOM to load
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('uv-form');
  const addressInput = document.getElementById('uv-address');

  // Handle form submission
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    let url = addressInput.value.trim();
    if (!url) return;

    // Prepend protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }

    // Encode the URL using Ultraviolet's encoder
    const encodedUrl = __uv$config.encodeUrl(url);

    // Redirect to the proxied URL
    window.location.href = __uv$config.prefix + encodedUrl;
  });

  // Register the service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/uv/uv.sw.js', { scope: '/uv/service/' })
      .then(() => {
        console.log('Ultraviolet service worker registered.');
      })
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });
  }
});
