import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
const allowedOrigins=new Set(["https://nkabe.us","https://www.nkabe.us","https://desk.nkabe.us","https://nkabe-admin.nkabeinc.workers.dev","http://localhost:5500","http://127.0.0.1:5500"]);
const headers={"Content-Type":"application/json; charset=utf-8"};
function reply(body:Record<string,unknown>,status:number,origin:string|null){const h=new Headers(headers);if(origin&&allowedOrigins.has(origin)){h.set("Access-Control-Allow-Origin",origin);h.set("Vary","Origin");}return new Response(JSON.stringify(body),{status,headers:h});}
function key(name:string,fallback:string){try{const o=JSON.parse(Deno.env.get(name)??"{}");if(typeof o.default==="string")return o.default;}catch{}return Deno.env.get(fallback)??"";}
function clean(v:unknown,max:number){return typeof v==="string"?v.trim().slice(0,max):"";}
function esc(v:unknown){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");if(origin&&!allowedOrigins.has(origin))return reply({error:"Origin not allowed."},403,null);
 if(req.method==="OPTIONS"){const h=new Headers({"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400"});if(origin&&allowedOrigins.has(origin)){h.set("Access-Control-Allow-Origin",origin);h.set("Vary","Origin");}return new Response("ok",{headers:h});}
 if(req.method!=="POST")return reply({error:"Method not allowed."},405,origin);
 const authHeader=req.headers.get("Authorization")??"";const token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";if(!token)return reply({error:"Sign-in required."},401,origin);
 const url=Deno.env.get("SUPABASE_URL")??"",pub=key("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")||"",secret=key("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!pub||!secret)return reply({error:"Team management is not configured."},503,origin);
 const userClient=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});const {data:auth,error:authErr}=await userClient.auth.getUser(token);if(authErr||!auth.user)return reply({error:"Your session is invalid. Sign in again."},401,origin);
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:actor,error:actorErr}=await admin.from("admin_users").select("user_id,role,is_active").eq("user_id",auth.user.id).maybeSingle();
 if(actorErr||!actor||!actor.is_active||actor.role!=="owner")return reply({error:"Only an active owner can manage team access."},403,origin);
 let p:Record<string,unknown>;try{const raw=await req.text();if(raw.length>12000)return reply({error:"Request is too large."},413,origin);p=JSON.parse(raw);}catch{return reply({error:"Invalid request."},400,origin);}
 const action=clean(p.action,20);
 if(action==="list"){
  const {data:profiles,error}=await admin.from("admin_users").select("user_id,display_name,role,is_active,created_at,company_email,mailbox_status").order("created_at",{ascending:true});
  if(error)return reply({error:"Could not load team members."},500,origin);
  const authUsers:Array<{id:string;email?:string;last_sign_in_at?:string}>=[];
  for(let page=1;page<=20;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:500});if(error)return reply({error:"Could not load team account details."},500,origin);authUsers.push(...(data.users??[]).map(u=>({id:u.id,email:u.email,last_sign_in_at:u.last_sign_in_at})));if((data.users??[]).length<500)break;}
  const byId=new Map(authUsers.map(u=>[u.id,u]));
  return reply({success:true,members:(profiles??[]).map(x=>{const u=byId.get(x.user_id);return {...x,email:u?.email??null,last_sign_in_at:u?.last_sign_in_at??null,is_current_user:x.user_id===actor.user_id};})},200,origin);
 }
 if(action==="invite"){
  const email=clean(p.email,254).toLowerCase(),displayName=clean(p.display_name,120),role=clean(p.role,20),companyEmail=clean(p.company_email,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:"Enter a valid invitation email address."},400,origin);
  if(!displayName)return reply({error:"Enter the team member's name."},400,origin);
  if(!["admin","staff"].includes(role))return reply({error:"Invitations can only be for admin or staff roles."},400,origin);
  if(companyEmail&&!/^[a-z0-9._%+-]+@nkabe\.us$/.test(companyEmail))return reply({error:"Company email must use an @nkabe.us address."},400,origin);
  const apiKey=Deno.env.get("RESEND_API_KEY")??"";
  if(!apiKey)return reply({error:"Resend is not configured. No team account was created."},503,origin);
  const {data:settings}=await admin.from("admin_email_settings").select("company_name,from_name,from_email,reply_to,logo_url,brand_color,footer_text").eq("id",true).maybeSingle();
  const company=settings?.company_name||"Nkabe Inc.",fromName=settings?.from_name||"Nkabe Inc.",fromEmail=settings?.from_email||"no-reply@nkabe.us";
  const color=/^#[0-9a-f]{6}$/i.test(settings?.brand_color||"")?settings.brand_color:"#061A3A";
  if(!/^[^\s@]+@nkabe\.us$/i.test(fromEmail))return reply({error:"The configured sender must use an authenticated @nkabe.us address."},503,origin);
  const redirectTo="https://nkabe-admin.nkabeinc.workers.dev/";
  const {data:invitation,error:inviteError}=await admin.auth.admin.generateLink({type:"invite",email,options:{data:{display_name:displayName},redirectTo}});
  if(inviteError||!invitation?.user||!invitation?.properties?.action_link)return reply({error:inviteError?.message?.includes("already")?"This email already has an Auth account. Manage its existing team access instead.":"The invitation could not be generated."},400,origin);
  const userId=invitation.user.id,actionLink=invitation.properties.action_link;
  const {error:insertError}=await admin.from("admin_users").insert({user_id:userId,display_name:displayName,role,is_active:true,company_email:companyEmail||null,mailbox_status:companyEmail?"pending":"not_configured"});
  if(insertError){await admin.auth.admin.deleteUser(userId);return reply({error:"The invitation could not be completed. No team access was created."},500,origin);}
  const logo=typeof settings?.logo_url==="string"&&/^https:\/\//i.test(settings.logo_url)?'<img src="'+esc(settings.logo_url)+'" alt="'+esc(company)+'" style="max-width:150px;max-height:64px;margin-bottom:22px">':'<h2 style="color:'+color+'">'+esc(company)+'</h2>';
  const html='<!doctype html><html><body style="margin:0;background:#f2f5f9;padding:28px 12px;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e2e8f0;padding:32px;border-radius:8px">'+logo+'<h2 style="color:#10243e">You are invited to join Nkabe Inc.</h2><p style="line-height:1.7;color:#334a65">Hello '+esc(displayName)+',</p><p style="line-height:1.7;color:#334a65">You have been invited to access the private Nkabe Inc. staff workspace. Use the button below to accept your invitation and set up your account.</p><p style="margin:28px 0"><a href="'+esc(actionLink)+'" style="background:'+color+';color:#fff;text-decoration:none;padding:13px 20px;border-radius:4px;display:inline-block;font-weight:700">Accept invitation</a></p><p style="font-size:12px;color:#718096">If you were not expecting this invitation, you can ignore this email.</p><div style="border-top:1px solid #e5eaf0;margin-top:25px;padding-top:15px;color:#718096;font-size:12px">'+esc(settings?.footer_text||"Nkabe Inc. · nkabe.us")+'</div></div></body></html>';
  try{
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json","Idempotency-Key":"nkabe-invite-"+userId},body:JSON.stringify({from:fromName+" <"+fromEmail+">",to:[email],subject:"Your Nkabe Inc. workspace invitation",html,text:"Hello "+displayName+",\\n\\nYou have been invited to the Nkabe Inc. staff workspace. Accept your invitation here: "+actionLink,reply_to:settings?.reply_to?[settings.reply_to]:undefined}),signal:AbortSignal.timeout(15000)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){await admin.auth.admin.deleteUser(userId);console.error("Resend invite failed:",response.status);return reply({error:"The invitation email could not be sent. No team access was created."},502,origin);}
   return reply({success:true,message:"Branded invitation sent. Company mailbox is marked pending provider setup.",user_id:userId,provider_id:result?.id??null},200,origin);
  }catch(error){await admin.auth.admin.deleteUser(userId);console.error("Invitation email request failed:",error instanceof Error?error.message:"unknown_error");return reply({error:"The invitation email service could not be reached. No team access was created."},502,origin);}
 }

 if(action==="update"){
  const userId=clean(p.user_id,64),role=clean(p.role,20),hasActive=typeof p.is_active==="boolean",companyEmail=typeof p.company_email==="string"?clean(p.company_email,254).toLowerCase():undefined,mailboxStatus=clean(p.mailbox_status,20);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))return reply({error:"Invalid team member."},400,origin);
  if(userId===actor.user_id)return reply({error:"You cannot change your own owner access here."},400,origin);
  if(role&&!["admin","staff"].includes(role))return reply({error:"Only admin or staff roles can be assigned."},400,origin);
  if(companyEmail!==undefined&&companyEmail&&!/^[a-z0-9._%+-]+@nkabe\.us$/.test(companyEmail))return reply({error:"Company email must use an @nkabe.us address."},400,origin);
  if(mailboxStatus&&!["not_configured","pending","provisioned","suspended"].includes(mailboxStatus))return reply({error:"Invalid mailbox status."},400,origin);
  if(!role&&!hasActive&&companyEmail===undefined&&!mailboxStatus)return reply({error:"No changes were supplied."},400,origin);
  const {data:target,error:targetError}=await admin.from("admin_users").select("user_id,role").eq("user_id",userId).maybeSingle();
  if(targetError||!target)return reply({error:"Team member not found."},404,origin);if(target.role==="owner")return reply({error:"Owner access cannot be changed from team management."},403,origin);
  const changes:Record<string,unknown>={};if(role)changes.role=role;if(hasActive)changes.is_active=p.is_active;if(companyEmail!==undefined){changes.company_email=companyEmail||null;if(companyEmail&&!mailboxStatus)changes.mailbox_status="pending";}if(mailboxStatus)changes.mailbox_status=mailboxStatus;
  const {error}=await admin.from("admin_users").update(changes).eq("user_id",userId);if(error)return reply({error:"Team access could not be updated."},500,origin);
  // Every protected query and Edge Function checks is_active, so deactivation takes effect immediately even if an existing Auth token remains cached.
  return reply({success:true,message:"Team access updated."},200,origin);
 }
 return reply({error:"Unknown action."},400,origin);
});
