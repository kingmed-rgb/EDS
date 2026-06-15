(function () {
  'use strict';

  const DEBUG_PARAM = 'analytics_debug';
  const DEBUG_STORAGE_KEY = 'edsAnalyticsDebug';
  const PURCHASE_DEDUPE_KEY = 'edsPurchaseCompletedTracked';

  function storageGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function storageSet(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch (error) {
      return false;
    }
    return true;
  }

  function isDebugEnabled() {
    const params = new URLSearchParams(window.location.search);
    return params.has(DEBUG_PARAM) || storageGet(window.localStorage, DEBUG_STORAGE_KEY) === 'true';
  }

  function debugLog(eventName, detail) {
    if (!isDebugEnabled()) return;
    console.info('[EDS Analytics]', eventName, detail);
  }

  function safeCall(name, callback) {
    try {
      callback();
      return true;
    } catch (error) {
      if (isDebugEnabled()) {
        console.warn(`[EDS Analytics] ${name} failed`, error);
      }
      return false;
    }
  }

  function buildPayload(extra) {
    return Object.assign({
      event_category: 'funnel',
      page_location: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title
    }, extra || {});
  }

  function trackEvent(eventName, extra) {
    const payload = buildPayload(extra);
    const sent = {
      ga4: false,
      meta: false,
      clarity: false
    };

    if (typeof window.gtag === 'function') {
      sent.ga4 = safeCall('GA4', function () {
        window.gtag('event', eventName, payload);
      });
    }

    if (typeof window.fbq === 'function') {
      sent.meta = safeCall('Meta Pixel', function () {
        window.fbq('trackCustom', eventName, payload);
      });
    }

    if (typeof window.clarity === 'function') {
      sent.clarity = safeCall('Microsoft Clarity', function () {
        window.clarity('event', eventName);
        window.clarity('set', 'last_funnel_event', eventName);
      });
    }

    debugLog(eventName, { payload, sent });
    document.dispatchEvent(new CustomEvent('eds:analytics', {
      detail: { eventName, payload, sent }
    }));

    return sent;
  }

  function trackPageView(extra) {
    return trackEvent('page_view', extra);
  }

  function trackQuizStarted(extra) {
    return trackEvent('quiz_started', extra);
  }

  function trackQuizCompleted(extra) {
    return trackEvent('quiz_completed', extra);
  }

  function trackEmailSubmitted(extra) {
    return trackEvent('email_submitted', extra);
  }

  function trackCheckoutStarted(extra) {
    return trackEvent('checkout_started', extra);
  }

  function trackPurchaseCompleted(extra) {
    return trackEvent('purchase_completed', extra);
  }

  function isEmailForm(form) {
    return Boolean(
      form.matches('[data-analytics-event="email_submitted"], .email-form, #emailForm') ||
      form.querySelector('input[type="email"]')
    );
  }

  function bindDelegatedEvents() {
    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !isEmailForm(form)) return;
      trackEmailSubmitted({
        form_id: form.id || '',
        form_name: form.getAttribute('name') || ''
      });
    }, true);

    document.addEventListener('click', function (event) {
      const checkoutLink = event.target.closest('[data-analytics-event="checkout_started"], a[href*="buy.stripe.com"]');
      if (!checkoutLink) return;
      trackCheckoutStarted({
        link_url: checkoutLink.href || '',
        link_text: checkoutLink.textContent.trim()
      });
    }, true);
  }

  function shouldAutoTrackPurchase() {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();
    return (
      /thank-you|thankyou|purchase-success|purchase-completed|order-complete|success/.test(path) ||
      params.get('purchase') === 'completed' ||
      params.get('purchase_completed') === 'true' ||
      params.get('checkout') === 'success' ||
      params.get('payment') === 'success' ||
      params.has('session_id')
    );
  }

  function autoTrackPurchaseCompleted() {
    if (!shouldAutoTrackPurchase()) return;

    const purchaseKey = window.location.href;
    if (storageGet(window.sessionStorage, PURCHASE_DEDUPE_KEY) === purchaseKey) return;
    storageSet(window.sessionStorage, PURCHASE_DEDUPE_KEY, purchaseKey);

    trackPurchaseCompleted({
      detection: 'url',
      session_id: new URLSearchParams(window.location.search).get('session_id') || ''
    });
  }

  window.EDSAnalytics = {
    trackEvent,
    trackPageView,
    trackQuizStarted,
    trackQuizCompleted,
    trackEmailSubmitted,
    trackCheckoutStarted,
    trackPurchaseCompleted
  };

  window.trackQuizStarted = trackQuizStarted;
  window.trackQuizCompleted = trackQuizCompleted;
  window.trackEmailSubmitted = trackEmailSubmitted;
  window.trackCheckoutStarted = trackCheckoutStarted;
  window.trackPurchaseCompleted = trackPurchaseCompleted;

  document.addEventListener('DOMContentLoaded', function () {
    trackPageView();
    bindDelegatedEvents();
    autoTrackPurchaseCompleted();
  });
})();
