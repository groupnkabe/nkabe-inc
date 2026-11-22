import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";
const allowedOrigins=new Set(["https://nkabe.us","https://www.nkabe.us","https://desk.nkabe.us","https://nkabe-admin.nkabeinc.workers.dev","http://localhost:5500","http://127.0.0.1:5500"]);
const headers={"Content-Type":"application/json; charset=utf-8"};
function reply(body:Record<string,unknown>,status:number,origin:string|null){const h=new Headers(headers);if(origin&&allowedOrigins.has(origin)){h.set("Access-Control-Allow-Origin",origin);h.set("Vary","Origin");}return new Response(JSON.stringify(body),{status,headers:h});}
function key(name:string,fallback:string){try{const o=JSON.parse(Deno.env.get(name)??"{}");if(typeof o.default==="string")return o.default;}catch{}return Deno.env.get(fallback)??"";}
function clean(v:unknown,max:number){return typeof v==="string"?v.trim().slice(0,max):"";}
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
  const {data:invitation,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{data:{display_name:displayName},redirectTo:"https://nkabe-admin.nkabeinc.workers.dev/"});
  if(inviteError||!invitation.user)return reply({error:inviteError?.message?.includes("already")?"This email already has an Auth account. Manage its existing team access instead.":"The invitation could not be sent. Check Supabase Auth email configuration."},400,origin);
  const {error:insertError}=await admin.from("admin_users").insert({user_id:invitation.user.id,display_name:displayName,role,is_active:true,company_email:companyEmail||null,mailbox_status:companyEmail?"pending":"not_configured"});
  if(insertError){await admin.auth.admin.deleteUser(invitation.user.id);return reply({error:"The invitation could not be completed. No team access was created."},500,origin);}
  return reply({success:true,message:"Invitation sent. Company mailbox is marked pending provider setup.",user_id:invitation.user.id},200,origin);
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
