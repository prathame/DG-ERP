(function () {
  var slug = window.location.pathname.replace(/^\//, '').split('/')[0];
  var link = document.querySelector('link[rel="manifest"]');
  if (link && slug && slug !== 'admin' && slug !== 'privacy' && slug !== 'terms') {
    link.href = '/manifest.json?slug=' + encodeURIComponent(slug);
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
