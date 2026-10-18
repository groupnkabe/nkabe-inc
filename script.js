(() => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.primary-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
      nav.classList.toggle('open', !isOpen);
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      nav.classList.remove('open');
    }));
  }
  const year = document.querySelector('#year');
  if (year) year.textContent = String(new Date().getFullYear());
  const config = window.NKABE_SITE_CONFIG || {};
  const contactButton = document.querySelector('#contact-button');
  const contactNote = document.querySelector('#contact-note');
  const contactDetails = document.querySelector('#contact-details');
  const email = typeof config.publicContactEmail === 'string' ? config.publicContactEmail.trim() : '';
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    contactButton.href = `mailto:${email}?subject=${encodeURIComponent('nKABE OS — pilot or partnership enquiry')}`;
    contactButton.removeAttribute('aria-describedby');
    contactNote.textContent = 'Opens your email app — your message goes straight to our inbox.';
    contactDetails.textContent = 'For pilot, partnership and investor enquiries, use the button above; it opens your email app addressed to us directly.';
  } else {
    contactButton.href = '#contact-details';
    contactButton.setAttribute('aria-describedby', 'contact-note');
    contactNote.textContent = 'Public contact email to be added before launch.';
    contactDetails.textContent = 'This temporary build does not publish an unverified email address. Add the monitored public inbox in site-config.js before the site is shared widely.';
  }
})();
