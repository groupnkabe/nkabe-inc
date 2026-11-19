import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.86.0/+esm';

const config = window.NKABE_SITE_CONFIG || {};
const supabaseUrl = (config.supabaseUrl || '').trim();
const publishableKey = (config.supabaseAnonKey || '').trim();
const supabase = createClient(supabaseUrl, publishableKey);

const $ = (selector) => document.querySelector(selector);
const state = { user: null, profile: null, contacts: [], pilots: [], messages: [], active: null, view: 'overview', recoveryMode: false };
const contactStatuses = ['new', 'reviewing', 'replied', 'closed'];
const pilotStatuses = ['new', 'reviewing', 'needs_information', 'technically_assessed', 'suitable', 'not_suitable', 'pilot_discussion', 'closed'];

const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pretty = (value = '') => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)) : '—';
const toast = (message) => { const el = $('#global-status'); el.textContent = message; el.classList.add('show'); window.setTimeout(() => el.classList.remove('show'), 3200); };
const person = (record, kind) => kind === 'contact' ? record.name : record.contact_name;
const email = (record, kind) => kind === 'contact' ? record.email : record.contact_email;
const org = (record, kind) => kind === 'contact' ? record.organisation : record.organisation_name;
const submitted = (record) => record.submitted_at;
const statusOptions = (kind) => kind === 'contact' ? contactStatuses : pilotStatuses;

