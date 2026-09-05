import {buildComparisonPacket,briefText} from './packet.mjs';
import {renderPacket} from './render.mjs';
import {renderResearchChecks} from './research-checks.mjs';
const data=window.MEMORY_REPLAY_DATA, evidence=window.MEMORY_REPLAY_EVIDENCE;
const $=s=>document.querySelector(s);
let mode='changes',packet=null;
for(const id of ['from','to']){if(data){$('#'+id).min=data.windowStart;$('#'+id).max=data.windowEnd;}}
$('#from').value='2026-06-22'; $('#to').value='2026-07-29';
function showError(error){$('#error').hidden=false;$('#error').textContent=error.message||'Local evidence unavailable.';}
function render(){
  $('#error').hidden=true;
  try{packet=buildComparisonPacket(data,evidence,$('#from').value,$('#to').value);
    $('#export').disabled=false;
    if(mode==='checks') return showChecks();
    $('#result').innerHTML=renderPacket(packet,mode);
  }catch(error){packet=null;$('#export').disabled=true;$('#result').innerHTML='';showError(error);}
}
async function showChecks(){
  $('#result').innerHTML='<p>Loading local synthetic research checks…</p>';
  try{const markup=await renderResearchChecks();if(mode==='checks'){$('#result').innerHTML=markup;bindLifecycle();}}catch(error){if(mode==='checks')showError(error);}
}
function bindLifecycle(){$('#lifecycle-cutoff')?.addEventListener('change',async event=>{try{const markup=await renderResearchChecks(event.target.value);if(mode==='checks'){$('#result').innerHTML=markup;bindLifecycle();}}catch(error){showError(error);}});}
$('#controls').addEventListener('submit',event=>{event.preventDefault();render();});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
$('#export').addEventListener('click',()=>{if(!packet)return;const url=URL.createObjectURL(new Blob([briefText(packet)],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='memory-replay-'+packet.to+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
render();
