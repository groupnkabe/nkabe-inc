import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const allowedOrigins = new Set(["https://nkabe.us","https://www.nkabe.us","https://desk.nkabe.us","https://nkabe-admin.nkabeinc.workers.dev","http://localhost:5500","http://127.0.0.1:5500"]);
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
function reply(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers(jsonHeaders);
  if (origin && allowedOrigins.has(origin)) { headers.set("Access-Control-Allow-Origin", origin); headers.set("Vary","Origin"); }
  return new Response(JSON.stringify(body), {status,headers});
}
function envKey(name: string, fallback: string): string {
  try { const parsed=JSON.parse(Deno.env.get(name) ?? "{}"); if(typeof parsed.default==="string") return parsed.default; } catch {}
  return Deno.env.get(fallback) ?? "";
}
function cleanEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v=>typeof v==="string"?v.trim().toLowerCase():"").filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)))];
}
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
}
function brandedHtml(name: string, logo: string, color: string, footer: string, body: string): string {
  const safeLogo = /^https:\/\//i.test(logo) ? logo : "";
  const logoBlock = safeLogo ? '<img src="'+esc(safeLogo)+'" alt="'+esc(name)+'" style="max-width:150px;max-height:64px;object-fit:contain;margin-bottom:20px">' : '<div style="font-size:22px;font-weight:700;color:'+esc(color)+';margin-bottom:20px">'+esc(name)+'</div>';
  const paragraphs = esc(body).split(/\n{2,}/).map(p=>'<p style="margin:0 0 14px;line-height:1.7;color:#26384d">'+p.replace(/\n/g,"<br>")+'</p>').join("");
  return '<!doctype html><html><body style="margin:0;background:#f2f5f9;padding:28px 12px;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;padding:32px 28px;border-radius:8px">'+logoBlock+'<div>'+paragraphs+'</div><div style="border-top:1px solid #e5eaf0;margin-top:26px;padding-top:16px;color:#718096;font-size:12px">'+esc(footer)+'</div></div></body></html>';
}
Deno.serve(async (request: Request) => {
  const origin=request.headers.get("origin");
  if(origin && !allowedOrigins.has(origin)) return reply({error:"Origin not allowed."},403,null);
  if(request.method==="OPTIONS"){
    const h=new Headers({"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400"});
    if(origin && allowedOrigins.has(origin)){h.set("Access-Control-Allow-Origin",origin);h.set("Vary","Origin");}
    return new Response("ok",{headers:h});
  }
  if(request.method!=="POST") return reply({error:"Method not allowed."},405,origin);
  const authHeader=request.headers.get("Authorization")??"";
  const token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
  if(!token) return reply({error:"Sign-in required."},401,origin);
  const url=Deno.env.get("SUPABASE_URL")??"";
  const pubKey=envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey=envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!pubKey||!serviceKey) return reply({error:"Email service is not configured."},503,origin);
  const authClient=createClient(url,pubKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await authClient.auth.getUser(token);
  if(authError||!auth.user) return reply({error:"Your session is invalid. Sign in again."},401,origin);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:actor,error:actorError}=await db.from("admin_users").select("user_id,role,is_active").eq("user_id",auth.user.id).maybeSingle();
  if(actorError||!actor||!actor.is_active||!["owner","admin"].includes(actor.role)) return reply({error:"Only active owners and admins can send email."},403,origin);
  let payload:Record<string,unknown>;
  try { const raw=await request.text(); if(raw.length>20000) return reply({error:"Request is too large."},413,origin); payload=JSON.parse(raw); }
  catch { return reply({error:"Invalid request."},400,origin); }
  const action=typeof payload.action==="string"?payload.action:"";
  const apiKey=Deno.env.get("RESEND_API_KEY")??"";
  if(action==="status") return reply({success:true,configured:Boolean(apiKey),provider:"Resend"},200,origin);
  if(action!=="send"&&action!=="send_new") return reply({error:"Unknown action."},400,origin);
  if(!apiKey) return reply({error:"Email delivery is not configured. Drafts remain saved."},503,origin);

  const {data:settings}=await db.from("admin_email_settings").select("company_name,from_name,from_email,reply_to,logo_url,brand_color,footer_text").eq("id",true).maybeSingle();
  const company=settings?.company_name||"Nkabe Inc.";
  const fromName=settings?.from_name||"Nkabe Inc.";
  const fromEmail=settings?.from_email||Deno.env.get("NKABE_EMAIL_FROM")||"no-reply@nkabe.us";
  const replyTo=settings?.reply_to||Deno.env.get("NKABE_EMAIL_REPLY_TO")||"";
  if(!/^[^\s@]+@nkabe\.us$/i.test(fromEmail)) return reply({error:"The configured sender must use an authenticated @nkabe.us address."},503,origin);
  let to:string[]=[],cc:string[]=[],bcc:string[]=[],subject="",body="",recordId="",table="";
  if(action==="send"){
    recordId=typeof payload.message_id==="string"?payload.message_id:""; table="admin_conversation_messages";
    if(!/^[0-9a-f-]{36}$/i.test(recordId)) return reply({error:"Select a valid email draft."},400,origin);
    const {data:draft}=await db.from(table).select("id,contact_message_id,pilot_application_id,message_type,channel,subject,body,delivery_status").eq("id",recordId).maybeSingle();
    if(!draft) return reply({error:"Email draft not found."},404,origin);
    if(draft.message_type!=="outbound"||draft.channel!=="email"||!["draft","not_configured","failed"].includes(draft.delivery_status)) return reply({error:"This email is not in a sendable state."},409,origin);
    let recipient="";
    if(draft.contact_message_id){const {data}=await db.from("contact_messages").select("email").eq("id",draft.contact_message_id).maybeSingle();recipient=data?.email??"";}
    else if(draft.pilot_application_id){const {data}=await db.from("pilot_applications").select("contact_email").eq("id",draft.pilot_application_id).maybeSingle();recipient=data?.contact_email??"";}
    to=cleanEmails([recipient]); subject=draft.subject?.trim()||"Message from Nkabe Inc."; body=draft.body;
  } else {
    recordId=typeof payload.email_id==="string"?payload.email_id:""; table="admin_outbound_emails";
    if(!/^[0-9a-f-]{36}$/i.test(recordId)) return reply({error:"Select a valid outgoing email draft."},400,origin);
    const {data:draft}=await db.from(table).select("id,to_emails,cc_emails,bcc_emails,subject,body,delivery_status").eq("id",recordId).maybeSingle();
    if(!draft) return reply({error:"Outgoing email draft not found."},404,origin);
    if(!["draft","failed"].includes(draft.delivery_status)) return reply({error:"This email is not in a sendable state."},409,origin);
    to=cleanEmails(draft.to_emails); cc=cleanEmails(draft.cc_emails); bcc=cleanEmails(draft.bcc_emails);
    subject=draft.subject; body=draft.body;
  }
  if(!to.length||!subject.trim()||!body.trim()) return reply({error:"A valid recipient, subject and message are required."},422,origin);
  const {data:claimed,error:claimError}=await db.from(table).update({delivery_status:"sending"}).eq("id",recordId).in("delivery_status",action==="send"?["draft","not_configured","failed"]:["draft","failed"]).select("id").maybeSingle();
  if(claimError||!claimed) return reply({error:"This email is already being processed or is no longer sendable."},409,origin);
  const emailPayload:Record<string,unknown>={from:fromName+" <"+fromEmail+">",to,subject,text:body,html:brandedHtml(company,settings?.logo_url||"",settings?.brand_color||"#061A3A",settings?.footer_text||"Nkabe Inc. · nkabe.us",body),headers:{"X-Nkabe-Email-Record":recordId}};
  if(cc.length) emailPayload.cc=cc;
  if(bcc.length) emailPayload.bcc=bcc;
  if(replyTo) emailPayload.reply_to=[replyTo];
  try {
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json","Idempotency-Key":"nkabe-"+recordId},body:JSON.stringify(emailPayload),signal:AbortSignal.timeout(15000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok){await db.from(table).update({delivery_status:"failed"}).eq("id",recordId);console.error("Resend rejected message:",response.status,result?.name??"provider_error");return reply({error:"The email provider rejected this message. The draft is saved for review."},502,origin);}
    const update=action==="send"?{delivery_status:"sent",sent_at:new Date().toISOString()}:{delivery_status:"sent",sent_at:new Date().toISOString(),provider_id:result?.id??null};
    const {error:saveError}=await db.from(table).update(update).eq("id",recordId);
    if(saveError) return reply({success:true,warning:"Email accepted by provider, but its delivery record could not be updated. Check Sent before retrying.",provider_id:result?.id??null},200,origin);
    return reply({success:true,message:"Email accepted by Resend.",provider_id:result?.id??null},200,origin);
  } catch(error) {
    await db.from(table).update({delivery_status:"failed"}).eq("id",recordId);
    console.error("Email provider request failed:",error instanceof Error?error.message:"unknown_error");
    return reply({error:"The email provider could not be reached. The draft remains saved and can be retried."},502,origin);
  }
});
