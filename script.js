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
  const form = document.querySelector('#contact-form');
  const status = document.querySelector('#contact-status');
  const submit = document.querySelector('#contact-submit');
  if (form && status) {
    const accessKey = typeof config.contactFormAccessKey === 'string' ? config.contactFormAccessKey.trim() : '';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!accessKey) {
        status.textContent = 'The contact form is not configured yet.';
        return;
      }
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      data.append('access_key', accessKey);
      data.append('subject', 'nKABE OS — pilot or partnership enquiry');
      data.append('from_name', 'NKABE website');
      if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
      status.textContent = 'Sending…';
      try {
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          body: data,
          headers: { Accept: 'application/json' }
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.success) {
          form.reset();
          status.textContent = 'Thank you — your message has been sent. We’ll be in touch.';
        } else {
          status.textContent = 'Sorry, something went wrong. Please try again.';
        }
      } catch (error) {
        status.textContent = 'Network error. Please try again.';
      } finally {
        if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
      }
    });
  }
})();
