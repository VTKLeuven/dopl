/**
 * The floating "Feedback" button (ARCHITECTURE §6): a tiny vanilla script that
 * opens a public form in a modal iframe and listens for resize/close messages
 * from our origin only. It reads everything it needs from its own <script>
 * tag, so the response is static and cacheable.
 *
 *   <script src="https://dopl.vtk.be/embed.js" data-form="it-support" async></script>
 */
const SCRIPT = `(function(){
var s=document.currentScript;if(!s)return;
var slug=s.getAttribute("data-form");if(!slug)return;
var origin=new URL(s.src).origin;
var text=s.getAttribute("data-text")||"Feedback";
var side=s.getAttribute("data-position")==="bottom-left"?"left":"right";
var font="600 14px/20px Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
var btn=document.createElement("button");
btn.type="button";btn.textContent=text;btn.setAttribute("aria-haspopup","dialog");
btn.style.cssText="position:fixed;bottom:20px;"+side+":20px;z-index:2147483000;background:#16161A;color:#fff;border:0;border-radius:999px;padding:10px 18px;font:"+font+";box-shadow:0 8px 24px -6px rgba(16,16,20,.3);cursor:pointer";
var overlay=null,frame=null;
function onKey(e){if(e.key==="Escape")close();}
function close(){if(!overlay)return;overlay.remove();overlay=null;frame=null;document.removeEventListener("keydown",onKey);btn.focus();}
function open(){
if(overlay)return;
overlay=document.createElement("div");
overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label",text);
overlay.style.cssText="position:fixed;inset:0;z-index:2147483001;background:rgba(24,24,27,.35);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;box-sizing:border-box";
overlay.addEventListener("click",function(e){if(e.target===overlay)close();});
frame=document.createElement("iframe");
frame.title=text;
frame.src=origin+"/f/"+encodeURIComponent(slug)+"?embed=modal&origin="+encodeURIComponent(location.origin);
frame.style.cssText="width:100%;max-width:560px;height:560px;max-height:88vh;border:0;border-radius:16px;background:#fff;box-shadow:0 24px 64px -12px rgba(16,16,20,.25)";
overlay.appendChild(frame);document.body.appendChild(overlay);
document.addEventListener("keydown",onKey);frame.focus();
}
window.addEventListener("message",function(e){
if(e.origin!==origin||!frame||e.source!==frame.contentWindow)return;
var d=e.data||{};
if(d.type==="dopl:close")close();
if(d.type==="dopl:resize"&&typeof d.height==="number")frame.style.height=Math.ceil(d.height)+"px";
});
btn.addEventListener("click",open);
function mount(){document.body.appendChild(btn);}
if(document.body)mount();else document.addEventListener("DOMContentLoaded",mount);
})();
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