function showLogin(message = '') {
  document.body.classList.add('admin-logged-out');
  $('.admin-sidebar').hidden = true;
  $('.admin-topbar').hidden = true;
  $('.admin-footer').hidden = true;
  $('#login-view').hidden = false;
  $('#workspace-view').hidden = true;
  $('#login-panel').hidden = state.recoveryMode;
  $('#password-reset-panel').hidden = !state.recoveryMode;
  $('#login-status').textContent = message;
}
function showWorkspace() {
  document.body.classList.remove('admin-logged-out');
  $('.admin-sidebar').hidden = false;
  $('.admin-topbar').hidden = false;
  $('.admin-footer').hidden = false;
  $('#login-view').hidden = true;
  $('#workspace-view').hidden = false;
  $('#user-email').textContent = state.user?.email || 'Staff';
  $('#user-avatar').textContent = (state.user?.email || 'N').slice(0,1).toUpperCase();
  $('#user-role').textContent = state.profile?.role || 'Staff';
}
function allRecords() {
  return [
    ...state.contacts.map((record) => ({ ...record, kind:'contact' })),
    ...state.pilots.map((record) => ({ ...record, kind:'pilot' }))
  ].sort((a,b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}
function recordByKey(key) {
  const [kind,id] = key.split(':');
  return (kind === 'contact' ? state.contacts : state.pilots).find((item) => item.id === id);
}
function keyOf(item) { return item.kind + ':' + item.id; }

async function loadData() {
  const [contacts,pilots] = await Promise.all([
    supabase.from('contact_messages').select('*').order('submitted_at',{ascending:false}),
    supabase.from('pilot_applications').select('*').order('submitted_at',{ascending:false})
  ]);
  if (contacts.error) throw contacts.error;
  if (pilots.error) throw pilots.error;
  state.contacts = contacts.data || [];
  state.pilots = pilots.data || [];
  const { data: messages, error } = await supabase.from('admin_conversation_messages').select('*').order('created_at',{ascending:true});
  if (error) throw error;
  state.messages = messages || [];
  renderOverview();
  if (state.view !== 'overview') renderInbox();
  if (state.active) renderDetail(state.active);
}
function renderOverview() {
  const newContacts = state.contacts.filter((x) => x.status === 'new').length;
  const newPilots = state.pilots.filter((x) => x.status === 'new').length;
  const reviewing = [...state.contacts,...state.pilots].filter((x) => x.status === 'reviewing').length;
  $('#stat-new-contacts').textContent = newContacts;
  $('#stat-pilots').textContent = state.pilots.length;
  $('#stat-new-pilots').textContent = newPilots + ' new applications';
  $('#stat-reviewing').textContent = reviewing;
  $('#stat-replies').textContent = state.messages.filter((x) => x.message_type === 'outbound').length;
  const recent = allRecords().slice(0,6);
  $('#recent-list').innerHTML = recent.length ? recent.map(listRow).join('') : '<p class="admin-empty">No submissions have arrived yet.</p>';
  $('#recent-list').querySelectorAll('[data-record]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.record)));
}
function listRow(item) {
  const key = keyOf(item);
  return `<button class="admin-list-row" type="button" data-record="${escapeHtml(key)}">
    <span class="admin-list-primary"><strong>${escapeHtml(person(item,item.kind))}</strong><small>${escapeHtml(org(item,item.kind) || email(item,item.kind))} · <span class="admin-kind">${item.kind === 'pilot' ? 'Pilot' : 'Contact'}</span></small></span>
    <span class="admin-list-meta"><time class="admin-list-date">${escapeHtml(dateLabel(submitted(item)))}</time><span class="admin-status ${escapeHtml(item.status)}">${escapeHtml(pretty(item.status))}</span></span>
  </button>`;
}
function setView(view) {
  state.view = view;
  document.querySelectorAll('.admin-nav-item').forEach((button) => button.classList.toggle('active',button.dataset.view === view));
  $('#overview-view').hidden = view !== 'overview';
  $('#inbox-view').hidden = view === 'overview';
  $('#page-title').textContent = view === 'overview' ? 'Overview' : view === 'contacts' ? 'Contact enquiries' : view === 'pilots' ? 'Pilot applications' : 'All conversations';
  $('#inbox-heading').textContent = view === 'contacts' ? 'Contact enquiries' : view === 'pilots' ? 'Pilot applications' : 'All conversations';
  $('#inbox-overline').textContent = view === 'contacts' ? 'INCOMING MESSAGES' : view === 'pilots' ? 'PILOT PIPELINE' : 'RELATIONSHIP MANAGEMENT';
  $('#status-filter').value = '';
  $('#inbox-search').value = '';
  if (view !== 'overview') renderInbox();
}
function renderInbox() {
  const term = $('#inbox-search').value.trim().toLowerCase();
  const status = $('#status-filter').value;
  let items = allRecords();
  if (state.view === 'contacts') items = items.filter((x) => x.kind === 'contact');
  if (state.view === 'pilots') items = items.filter((x) => x.kind === 'pilot');
  if (status) items = items.filter((x) => x.status === status);
  if (term) items = items.filter((x) => [person(x,x.kind),email(x,x.kind),org(x,x.kind),x.message,x.use_case,x.town_city].some((v) => String(v || '').toLowerCase().includes(term)));
  $('#inbox-list').innerHTML = items.length ? items.map(listRow).join('') : '<p class="admin-empty">No matching records.</p>';
  $('#inbox-list').querySelectorAll('[data-record]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.record)));
  if (state.active) {
    const active = $('#inbox-list').querySelector('[data-record="' + CSS.escape(state.active) + '"]');
    if (active) active.classList.add('selected');
  }
}
async function openRecord(key) {
  state.active = key;
  if (state.view === 'overview') setView(key.startsWith('contact:') ? 'contacts' : 'pilots');
  renderInbox();
  await renderDetail(key);
  if (window.innerWidth < 760) $('#detail-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function renderDetail(key) {
  const [kind,id] = key.split(':');
  const record = recordByKey(key);
  if (!record) return;
  let inventory = [];
  if (kind === 'pilot') {
    const result = await supabase.from('pilot_computer_groups').select('*').eq('application_id',id).order('group_number');
    if (result.error) { toast('Could not load computer inventory.'); return; }
    inventory = result.data || [];
  }
  const thread = state.messages.filter((m) => kind === 'contact' ? m.contact_message_id === id : m.pilot_application_id === id);
  const statusOpts = statusOptions(kind).map((s) => `<option value="${s}" ${record.status === s ? 'selected' : ''}>${escapeHtml(pretty(s))}</option>`).join('');
  const fields = kind === 'contact'
    ? [
      ['Email',record.email],['Organisation',record.organisation],['Received',dateLabel(record.submitted_at)],['Original message',record.message,true]
    ]
    : [
      ['Contact',record.contact_name],['Email',record.contact_email],['Phone / WhatsApp',record.phone_or_whatsapp],['Role',record.contact_role],['Organisation',record.organisation_name],['Organisation type',record.organisation_type],['Location',[record.town_city,record.region_state,record.country].filter(Boolean).join(', ')],['Website',record.organisation_website],['Received',dateLabel(record.submitted_at)],['Capabilities',(record.capabilities || []).join(', ')],['Use case',record.use_case,true],['Inventory link',record.existing_inventory_link],['Local network',record.local_network],['Internet',record.internet_connectivity],['Networking equipment',record.networking_equipment],['Computer room / lab',record.computer_room_or_lab],['Electricity reliability',record.electricity_reliability],['Backup power',record.backup_power],['IT support',record.it_support_arrangement],['Additional information',record.additional_information,true]
    ];
  const fieldHtml = fields.filter(([,v]) => v !== null && v !== undefined && v !== '').map(([label,value,wide]) => `<div class="admin-info-item ${wide ? 'admin-info-wide' : ''}"><small>${escapeHtml(label)}</small><p>${label === 'Website' || label === 'Inventory link' ? (String(value).startsWith('http') ? '<a href="' + escapeHtml(value) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(value) + '</a>' : escapeHtml(value)) : escapeHtml(Array.isArray(value) ? value.join(', ') : value)}</p></div>`).join('');
  const inventoryHtml = inventory.length ? `<div class="admin-detail-section"><h4>Computer inventory · ${inventory.reduce((n,x)=>n + Number(x.quantity || 0),0)} computers</h4><div style="overflow-x:auto"><table class="admin-inventory"><thead><tr><th>Group</th><th>Quantity</th><th>Model</th><th>Processor</th><th>RAM</th><th>Storage</th><th>Operating system</th><th>Age</th><th>Condition</th></tr></thead><tbody>${inventory.map((x)=>`<tr><td>${escapeHtml(x.computer_type)}</td><td>${Number(x.quantity || 0)}</td><td>${escapeHtml(x.manufacturer_model)}</td><td>${escapeHtml(x.processor || '—')}</td><td>${escapeHtml(x.ram || '—')}</td><td>${escapeHtml(x.storage || '—')}</td><td>${escapeHtml(x.operating_system || '—')}</td><td>${escapeHtml(x.approximate_age || '—')}</td><td>${escapeHtml(x.condition || '—')}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const timeline = [
    {message_type:'inbound',body:kind === 'contact' ? record.message : record.use_case,subject:kind === 'pilot' ? 'Pilot application received' : 'Contact enquiry received',created_at:record.submitted_at,created_by:null},
    ...thread
  ].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const timelineHtml = timeline.map((m) => `<article class="admin-message ${m.message_type}"><div class="admin-message-head"><strong>${m.message_type === 'inbound' ? 'Received from ' + escapeHtml(person(record,kind)) : m.message_type === 'internal_note' ? 'Internal note · ' + escapeHtml(m.created_by === state.user.id ? (state.profile.display_name || state.user.email) : 'Nkabe staff') : 'Reply draft · ' + escapeHtml(m.created_by === state.user.id ? (state.profile.display_name || state.user.email) : 'Nkabe staff')}</strong><time>${escapeHtml(dateLabel(m.created_at))}</time></div>${m.subject ? '<small>' + escapeHtml(m.subject) + '</small>' : ''}<p>${escapeHtml(m.body)}</p>${m.message_type === 'outbound' ? '<small>Not sent · email delivery will be enabled in the next phase</small>' : ''}</article>`).join('');
  $('#detail-panel').innerHTML = `
    <header class="admin-detail-head"><div class="admin-detail-head-top"><div><span class="admin-kind">${kind === 'pilot' ? 'PILOT APPLICATION' : 'CONTACT ENQUIRY'}</span><h3>${escapeHtml(person(record,kind))}</h3><p>${escapeHtml(org(record,kind) || email(record,kind))} · <a href="mailto:${escapeHtml(email(record,kind))}">${escapeHtml(email(record,kind))}</a></p></div><span class="admin-status ${escapeHtml(record.status)}">${escapeHtml(pretty(record.status))}</span></div><div class="admin-detail-controls"><label for="record-status">STATUS</label><select id="record-status">${statusOpts}</select></div></header>
    <div class="admin-detail-content"><div class="admin-info-grid">${fieldHtml}</div>
      ${inventoryHtml}
      <section class="admin-detail-section"><h4>Conversation history</h4><div class="admin-timeline">${timelineHtml}</div></section>
      <form id="note-form" class="admin-composer"><h4>Add private note</h4><textarea id="note-body" required placeholder="Record an internal observation or next step…"></textarea><div class="admin-composer-actions"><button class="admin-secondary" type="submit">Save internal note</button></div></form>
      <form id="reply-form" class="admin-composer"><h4>Compose reply</h4><label for="reply-subject">Subject</label><input id="reply-subject" value="${escapeHtml(kind === 'pilot' ? 'Re: Nkabe pilot application' : 'Re: Your enquiry to Nkabe')}"><label for="reply-body">Message</label><textarea id="reply-body" required placeholder="Write a response to ${escapeHtml(person(record,kind))}…"></textarea><div class="admin-composer-actions"><button class="admin-primary" type="submit">Save reply draft <span>↗</span></button></div><p class="admin-composer-hint">This saves the reply in the conversation history as an unsent draft. Email delivery will be connected in the next phase.</p></form>
    </div>`;
  $('#record-status').addEventListener('change', async (event) => {
    const table = kind === 'contact' ? 'contact_messages' : 'pilot_applications';
    const {error} = await supabase.from(table).update({status:event.target.value}).eq('id',id);
    if (error) { toast('Status could not be updated: ' + error.message); return; }
    record.status = event.target.value;
    toast('Status updated.');
    renderOverview(); renderInbox(); renderDetail(key);
  });
  $('#note-form').addEventListener('submit', (event) => saveConversation(event,kind,id,'internal_note'));
  $('#reply-form').addEventListener('submit', (event) => saveConversation(event,kind,id,'outbound'));
}
async function saveConversation(event,kind,id,messageType) {
  event.preventDefault();
  const isNote = messageType === 'internal_note';
  const body = $(isNote ? '#note-body' : '#reply-body').value.trim();
  const subject = isNote ? null : $('#reply-subject').value.trim();
  if (!body) return;
  const payload = {
    contact_message_id:kind === 'contact' ? id : null,
    pilot_application_id:kind === 'pilot' ? id : null,
    message_type:messageType,
    channel:isNote ? 'internal' : 'email',
    subject,
    body,
    delivery_status:isNote ? 'not_applicable' : 'not_configured',
    created_by:state.user.id
  };
  const {error} = await supabase.from('admin_conversation_messages').insert(payload);
  if (error) { toast('Could not save conversation entry: ' + error.message); return; }
  event.target.reset();
  await loadData();
  toast(isNote ? 'Private note saved.' : 'Reply draft saved to conversation history. It has not been emailed.');
}
async function checkAccess(session) {
  if (!session?.user) { state.user = null; state.profile = null; showLogin(); return; }
  state.user = session.user;
  const {data,error} = await supabase.from('admin_users').select('role,is_active,display_name').eq('user_id',session.user.id).maybeSingle();
  if (error || !data || !data.is_active) {
    await supabase.auth.signOut();
    showLogin('This account has not been authorised for the Nkabe admin workspace.');
    return;
  }
  state.profile = data;
  showWorkspace();
  try { await loadData(); }
  catch (err) { toast('Workspace data could not be loaded. Check the admin database migration and access permissions.'); console.error(err); }
}
document.querySelectorAll('.admin-nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.openView)));
$('#inbox-search').addEventListener('input',renderInbox);
$('#status-filter').addEventListener('change',renderInbox);
$('#refresh-data').addEventListener('click',async()=>{try{await loadData();toast('Workspace refreshed.');}catch(e){toast('Refresh failed.');}});
$('#login-form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true; $('#login-status').textContent = 'Signing in…';
  const {data,error} = await supabase.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});
  button.disabled = false;
  if(error){$('#login-status').textContent = 'Sign-in failed. Check your details and try again.';return;}
  await checkAccess(data.session);
});
$('#request-password-reset').addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  const status = $('#login-status');
  const address = ($('#login-email')?.value || '').trim();
  if (!address) {
    status.textContent = 'Enter nkabeinc@outlook.com in the email field first.';
    status.classList.add('is-visible');
    $('#login-email')?.focus();
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = 'Requesting a password setup email…';
  status.classList.add('is-visible');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: 'https://nkabe.us/admin/' });
    status.textContent = error
      ? `Password setup request failed: ${error.message}`
      : 'Request accepted. Check your inbox and junk folder for the password setup email.';
  } catch (error) {
    status.textContent = `Could not contact Supabase: ${error?.message || 'Please try again.'}`;
  } finally {
    button.disabled = false;
  }
});
$('#password-reset-form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const password = $('#new-password').value;
  if (password !== $('#confirm-password').value) { $('#password-reset-status').textContent = 'The passwords do not match.'; return; }
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true; $('#password-reset-status').textContent = 'Saving your password…';
  const {error} = await supabase.auth.updateUser({password});
  button.disabled = false;
  if (error) { $('#password-reset-status').textContent = 'Password could not be saved. Request a fresh setup link and try again.'; return; }
  state.recoveryMode = false;
  $('#password-reset-form').reset();
  showLogin('Password saved. Sign in with your new password.');
});
$('#sign-out').addEventListener('click',async()=>{await supabase.auth.signOut();state.user=null;state.profile=null;showLogin('You have signed out.');});
supabase.auth.onAuthStateChange((_event,session)=>{
  if (_event === 'SIGNED_OUT') { state.recoveryMode = false; showLogin(); }
  if (_event === 'PASSWORD_RECOVERY') { state.recoveryMode = true; showLogin('Choose a new password for your Nkabe admin account.'); }
});
const {data:{session}} = await supabase.auth.getSession();
if (state.recoveryMode) showLogin('Choose a new password for your Nkabe admin account.');
else await checkAccess(session);
