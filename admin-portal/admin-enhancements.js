import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.86.0/+esm';
const cfg=window.NKABE_SITE_CONFIG||{};
const sb=createClient((cfg.supabaseUrl||'').trim(),(cfg.supabaseAnonKey||'').trim());
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentUser=null,profile=null,activeEnhView='email',commRefreshTimer=null,companyInboxTimer=null;
const notify=m=>{const el=$('#global-status');if(el){el.textContent=m;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500);}};
function ensureShell(){
 const nav=$('.admin-nav'),workspace=$('#workspace-view');if(!nav||!workspace||$('#admin-enh-view'))return;
 nav.insertAdjacentHTML('beforeend',`
  <button class="admin-nav-item" data-enh-view="communications"><span>◉</span> Communications</button>
  <button class="admin-nav-item" data-enh-view="company-inbox"><span>✉</span> Company inbox</button>
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
 if(view!=='communications'&&commRefreshTimer){clearInterval(commRefreshTimer);commRefreshTimer=null;}
 if(view!=='company-inbox'&&companyInboxTimer){clearInterval(companyInboxTimer);companyInboxTimer=null;}
 activeEnhView=view;ensureShell();
 $('#overview-view').hidden=true;$('#inbox-view').hidden=true;$('#admin-enh-view').hidden=false;
 document.querySelectorAll('.admin-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.enhView===view));
 $('#page-title').textContent=view==='communications'?'Communications':view==='company-inbox'?'Company inbox':view==='email'?'Company email':view==='team'?'Team management':'Email branding';
 $('#enh-title').textContent=view==='communications'?'Team communications':view==='company-inbox'?'Company inbox':view==='email'?'Company email':view==='team'?'Team management':'Email branding';
 $('#enh-subtitle').textContent=view==='communications'?'Direct messages, company updates and project collaboration.':view==='company-inbox'?'Read and respond to external email conversations as Nkabe Inc.':view==='email'?'Compose branded messages and review outgoing mail.':view==='team'?'Invite colleagues and manage their Nkabe workspace access.':'Manage the sender identity and visual identity used in company emails.';
 if(view==='team'&&profile?.role!=='owner'){$('#enh-content').innerHTML='<p class="admin-empty">Only the company Owner can manage team access.</p>';return;}
 if(view==='settings'&&profile?.role!=='owner'){$('#enh-content').innerHTML='<p class="admin-empty">Only the company Owner can change company email branding.</p>';return;}
 if(view==='communications')renderCommunications();if(view==='company-inbox')renderCompanyInbox();if(view==='email')renderEmail();if(view==='team')renderTeam();if(view==='settings')renderSettings();
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

async function renderCommunications(){
 const canCreate=['owner','admin'].includes(profile?.role);
 $('#enh-content').innerHTML=`
 <div class="comm-layout">
  <aside class="comm-sidebar">
   <div class="comm-sidebar-head"><strong>Company channels</strong><button id="comm-refresh" class="admin-text-button" type="button">Refresh</button></div>
   <div id="comm-channel-list" class="comm-list">Loading channels…</div>
   <div class="comm-sidebar-head comm-people-head"><strong>Team members</strong></div>
   <div id="comm-people-list" class="comm-list">Loading team…</div>
   ${canCreate?`<form id="comm-create-channel" class="comm-create-form"><strong>Start a project channel</strong><input id="comm-channel-name" maxlength="80" required placeholder="e.g. nKABE OS pilot"><input id="comm-channel-description" maxlength="500" placeholder="What is this project about?"><button class="admin-secondary" type="submit">Create channel +</button><p id="comm-create-status" class="admin-form-status"></p></form>`:''}
  </aside>
  <section class="comm-main">
   <header class="comm-main-head"><div><p class="admin-overline">NKABE INC. / TEAM SPACE</p><h3 id="comm-title">Choose a channel or colleague</h3><p id="comm-subtitle">Discuss work, share updates and coordinate projects.</p></div><span class="enh-chip">Internal · Private</span></header>
   <div id="comm-message-list" class="comm-message-list"><div class="admin-detail-empty"><span>◉</span><h3>Your team workspace</h3><p>Select General, a project channel or a colleague to start communicating.</p></div></div>
   <form id="comm-message-form" class="comm-message-form" hidden><textarea id="comm-message-body" rows="3" maxlength="5000" required placeholder="Write a message…"></textarea><div><span>Messages are visible only to authorised Nkabe team members.</span><button class="admin-primary" type="submit">Send message ↗</button></div></form>
  </section>
 </div>`;
 let channels=[],members=[],selection=null;
 const call=async(body)=>{const {data,error}=await sb.functions.invoke('admin-communications',{body});if(error||data?.error)throw new Error(data?.error||error?.message||'Communications request failed.');return data;};
 const loadLists=async()=>{
  try{
   const [c,d]=await Promise.all([call({action:'channels'}),call({action:'directory'})]);
   channels=c.channels||[];members=d.members||[];
   $('#comm-channel-list').innerHTML=channels.map(ch=>`<button type="button" class="comm-list-item ${selection?.kind==='channel'&&selection.id===ch.id?'selected':''}" data-channel="${esc(ch.id)}"><span>#</span><span><strong>${esc(ch.name)}</strong><small>${esc(ch.description||'Company project discussion')}</small></span></button>`).join('')||'<p class="admin-empty">No channels yet.</p>';
   $('#comm-people-list').innerHTML=members.filter(m=>m.user_id!==currentUser.id).map(m=>`<button type="button" class="comm-list-item ${selection?.kind==='person'&&selection.id===m.user_id?'selected':''}" data-person="${esc(m.user_id)}"><span class="comm-person-avatar">${esc((m.display_name||'N').slice(0,1).toUpperCase())}</span><span><strong>${esc(m.display_name||'Team member')}</strong><small>${esc(m.role)} · ${esc(m.company_email||'Nkabe team')}</small></span></button>`).join('')||'<p class="admin-empty">No other active team members.</p>';
   $('#comm-channel-list').querySelectorAll('[data-channel]').forEach(b=>b.addEventListener('click',()=>select({kind:'channel',id:b.dataset.channel})));
   $('#comm-people-list').querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>select({kind:'person',id:b.dataset.person})));
  }catch(e){$('#comm-channel-list').textContent=e.message;$('#comm-people-list').textContent='';}
 };
 const loadMessages=async()=>{
  if(!selection)return;
  try{
   const data=await call(selection.kind==='channel'?{action:'messages',channel_id:selection.id}:{action:'messages',peer_id:selection.id});
   const messages=data.messages||[];
   const names=new Map(members.map(m=>[m.user_id,m.display_name||'Team member']));
   $('#comm-message-list').innerHTML=messages.length?messages.map(m=>{
    const mine=m.sender_id===currentUser.id,name=mine?'You':names.get(m.sender_id)||'Nkabe colleague';
    return `<article class="comm-message ${mine?'mine':''}"><div><strong>${esc(name)}</strong><time>${esc(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(m.created_at)))}</time></div><p>${esc(m.body)}</p></article>`;
   }).join(''):'<p class="admin-empty comm-empty">No messages here yet. Start the conversation.</p>';
   $('#comm-message-list').scrollTop=$('#comm-message-list').scrollHeight;
  }catch(e){$('#comm-message-list').innerHTML='<p class="admin-empty">'+esc(e.message)+'</p>';}
 };
 const select=async next=>{
  selection=next;const channel=channels.find(x=>x.id===next.id),person=members.find(x=>x.user_id===next.id);
  $('#comm-title').textContent=next.kind==='channel'?'# '+(channel?.name||'Project channel'):(person?.display_name||'Team member');
  $('#comm-subtitle').textContent=next.kind==='channel'?(channel?.description||'Company channel'):'Private direct conversation';
  $('#comm-message-form').hidden=false;
  $('#comm-channel-list').querySelectorAll('[data-channel]').forEach(b=>b.classList.toggle('selected',next.kind==='channel'&&b.dataset.channel===next.id));
  $('#comm-people-list').querySelectorAll('[data-person]').forEach(b=>b.classList.toggle('selected',next.kind==='person'&&b.dataset.person===next.id));
  await loadMessages();
 };
 $('#comm-refresh').addEventListener('click',async()=>{await loadLists();await loadMessages();});
 $('#comm-message-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.currentTarget.querySelector('button');const body=$('#comm-message-body').value.trim();if(!body||!selection)return;
  button.disabled=true;
  try{await call(selection.kind==='channel'?{action:'send_message',channel_id:selection.id,body}:{action:'send_message',peer_id:selection.id,body});$('#comm-message-body').value='';await loadMessages();}
  catch(err){notify(err.message||'Message could not be sent.');}
  finally{button.disabled=false;}
 });
 if(canCreate)$('#comm-create-channel').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;$('#comm-create-status').textContent='Creating channel…';
  try{const result=await call({action:'create_channel',name:$('#comm-channel-name').value.trim(),description:$('#comm-channel-description').value.trim()});$('#comm-create-channel').reset();$('#comm-create-status').textContent='Project channel created.';await loadLists();if(result.channel)await select({kind:'channel',id:result.channel.id});}
  catch(err){$('#comm-create-status').textContent=err.message||'Channel could not be created.';}
  finally{button.disabled=false;}
 });
 await loadLists();
 const general=channels.find(x=>x.slug==='general');if(general)await select({kind:'channel',id:general.id});
 if(commRefreshTimer)clearInterval(commRefreshTimer);
 commRefreshTimer=window.setInterval(()=>{if(selection)loadMessages();},12000);
}


