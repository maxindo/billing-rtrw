/* Emerald Green ISP — Dashboard V2 progressive enhancement */
(function () {
  'use strict';

  function enhanceDashboard() {
    if (!document.body || !document.body.classList.contains('customer-dashboard-v2')) return;

    var promo = document.getElementById('promoCarousel');
    var actions = document.querySelector('.action-grid');

    // On phones, service status + billing + quick actions become the primary viewport.
    // Promo remains available, but is demoted below quick actions.
    if (window.matchMedia('(max-width: 767px)').matches && promo && actions && actions.parentNode) {
      promo.classList.add('dashboard-promo-secondary');
      actions.insertAdjacentElement('afterend', promo);
    }

    var billCard = document.querySelector('.bill-hero-card');
    if (billCard) billCard.setAttribute('aria-label', 'Ringkasan tagihan pelanggan');

    document.querySelectorAll('.action-item').forEach(function (item) {
      item.setAttribute('role', item.tagName === 'A' ? 'link' : 'button');
      if (!item.hasAttribute('tabindex') && item.tagName !== 'A') item.setAttribute('tabindex', '0');
      if (item.tagName !== 'A') {
        item.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            item.click();
          }
        });
      }
    });

    var billing = document.getElementById('billing-section');
    var ticket = document.getElementById('ticket-section');
    if (billing) billing.setAttribute('aria-label', 'Tagihan dan riwayat pembayaran');
    if (ticket) ticket.setAttribute('aria-label', 'Tiket keluhan dan bantuan');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceDashboard, { once: true });
  } else {
    enhanceDashboard();
  }
})();
