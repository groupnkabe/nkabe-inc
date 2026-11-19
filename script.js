(() => {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.primary-nav');
  const closeNav = () => {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    nav.classList.remove('open');
  };
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
      nav.classList.toggle('open', !isOpen);
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNav(); });
    document.addEventListener('click', (event) => {
      if (toggle.getAttribute('aria-expanded') === 'true' && !nav.contains(event.target) && !toggle.contains(event.target)) closeNav();
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 680) closeNav(); });
  }

  // Repeatable inventory groups: one row represents one similar set of computers.
  const inventoryContainer = document.querySelector('#inventory-groups');
  const addInventoryButton = document.querySelector('#add-inventory');
  let inventoryCount = inventoryContainer ? inventoryContainer.querySelectorAll('[data-inventory-group]').length : 0;
  const renumberInventoryGroup = (group, number) => {
    const legend = group.querySelector('legend');
    if (legend) legend.textContent = `Computer group ${number}`;
    group.querySelectorAll('input, select, textarea').forEach((field) => {
      const label = field.closest('label');
      const labelText = label ? label.querySelector('span')?.textContent.trim() : '';
      if (labelText) field.name = `Inventory ${number} - ${labelText.replace(/\\s*\\(.*?\\)\\s*/g, '')}`;
    });
    const remove = group.querySelector('[data-remove-inventory]');
    if (remove) remove.hidden = number === 1 && inventoryContainer.children.length === 1;
  };
  const refreshInventoryGroups = () => {
    if (!inventoryContainer) return;
    const groups = [...inventoryContainer.querySelectorAll('[data-inventory-group]')];
    groups.forEach((group, index) => {
      const number = index + 1;
      const legend = group.querySelector('legend');
      if (legend) legend.textContent = `Computer group ${number}`;
      group.querySelectorAll('input, select, textarea').forEach((field) => {
        const label = field.closest('label');
        const labelText = label ? label.querySelector('span')?.textContent.trim().replace(/\\s*\\(.*?\\)\\s*/g, '') : '';
        if (labelText) field.name = `Inventory ${number} - ${labelText}`;
      });
      const remove = group.querySelector('[data-remove-inventory]');
      if (remove) remove.hidden = groups.length === 1;
    });
    inventoryCount = groups.length;
  };
  if (inventoryContainer && addInventoryButton) {
    inventoryContainer.querySelectorAll('[data-remove-inventory]').forEach((button) => {
      button.addEventListener('click', () => {
        button.closest('[data-inventory-group]')?.remove();
        refreshInventoryGroups();
      });
    });
    addInventoryButton.addEventListener('click', () => {
      const source = inventoryContainer.querySelector('[data-inventory-group]');
      if (!source) return;
      const clone = source.cloneNode(true);
      clone.querySelectorAll('input').forEach((field) => { field.value = ''; });
      clone.querySelectorAll('select').forEach((field) => { field.selectedIndex = 0; });
      const remove = clone.querySelector('[data-remove-inventory]');
      if (remove) {
        remove.hidden = false;
        remove.addEventListener('click', () => {
          clone.remove();
          refreshInventoryGroups();
        });
      }
      inventoryContainer.appendChild(clone);
      refreshInventoryGroups();
      clone.querySelector('select')?.focus();
    });
    refreshInventoryGroups();
  }

  const config = window.NKABE_SITE_CONFIG || {};
  const accessKey = typeof config.contactFormAccessKey === 'string' ? config.contactFormAccessKey.trim() : '';
  document.querySelectorAll('[data-contact-form]').forEach((form) => {
    const status = form.querySelector('[role="status"]');
    const submit = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!accessKey) { if (status) status.textContent = 'The form is not configured yet.'; return; }
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      data.append('access_key', accessKey);
      data.append('subject', form.dataset.formSubject || 'Nkabe website enquiry');
      data.append('from_name', 'Nkabe website');
      if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
      if (status) status.textContent = 'Sending…';
      try {
        const response = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.success) {
          form.reset();
          if (status) status.textContent = 'Thank you — your expression of interest has been received. We’ll review it and be in touch if there is a suitable next step.';
          if (inventoryContainer) {
            const groups = [...inventoryContainer.querySelectorAll('[data-inventory-group]')];
            groups.slice(1).forEach((group) => group.remove());
            refreshInventoryGroups();
          }
        } else if (status) status.textContent = result.message || 'Sorry, something went wrong. Please try again.';
      } catch (error) {
        if (status) status.textContent = 'Network error. Please try again.';
      } finally {
        if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
      }
    });
  });
})();