async function renderCompanyInbox(){
 $('#enh-content').innerHTML=`
 <section class="enh-card company-inbox-card">
  <div class="enh-card-head"><div><p class="admin-overline">RESEND / SHARED INBOX</p><h3>hello@nkabe.us</h3><p class="enh-muted">Shared company correspondence · Replies sent as Nkabe Inc</p></div><span id="company-inbox-status" class="enh-chip">Checking connection…</span></div>
  <div id="company-inbox-setup" class="company-inbox-setup"></div>
  <div id="company-inbox-layout" class="company-inbox-layout" hidden>
   <aside><div class="company-inbox-list-head"><strong>Conversations</strong><button id="company-inbox-refresh" class="admin-text-button" type="button">Refresh</button></div><div id="company-inbox-threads" class="company-inbox-threads">Loading…</div></aside>
   <section class="company-inbox-thread"><header><h4 id="company-inbox-subject">Select a conversation</h4><p id="company-inbox-participants"></p></header><div id="company-inbox-messages" class="company-inbox-messages"><p class="admin-empty">Choose an email conversation to read it.</p></div><form id="company-inbox-reply" class="company-inbox-reply" hidden><textarea id="company-inbox-reply-body" rows="4" maxlength="10000" required placeholder="Write a reply as Nkabe Inc…"></textarea><div><span>Sent from hello@nkabe.us · Nkabe Inc</span><button class="admin-primary" type="submit">Send reply ↗</button></div><p id="company-inbox-reply-status" class="admin-form-status"></p></form></section>
  </div>
 </section>`;
 const call=async(body)=>{const {data,error}=await sb.functions.invoke('admin-communications',{body});if(error||data?.error)throw new Error(data?.error||error?.message||'Company inbox request failed.');return data;};
 let inbox=null,selectedThread=null,selectedThreadData=null;
 const isAdmin=['owner','admin'].includes(profile?.role);
 const setupBox=$('#company-inbox-setup');
 const setStatus=(label)=>$('#company-inbox-status').textContent=label;
 const renderSetup=()=>{
  if(!inbox){
   setupBox.innerHTML=isAdmin?`<div class="company-inbox-empty"><h4>Connect the Nkabe company inbox</h4><p>Resend will create a shared inbox for hello@nkabe.us and generate a forwarding address. Zoho will continue to receive and retain the original messages.</p><button id="company-inbox-connect" class="admin-primary" type="button">Connect Resend inbox</button><p id="company-inbox-connect-status" class="admin-form-status"></p></div>`:'<p class="admin-empty">The Owner or an Admin needs to connect the company inbox first.</p>';
   const button=$('#company-inbox-connect');if(button)button.addEventListener('click',async()=>{button.disabled=true;$('#company-inbox-connect-status').textContent='Connecting to Resend…';try{const result=await call({action:'inbox_setup'});inbox=result.inbox;renderConnected();}catch(e){$('#company-inbox-connect-status').textContent=e.message||'Could not connect Resend.';button.disabled=false;}});
   return;
  }
  renderConnected();
 };
 const renderConnected=()=>{
  setStatus(inbox.setup_status==='active'?'Receiving email':'Forwarding pending');
  setupBox.innerHTML=`<div class="company-inbox-forward"><div><strong>Forwarding address</strong><p>Copy this address into Zoho Mail forwarding for hello@nkabe.us. Keep the original Zoho copy.</p><code>${esc(inbox.receiving_address||'Not returned by Resend')}</code></div><button id="company-inbox-copy-forward" class="admin-secondary" type="button">Copy address</button></div><p class="company-inbox-note">Zoho MX records are unchanged. Incoming mail appears here after Zoho forwarding is verified.</p>`;
  $('#company-inbox-copy-forward').addEventListener('click',()=>{if(inbox.receiving_address)navigator.clipboard?.writeText(inbox.receiving_address);});
  $('#company-inbox-layout').hidden=false;
  loadThreads();
 };
 const threadSummary=(thread)=>{
  const emails=Array.isArray(thread.emails)?thread.emails:[];
  const latest=thread.last_email||thread.latest_email||emails[emails.length-1]||{};
  return {subject:thread.subject||latest.subject||'(No subject)',preview:latest.text||latest.snippet||latest.preview||thread.preview||'',from:latest.from||thread.from||thread.participants?.[0]||'',date:latest.created_at||thread.last_message_at||thread.updated_at||thread.created_at||''};
 };
 const loadThreads=async()=>{
  try{
   const result=await call({action:'inbox_threads'});
   const threads=result.threads||[];
   $('#company-inbox-threads').innerHTML=threads.length?threads.map(t=>{const s=threadSummary(t);return `<button type="button" class="company-inbox-thread-item ${selectedThread===t.id?'selected':''}" data-thread-id="${esc(t.id)}"><strong>${esc(s.subject)}</strong><small>${esc(s.from)}</small><span>${esc(s.preview).slice(0,110)}</span><time>${s.date?esc(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(s.date))):''}</time></button>`;}).join(''):'<p class="admin-empty">No incoming conversations yet. Once Zoho forwarding is verified, new emails will appear here.</p>';
   $('#company-inbox-threads').querySelectorAll('[data-thread-id]').forEach(b=>b.addEventListener('click',()=>loadThread(b.dataset.threadId)));
  }catch(e){$('#company-inbox-threads').innerHTML='<p class="admin-empty">'+esc(e.message)+'</p>';}
 };
 const loadThread=async(threadId)=>{
  selectedThread=threadId;
  try{
   const result=await call({action:'inbox_thread',inbox_id:inbox.inbox_id,thread_id:threadId});
   selectedThreadData=result.thread||{};
   const emails=Array.isArray(selectedThreadData.emails)?selectedThreadData.emails:[];
   $('#company-inbox-subject').textContent=selectedThreadData.subject||emails[0]?.subject||'(No subject)';
   $('#company-inbox-participants').textContent=selectedThreadData.participants?.join(', ')||emails.map(e=>e.from).filter(Boolean).join(' · ');
   $('#company-inbox-messages').innerHTML=emails.length?emails.map(e=>{const raw=e.text||e.html?.replace(/<[^>]*>/g,' ')||'Message content unavailable.';return `<article class="company-email-message"><div><strong>${esc(e.from||'Unknown sender')}</strong><time>${e.created_at?esc(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(e.created_at))):''}</time></div><p>${esc(raw)}</p></article>`;}).join(''):'<p class="admin-empty">No message content returned for this conversation.</p>';
   const inbound=[...emails].reverse().find(e=>e.direction==='inbound'||!String(e.from||'').toLowerCase().includes('hello@nkabe.us'))||emails[emails.length-1];
   $('#company-inbox-reply').hidden=!inbound?.id;
   $('#company-inbox-reply').dataset.emailId=inbound?.id||'';
   $('#company-inbox-threads').querySelectorAll('[data-thread-id]').forEach(b=>b.classList.toggle('selected',b.dataset.threadId===threadId));
  }catch(e){$('#company-inbox-messages').innerHTML='<p class="admin-empty">'+esc(e.message)+'</p>';}
 };
 $('#company-inbox-reply').addEventListener('submit',async e=>{
  e.preventDefault();const form=e.currentTarget,button=form.querySelector('button'),body=$('#company-inbox-reply-body').value.trim();if(!body||!selectedThread)return;
  button.disabled=true;$('#company-inbox-reply-status').textContent='Sending through Resend…';
  try{await call({action:'inbox_reply',inbox_id:inbox.inbox_id,thread_id:selectedThread,email_id:form.dataset.emailId,text:body});$('#company-inbox-reply-body').value='';$('#company-inbox-reply-status').textContent='Reply accepted by Resend.';await loadThread(selectedThread);await loadThreads();}
  catch(err){$('#company-inbox-reply-status').textContent=err.message||'Reply could not be sent.';}
  finally{button.disabled=false;}
 });
 const refresh=$('#company-inbox-refresh');if(refresh)refresh.addEventListener('click',loadThreads);
 try{const status=await call({action:'inbox_status'});inbox=status.inbox;if(inbox)renderConnected();else{setStatus('Not connected');renderSetup();}}
 catch(e){setStatus('Connection error');setupBox.innerHTML='<p class="admin-empty">'+esc(e.message)+'</p>';}
 if(companyInboxTimer)clearInterval(companyInboxTimer);
 companyInboxTimer=window.setInterval(()=>{if(inbox)loadThreads();},20000);
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
 if(event==='SIGNED_OUT'){currentUser=null;profile=null;initializedUserId=null;if(commRefreshTimer){clearInterval(commRefreshTimer);commRefreshTimer=null;}}
 if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')Promise.resolve().then(()=>initForSession(session));
});
const {data:{session}}=await sb.auth.getSession();
await initForSession(session);
