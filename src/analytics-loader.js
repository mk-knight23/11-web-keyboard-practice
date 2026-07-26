/**
 * GTM/GA4 bootstrap — moved out of the inline <head> script so the CSP
 * script-src no longer needs 'unsafe-inline' (see docs/v3/CSP_NOTES.md).
 * Vite statically replaces import.meta.env.VITE_GTM_ID / VITE_GA4_ID at
 * build time; when the env vars are unset the values are undefined and
 * nothing is loaded. See docs/ANALYTICS.md for the activation policy.
 */

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;
const GA4_ID_PATTERN = /^G-[A-Z0-9]+$/;

function loadScript(src) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function initAnalyticsLoader() {
  const gtmId = import.meta.env.VITE_GTM_ID;
  if (typeof gtmId === 'string' && GTM_ID_PATTERN.test(gtmId)) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    loadScript('https://www.googletagmanager.com/gtm.js?id=' + gtmId);
  }

  const ga4Id = import.meta.env.VITE_GA4_ID;
  if (typeof ga4Id === 'string' && GA4_ID_PATTERN.test(ga4Id)) {
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + ga4Id);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // GA4 requires the live `arguments` object to be pushed, not an array.
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', ga4Id, { anonymize_ip: true });
  }
}
