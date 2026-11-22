import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.86.0/+esm';
const cfg=window.NKABE_SITE_CONFIG||{};
const sb=createClient((cfg.supabaseUrl||'').trim(),(cfg.supabaseAnonKey||'').trim());
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentUser=null,profile=null,activeEnhView='email';
const notify=m=>{const el=$('#global-status');if(el){el.textContent=m;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500);}};
function ensureShell(){
 const nav=$('.admin-nav'),workspace=$('#workspace-view');if(!nav||!workspace||$('#admin-enh-view'))return;
 nav.insertAdjacentHTML('beforeend',`
  <button class="admin-nav-item" data-enh-view="email"><span>✉</span> Email</button>
  <button class="admin-nav-item" data-enh-view="team" id="team-nav"><span>♙</span> Team</button>
  <button class="admin-nav-item" data-enh-view="settings" id="settings-nav"><span>⚙</span> Settings</button>`);
 workspace.insertAdjacentHTML('beforeend',`
  <section id="admin-enh-view" class="admin-view" hidden>
   <div class="enh-heading"><div><p class="admin-overline">NKABE INC. / COMMUNICATIONS</p><h2 id="enh-title">Company email</h2><p id="enh-subtitle">Branded company communications and delivery history.</p></div></div>
   <div id="enh-content"></div>
  </section>`);
 nav.querySelectorAll('[data-enh-view]').forEach(b=>b.addEventListener('click',()=>openEnhView(b.dataset.enhView)));
 nav.addEventListener('click',e=>{const b=e.target.closest('.admin-nav-item');if(b&&!b.dataset.enhView)$('#admin-enh-view').hidden=true;});
}
function setNavActive(view){
 document.querySelectorAll('.admin-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.enhView===view));
}
function openEnhView(view){
 activeEnhView=view;ensureShell();
 $('#overview-view').hidden=true;$('#inbox-view').hidden=true;$('#admin-enh-view').hidden=false;
 document.querySelectorAll('.admin-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.enhView===view));
 $('#page-title').textContent=view==='email'?'Company email':view==='team'?'Team management':'Email branding';
 $('#enh-title').textContent=view==='email'?'Company email':view==='team'?'Team management':'Email branding';
 $('#enh-subtitle').textContent=view==='email'?'Compose branded messages and review outgoing mail.':view==='team'?'Invite colleagues and manage their Nkabe workspace access.':'Manage the sender identity and visual identity used in company emails.';
 if(view==='team'&&profile?.role!=='owner'){$('#enh-content').innerHTML='<p class="admin-empty">Only the company Owner can manage team access.</p>';return;}
 if(view==='settings'&&profile?.role!=='owner'){$('#enh-content').innerHTML='<p class="admin-empty">Only the company Owner can change company email branding.</p>';return;}
 if(view==='email')renderEmail();if(view==='team')renderTeam();if(view==='settings')renderSettings();
}
function emailsFrom(v){return v.split(/[;,\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean);}
function validEmails(a){return a.every(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));}
async function renderEmail(){
 $('#enh-content').innerHTML=`
 <div class="enh-grid">
  <section class="enh-card"><div class="enh-card-head"><div><p class="admin-overline">NEW MESSAGE</p><h3>Compose email</h3></div><span class="enh-chip">Branded by Nkabe</span></div>
   <form id="enh-compose" class="enh-form">
    <label>To <input id="enh-to" type="text" placeholder="name@example.com" required></label>
    <label>CC <input id="enh-cc" type="text" placeholder="Optional, comma-separated"></label>
    <label>BCC <input id="enh-bcc" type="text" placeholder="Optional, comma-separated"></label>
    <label>Subject <input id="enh-subject" type="text" required maxlength="250"></label>
    <label>Message <textarea id="enh-body" rows="9" required placeholder="Write your message…"></textarea></label>
    <div class="enh-actions"><button class="admin-secondary" id="enh-save" type="button">Save draft</button><button class="admin-primary" type="submit">Send email ↗</button></div>
    <p class="admin-composer-hint">Messages are sent through Resend using the company's configured sender identity and branded HTML layout. Attachments are not enabled yet.</p>
    <p id="enh-compose-status" class="admin-form-status" role="status"></p>
   </form>
  </section>
  <section class="enh-card"><div class="enh-card-head"><div><p class="admin-overline">OUTGOING MAIL</p><h3>Recent messages</h3></div><button id="enh-reload-mail" class="admin-text-button" type="button">Refresh</button></div><div id="enh-sent-list" class="enh-sent-list">Loading…</div></section>
 </div>`;
 const load=async()=>{
  const {data,error}=await sb.from('admin_outbound_emails').select('id,to_emails,subject,delivery_status,sent_at,created_at').order('created_at',{ascending:false}).limit(30);
  if(error){$('#enh-sent-list').textContent='Could not load outgoing email history.';return;}
  $('#enh-sent-list').innerHTML=data.length?data.map(m=>`<article class="enh-mail-row"><div><strong>${esc(m.subject)}</strong><small>To: ${esc(m.to_emails.join(', '))}</small></div><div class="enh-mail-meta"><span class="admin-status ${esc(m.delivery_status)}">${esc(m.delivery_status)}</span><time>${esc(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(m.sent_at||m.created_at)))}</time></div></article>`).join(''):'<p class="admin-empty">No outgoing messages yet.</p>';
 };
 const createDraft=async()=>{
  const to=emailsFrom($('#enh-to').value),cc=emailsFrom($('#enh-cc').value),bcc=emailsFrom($('#enh-bcc').value),subject=$('#enh-subject').value.trim(),body=$('#enh-body').value.trim();
  if(!to.length||!validEmails([...to,...cc,...bcc])||!subject||!body)throw new Error('Enter valid recipients, a subject and a message.');
  const {data,error}=await sb.from('admin_outbound_emails').insert({to_emails:to,cc_emails:cc,bcc_emails:bcc,subject,body,created_by:currentUser.id,delivery_status:'draft'}).select('id').single();
  if(error)throw error;return data.id;
 };
 if(profile?.role==='staff'){const sendButton=$('#enh-compose').querySelector('button[type=submit]');sendButton.disabled=true;sendButton.textContent='Admin or Owner required to send';}
 $('#enh-save').addEventListener('click',async()=>{try{const id=await createDraft();$('#enh-compose-status').textContent='Draft saved.';notify('Email draft saved.');await load();}catch(e){$('#enh-compose-status').textContent=e.message||'Could not save draft.';}});
 $('#enh-compose').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;$('#enh-compose-status').textContent='Saving and sending…';
  try{const id=await createDraft();const {data,error}=await sb.functions.invoke('send-admin-email',{body:{action:'send_new',email_id:id}});
   if(error||data?.error)throw new Error(data?.error||error?.message||'Email could not be sent.');
   $('#enh-compose').reset();$('#enh-compose-status').textContent=data?.warning||'Email accepted by Resend.';notify(data?.warning||'Email sent.');await load();
  }catch(err){$('#enh-compose-status').textContent=err.message||'Email could not be sent.';await load();}
  finally{btn.disabled=false;}
 });
 $('#enh-reload-mail').addEventListener('click',load);await load();
}
async function renderTeam(){
 $('#enh-content').innerHTML=`
 <div class="enh-grid">
  <section class="enh-card"><div class="enh-card-head"><div><p class="admin-overline">ADD A COLLEAGUE</p><h3>Invite team member</h3></div></div>
   <form id="enh-invite" class="enh-form">
    <label>Full name <input id="team-name" required maxlength="120"></label>
    <label>Invitation email <input id="team-login-email" type="email" required placeholder="Their current email address"></label>
    <label>Company email <input id="team-company-email" type="email" placeholder="firstname@nkabe.us"></label>
    <label>Workspace role <select id="team-role"><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
    <button class="admin-primary" type="submit">Send invitation ↗</button>
    <p class="admin-composer-hint">The invitation goes to their existing email address. The @nkabe.us mailbox is tracked separately and must be provisioned with the company's mail host before it can receive mail.</p>
    <p id="team-invite-status" class="admin-form-status" role="status"></p>
   </form>
  </section>
  <section class="enh-card"><div class="enh-card-head"><div><p class="admin-overline">ACCESS CONTROL</p><h3>Company team</h3></div><button id="enh-reload-team" class="admin-text-button" type="button">Refresh</button></div><div id="enh-team-list" class="enh-team-list">Loading…</div></section>
 </div>`;
 const load=async()=>{
  const {data,error}=await sb.functions.invoke('manage-admin-team',{body:{action:'list'}});
  if(error||data?.error){$('#enh-team-list').textContent=data?.error||'Could not load team.';return;}
  $('#enh-team-list').innerHTML=(data.members||[]).map(m=>`<article class="enh-team-row" data-user="${esc(m.user_id)}">
   <div class="enh-team-ident"><strong>${esc(m.display_name||m.email||'Team member')}</strong><small>Login: ${esc(m.email||'—')}</small><small>Company: ${esc(m.company_email||'Not assigned')}</small><small>Mailbox: ${esc(m.mailbox_status||'not_configured')} · Last sign-in: ${m.last_sign_in_at?esc(new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(new Date(m.last_sign_in_at))):'Never'}</small></div>
   <div class="enh-team-controls"><span class="admin-status">${esc(m.role)} · ${m.is_active?'active':'inactive'}</span>${m.role==='owner'?'<span class="enh-chip">Owner</span>':`<label>Role <select data-role><option value="staff" ${m.role==='staff'?'selected':''}>Staff</option><option value="admin" ${m.role==='admin'?'selected':''}>Admin</option></select></label><label>Company email <input data-company-email value="${esc(m.company_email||'')}" placeholder="name@nkabe.us"></label><label>Mailbox status <select data-mailbox><option value="not_configured">Not configured</option><option value="pending" ${m.mailbox_status==='pending'?'selected':''}>Pending</option><option value="provisioned" ${m.mailbox_status==='provisioned'?'selected':''}>Provisioned</option><option value="suspended" ${m.mailbox_status==='suspended'?'selected':''}>Suspended</option></select></label><button class="admin-secondary" data-save-team type="button">Save</button><button class="admin-secondary" data-toggle-team type="button">${m.is_active?'Deactivate':'Reactivate'}</button>`}</div>
  </article>`).join('')||'<p class="admin-empty">No team members yet.</p>';
  $('#enh-team-list').querySelectorAll('[data-save-team]').forEach(b=>b.addEventListener('click',async()=>{
   const row=b.closest('[data-user]');const {data,error}=await sb.functions.invoke('manage-admin-team',{body:{action:'update',user_id:row.dataset.user,role:row.querySelector('[data-role]').value,company_email:row.querySelector('[data-company-email]').value,mailbox_status:row.querySelector('[data-mailbox]').value}});
   if(error||data?.error){notify(data?.error||'Update failed.');return;}notify('Team member updated.');await load();
  }));
  $('#enh-team-list').querySelectorAll('[data-toggle-team]').forEach(b=>b.addEventListener('click',async()=>{
   const row=b.closest('[data-user]'),deactivate=b.textContent.trim()==='Deactivate';
   if(deactivate&&!confirm('Deactivate this team member? Their workspace access will be blocked.'))return;
   const {data,error}=await sb.functions.invoke('manage-admin-team',{body:{action:'update',user_id:row.dataset.user,is_active:!deactivate}});
   if(error||data?.error){notify(data?.error||'Update failed.');return;}notify('Team access updated.');await load();
  }));
 };
 $('#enh-invite').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
  const {data,error}=await sb.functions.invoke('manage-admin-team',{body:{action:'invite',display_name:$('#team-name').value.trim(),email:$('#team-login-email').value.trim(),company_email:$('#team-company-email').value.trim(),role:$('#team-role').value}});
  $('#team-invite-status').textContent=error||data?.error||data?.message||'Invitation sent.';
  if(!error&&!data?.error){e.currentTarget.reset();await load();}btn.disabled=false;
 });
 $('#enh-reload-team').addEventListener('click',load);await load();
}
async function renderSettings(){
 const {data,error}=await sb.from('admin_email_settings').select('*').eq('id',true).maybeSingle();
 if(error){$('#enh-content').innerHTML='<p class="admin-empty">Email settings could not be loaded. Apply the company email migration first.</p>';return;}
 const s=data||{};
 $('#enh-content').innerHTML=`
 <section class="enh-card enh-settings-card"><div class="enh-card-head"><div><p class="admin-overline">SENDER IDENTITY</p><h3>Company email branding</h3></div><span class="enh-chip">Owner controls</span></div>
 <form id="enh-brand-settings" class="enh-form enh-brand-form">
  <div class="enh-two"><label>Company name <input id="brand-company" value="${esc(s.company_name||'Nkabe Inc.')}" required></label><label>Sender display name <input id="brand-from-name" value="${esc(s.from_name||'Nkabe Inc.')}" required></label></div>
  <div class="enh-two"><label>From email address <input id="brand-from-email" type="email" value="${esc(s.from_email||'no-reply@nkabe.us')}" required></label><label>Reply-to address <input id="brand-reply-to" type="email" value="${esc(s.reply_to||'')}" placeholder="Optional"></label></div>
  <label>Upload company logo (PNG, JPG or WebP · max 2 MB) <input id="brand-logo-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
  <label>Logo image URL <input id="brand-logo" type="url" value="${esc(s.logo_url||'https://nkabe.us/assets/nkabe-inc-mark.webp')}" placeholder="https://nkabe.us/assets/logo.png"></label>
  <div class="enh-logo-preview"><img id="brand-preview" src="${esc(s.logo_url||'https://nkabe.us/assets/nkabe-inc-mark.webp')}" alt="Email logo preview" onerror="this.style.display='none'"><span>Preview used in outgoing email templates</span></div>
  <div class="enh-two"><label>Brand colour <input id="brand-color" type="color" value="${esc(s.brand_color||'#061A3A')}"></label><label>Footer text <input id="brand-footer" value="${esc(s.footer_text||'Nkabe Inc. · nkabe.us')}"></label></div>
  <button class="admin-primary" type="submit">Save email branding ↗</button><p id="brand-status" class="admin-form-status" role="status"></p>
  <p class="admin-composer-hint">This controls the HTML logo, company name, colours and footer inside outgoing emails. Inbox sender avatars are controlled separately by email providers and domain branding standards.</p>
 </form></section>`;
 $('#brand-logo').addEventListener('input',()=>{$('#brand-preview').src=$('#brand-logo').value;$('#brand-preview').style.display='';});
 $('#brand-logo-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2097152){$('#brand-status').textContent='Choose a PNG, JPG or WebP image up to 2 MB.';return;}
  $('#brand-status').textContent='Uploading logo…';
  const ext=file.type==='image/png'?'png':file.type==='image/jpeg'?'jpg':'webp';
  const {error}=await sb.storage.from('nkabe-email-branding').upload('company-logo.'+ext,file,{upsert:true,contentType:file.type,cacheControl:'3600'});
  if(error){$('#brand-status').textContent='Logo upload failed: '+error.message;return;}
  const {data}=sb.storage.from('nkabe-email-branding').getPublicUrl('company-logo.'+ext);
  const url=data.publicUrl+'?v='+Date.now();$('#brand-logo').value=url;$('#brand-preview').src=url;$('#brand-preview').style.display='';$('#brand-status').textContent='Logo uploaded. Save branding to apply it to outgoing email.';
 });
 $('#enh-brand-settings').addEventListener('submit',async e=>{
  e.preventDefault();const payload={company_name:$('#brand-company').value.trim(),from_name:$('#brand-from-name').value.trim(),from_email:$('#brand-from-email').value.trim(),reply_to:$('#brand-reply-to').value.trim()||null,logo_url:$('#brand-logo').value.trim()||null,brand_color:$('#brand-color').value,footer_text:$('#brand-footer').value.trim(),updated_by:currentUser.id,updated_at:new Date().toISOString()};
  const {error}=await sb.from('admin_email_settings').update(payload).eq('id',true);$('#brand-status').textContent=error?error.message:'Branding settings saved.';
 });
}
function interceptReply(){
 const panel=$('#detail-panel');if(!panel)return;
 const observer=new MutationObserver(()=>{
  const form=$('#reply-form');if(!form||form.dataset.brandedReply==='1')return;
  form.dataset.brandedReply='1';
  const button=form.querySelector('button[type="submit"]');if(button)button.innerHTML='Send branded reply <span>↗</span>';
  const hint=form.querySelector('.admin-composer-hint');if(hint)hint.textContent='Your reply will be saved to the conversation and sent using Nkabe’s branded email template. Only Admins and the Owner can send.';
  form.addEventListener('submit',async e=>{
   if(!['owner','admin'].includes(profile?.role))return;
   e.preventDefault();e.stopImmediatePropagation();
   const body=$('#reply-body').value.trim(),subject=$('#reply-subject').value.trim();
   const selected=$('.admin-list-row.selected')?.dataset.record||'';
   const [kind,id]=selected.split(':');
   if(!body||!id){notify('Select a valid conversation and enter a message.');return;}
   button.disabled=true;
   try{
    const {data:inserted,error}=await sb.from('admin_conversation_messages').insert({contact_message_id:kind==='contact'?id:null,pilot_application_id:kind==='pilot'?id:null,message_type:'outbound',channel:'email',subject,body,delivery_status:'not_configured',created_by:currentUser.id}).select('id').single();
    if(error)throw error;
    const {data,error:sendError}=await sb.functions.invoke('send-admin-email',{body:{action:'send',message_id:inserted.id}});
    if(sendError||data?.error)throw new Error(data?.error||sendError?.message||'Email could not be sent.');
    notify(data?.warning||'Branded reply sent.');$('#refresh-data')?.click();
   }catch(err){notify(err.message||'Reply could not be sent. Draft remains in the conversation where saved.');$('#refresh-data')?.click();}
   finally{button.disabled=false;}
  },true);
 });
 observer.observe(panel,{childList:true,subtree:true});
}
let initializedUserId=null;
async function initForSession(session){
 if(!session?.user){currentUser=null;profile=null;initializedUserId=null;return;}
 if(initializedUserId===session.user.id)return;
 currentUser=session.user;
 const {data}=await sb.from('admin_users').select('role,is_active,display_name').eq('user_id',currentUser.id).maybeSingle();
 if(!data?.is_active)return;
 profile=data;initializedUserId=currentUser.id;ensureShell();interceptReply();
 if(profile.role!=='owner'){$('#team-nav')?.remove();$('#settings-nav')?.remove();}
}
sb.auth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_OUT'){currentUser=null;profile=null;initializedUserId=null;}
 if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')Promise.resolve().then(()=>initForSession(session));
});
const {data:{session}}=await sb.auth.getSession();
await initForSession(session);
