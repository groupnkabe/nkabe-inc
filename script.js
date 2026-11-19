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
  const refreshInventoryGroups = () => {
    if (!inventoryContainer) return;
    const groups = [...inventoryContainer.querySelectorAll('[data-inventory-group]')];
    groups.forEach((group, index) => {
      const number = index + 1;
      const legend = group.querySelector('legend');
      if (legend) legend.textContent = `Computer group ${number}`;
      group.querySelectorAll('input, select, textarea').forEach((field) => {
        const labelText = field.closest('label')?.querySelector('span')?.textContent.trim()
          .replace(/\s*\(.*?\)\s*/g, '');
        if (labelText) field.name = `Inventory ${number} - ${labelText}`;
      });
      const remove = group.querySelector('[data-remove-inventory]');
      if (remove) remove.hidden = groups.length === 1;
    });
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
  const supabaseUrl = typeof config.supabaseUrl === 'string' ? config.supabaseUrl.trim().replace(/\/$/, '') : '';
  const supabaseAnonKey = typeof config.supabaseAnonKey === 'string' ? config.supabaseAnonKey.trim() : '';

  const value = (data, key) => {
    const item = data.get(key);
    return typeof item === 'string' ? item.trim() : '';
  };

  const buildPayload = (form) => {
    const data = new FormData(form);
    const formType = form.dataset.contactForm === 'pilot' ? 'pilot' : 'contact';

    if (formType === 'contact') {
      return {
        form_type: 'contact',
        name: value(data, 'name'),
        email: value(data, 'email'),
        organisation: value(data, 'organization'),
        message: value(data, 'message'),
        website: value(data, 'botcheck')
      };
    }

    const computerGroups = [...form.querySelectorAll('[data-inventory-group]')].map((group) => {
      const fields = {};
      group.querySelectorAll('input, select, textarea').forEach((field) => {
        const label = field.closest('label')?.querySelector('span')?.textContent.trim()
          .replace(/\s*\(.*?\)\s*/g, '');
        if (label) fields[label] = field.value.trim();
      });
      return {
        computer_type: fields['Computer type'] || '',
        quantity: Number(fields['Quantity'] || 0),
        manufacturer_model: fields['Manufacturer and model'] || '',
        processor: fields['Processor'] || '',
        ram: fields['Memory'] || '',
        storage: fields['Storage'] || '',
        operating_system: fields['Operating system'] || '',
        approximate_age: fields['Approximate age'] || '',
        condition: fields['Physical / working condition'] || ''
      };
    });

    return {
      form_type: 'pilot',
      contact_name: value(data, 'Contact name'),
      contact_email: value(data, 'Email'),
      phone_or_whatsapp: value(data, 'Phone or WhatsApp'),
      contact_role: value(data, 'Contact role'),
      organisation_name: value(data, 'Organisation'),
      organisation_type: value(data, 'Organisation type'),
      organisation_website: value(data, 'Organisation website'),
      town_city: value(data, 'Town or city'),
      region_state: value(data, 'Region or state'),
      country: value(data, 'Country'),
      capabilities: [...form.querySelectorAll('input[name="Capabilities to explore"]:checked')].map((input) => input.value),
      use_case: value(data, 'Computing needs and use case'),
      computer_groups: computerGroups,
      existing_inventory_link: value(data, 'Existing inventory link'),
      local_network: value(data, 'Local network'),
      internet_connectivity: value(data, 'Internet connectivity'),
      networking_equipment: value(data, 'Networking equipment'),
      computer_room_or_lab: value(data, 'Computer room or lab'),
      electricity_reliability: value(data, 'Electricity reliability'),
      backup_power: value(data, 'Backup power'),
      it_support_arrangement: value(data, 'IT support arrangement'),
      additional_information: value(data, 'Additional information'),
      contact_permission: form.querySelector('input[name="Contact permission"]')?.checked === true,
      website: value(data, 'botcheck')
    };
  };

  document.querySelectorAll('[data-contact-form]').forEach((form) => {
    const status = form.querySelector('[role="status"]');
    const submit = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (!supabaseUrl || !supabaseAnonKey) {
        if (status) status.textContent = 'This form is temporarily unavailable. Please contact Nkabe directly.';
        return;
      }

      if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
      if (status) status.textContent = 'Submitting securely…';

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/submit-website-form`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify(buildPayload(form))
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Submission failed');
        }

        form.reset();
        if (status) {
          status.textContent = form.dataset.contactForm === 'pilot'
            ? 'Thank you — your expression of interest has been received. We’ll review it and be in touch if there is a suitable next step.'
            : 'Thank you — your message has been received. The Nkabe team will review it.';
        }
        if (inventoryContainer) {
          const groups = [...inventoryContainer.querySelectorAll('[data-inventory-group]')];
          groups.slice(1).forEach((group) => group.remove());
          refreshInventoryGroups();
        }
      } catch (error) {
        if (status) status.textContent = 'Sorry, we could not submit your information. Please try again or contact Nkabe directly.';
      } finally {
        if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
      }
    });
  });
})();
