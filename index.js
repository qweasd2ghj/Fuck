(() => {
'use strict';

const KEY = 'side_story_theater';
const DEFAULTS = {
  systemPrompt: '你是一位擅长角色扮演与同人创作的小说作者。尊重提供的人物设定、关系、世界观和时间线。',
  creativeRules: '本次内容是独立番外，不是主线已经发生的事实。不要修改、总结或声称写入主线记忆。保持角色言行符合设定。',
  jailbreakPrompt: '',
  presets: {
    '默认番外': '写一段自然、有画面感的独立番外，重视角色互动。',
    '抽象喜剧': '允许荒诞、反差和喜剧节奏，但角色核心性格不能崩坏。',
    '严肃平行世界': '构建自洽的平行世界设定，保持人物动机与情绪可信。',
    '跨作品联动': '尊重不同作品设定差异，建立合理相遇契机，再展现角色互动。'
  },
  activePreset: '默认番外',
  theaters: [],
  activeId: null,
  maxHistory: 30,
  maxTheaterTurns: 24,
  captureChat: true,
  captureCharacter: true,
  capturePersona: true,
  captureEmbeddedLore: true,
  defaultTemperature: null,
  defaultMaxTokens: null
};

const $ = (sel, root=document) => root.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function ctx(){ return window.SillyTavern?.getContext?.(); }
function settings(){
  const c=ctx();
  if(!c) throw new Error('未找到 SillyTavern 上下文');
  c.extensionSettings[KEY] ||= structuredClone(DEFAULTS);
  const s=c.extensionSettings[KEY];
  for(const [k,v] of Object.entries(DEFAULTS)) if(s[k]===undefined) s[k]=structuredClone(v);
  s.presets ||= structuredClone(DEFAULTS.presets);
  s.theaters ||= [];
  return s;
}
function save(){ ctx()?.saveSettingsDebounced?.(); }
function currentCharacter(c){
  if(c.characterId===undefined || !c.characters?.[c.characterId]) return null;
  const card=c.characters[c.characterId], d=card.data||card;
  return {name:card.name||d.name||'未命名角色', description:d.description||'', personality:d.personality||'',
    scenario:d.scenario||'', first_mes:d.first_mes||'', mes_example:d.mes_example||'',
    creator_notes:d.creator_notes||'', book:d.character_book||d.characterBook||null};
}
function characterSnapshot(c){
  const card=currentCharacter(c);
  if(!card) return '当前没有选中的单人角色卡。';
  let lore='';
  if(card.book){
    const entries=Array.isArray(card.book.entries)?card.book.entries:Object.values(card.book.entries||{});
    lore=entries.filter(e=>!e.disable).map(e=>`【${e.name||e.keys||'角色卡世界书'}】\n${e.content||''}`).filter(Boolean).join('\n\n');
  }
  return `角色名称：${card.name}\n角色描述：${card.description}\n性格：${card.personality}\n场景：${card.scenario}\n开场白：${card.first_mes}\n示例对话：${card.mes_example}\n创作者注释：${card.creator_notes}\n\n角色卡内嵌世界书（非禁用条目）：\n${lore||'无或未提供'}`;
}
function personaSnapshot(c){
  const p=c.powerUserSettings?.persona_description||c.personaDescription||c.persona?.description||'';
  return `User 名称：${c.name1||'User'}\nUser Persona：${p||'当前上下文未暴露 Persona 描述'}`;
}
function chatSnapshot(c, max){
  const chat=Array.isArray(c.chat)?c.chat:[];
  return chat.slice(-max).map(m=>{
    const name=m.is_user?(c.name1||'User'):(m.name||c.name2||'角色');
    return `${name}：${m.mes||m.message||''}`;
  }).join('\n\n');
}
function makeSnapshot(s){
  const c=ctx();
  const bits=[];
  if(s.captureCharacter) bits.push('【角色卡】\n'+characterSnapshot(c));
  if(s.capturePersona) bits.push('【用户人设】\n'+personaSnapshot(c));
  if(s.captureChat) bits.push('【主线聊天记录（只读背景）】\n'+chatSnapshot(c,s.maxHistory));
  const chatId=c.chatId||c.chatMetadata?.chat_id||c.chatMetadata?.chatId||'当前聊天';
  const char=currentCharacter(c)?.name||'当前角色';
  return {text:bits.join('\n\n'), sourceLabel:`${char} · ${chatId}`, capturedAt:Date.now()};
}
function getTheater(s){
  let t=s.theaters.find(x=>x.id===s.activeId);
  if(!t){ t={id:uuid(),title:'新建小剧场',messages:[],createdAt:Date.now(),snapshot:null,loreSupplement:''}; s.theaters.unshift(t); s.activeId=t.id; save(); }
  return t;
}
function newTheater(){
  const s=settings(), t={id:uuid(),title:'新建小剧场',messages:[],createdAt:Date.now(),snapshot:makeSnapshot(s),loreSupplement:''};
  s.theaters.unshift(t);s.activeId=t.id;save();render();
}
function openOverlay(){
  const root=$('#sst-overlay');
  if(!root) return;
  root.classList.add('open');root.setAttribute('aria-hidden','false');
  document.body.classList.add('sst-lock-scroll');
  render();
}
function closeOverlay(){
  const root=$('#sst-overlay');
  if(!root) return;
  root.classList.remove('open');root.setAttribute('aria-hidden','true');
  document.body.classList.remove('sst-lock-scroll');
}
function toggleOverlay(){ $('#sst-overlay')?.classList.contains('open')?closeOverlay():openOverlay(); }
function ensureUI(){
  if($('#sst-overlay')) return;
  const overlay=document.createElement('div');
  overlay.id='sst-overlay';overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML=`
    <div class="sst-backdrop" data-close="1"></div>
    <section class="sst-app" role="dialog" aria-modal="true" aria-label="异想剧场">
      <header class="sst-top">
        <button class="sst-icon-btn" id="sst-close" aria-label="关闭剧场">←</button>
        <div class="sst-brand"><strong>🎭 异想剧场</strong><small>SIDE STORY · 独立番外空间</small></div>
        <button class="sst-icon-btn" id="sst-new" aria-label="新建剧场">＋</button>
      </header>
      <nav class="sst-tabs" id="sst-tabs"></nav>
      <main class="sst-main">
        <div class="sst-titlebar">
          <input id="sst-title" aria-label="剧场名称" maxlength="60">
          <button id="sst-open-settings" class="sst-soft-btn">⚙ 设置</button>
        </div>
        <div id="sst-source" class="sst-source"></div>
        <div id="sst-messages" class="sst-messages"></div>
        <div class="sst-composer">
          <textarea id="sst-input" rows="3" placeholder="写下你想看的番外……"></textarea>
          <div class="sst-compose-actions">
            <select id="sst-preset" aria-label="提示词预设"></select>
            <button id="sst-generate" class="sst-generate">生成剧场 ✦</button>
          </div>
        </div>
        <section id="sst-settings" class="sst-settings" hidden>
          <div class="sst-settings-head"><strong>剧场设置</strong><button id="sst-settings-close" class="sst-icon-btn">✕</button></div>
          <label>系统提示词<textarea id="sst-system" rows="3"></textarea></label>
          <label>创作规则<textarea id="sst-rules" rows="3"></textarea></label>
          <label>自定义创作 / 破限提示词<textarea id="sst-jailbreak" rows="3" placeholder="写入你希望模型遵循的创作要求"></textarea></label>
          <label>当前预设内容<textarea id="sst-preset-content" rows="3"></textarea></label>
          <div class="sst-button-row">
            <button id="sst-save-preset">保存预设</button><button id="sst-new-preset">另存预设</button>
          </div>
          <label>补充世界书 / 额外设定<textarea id="sst-lore" rows="5" placeholder="可粘贴世界书条目或跨作品角色资料"></textarea></label>
          <div class="sst-settings-grid">
            <label><input type="checkbox" id="sst-capture-character"> 读取角色卡</label>
            <label><input type="checkbox" id="sst-capture-persona"> 读取 User Persona</label>
            <label><input type="checkbox" id="sst-capture-chat"> 读取主线聊天记录</label>
            <label><input type="checkbox" id="sst-capture-lore"> 读取角色卡内嵌世界书</label>
          </div>
          <label>读取最近主线消息数<input id="sst-max-history" type="number" min="1" max="200"></label>
          <p class="sst-note">上下文会在创建剧场或点击「刷新主线背景」时保存为快照。生成时使用 raw 模式，只发送快照和本剧场历史，不调用主线 Quiet 上下文。酒馆全局 / 角色绑定世界书的全部激活条目尚未通过稳定公开接口读取；可在上方补充世界书中粘贴本次需要的条目。</p>
          <div class="sst-button-row"><button id="sst-refresh-context">刷新主线背景</button><button id="sst-export">导出剧场</button><button id="sst-import">导入剧场</button><input id="sst-file" type="file" accept="application/json" hidden></div>
          <div class="sst-button-row"><button id="sst-rename">重命名</button><button id="sst-clear">清空本剧场</button><button id="sst-delete" class="sst-danger">删除本剧场</button></div>
        </section>
      </main>
    </section>`;
  document.body.append(overlay);

  const float=document.createElement('button');
  float.id='sst-float';float.type='button';float.innerHTML='<span>🎭</span><small>剧场</small>';float.setAttribute('aria-label','打开异想剧场');
  document.body.append(float);

  $('#sst-close').addEventListener('click',closeOverlay);
  $('#sst-new').addEventListener('click',newTheater);
  $('#sst-open-settings').addEventListener('click',()=>{$('#sst-settings').hidden=false;});
  $('#sst-settings-close').addEventListener('click',()=>{$('#sst-settings').hidden=true;});
  $('#sst-float').addEventListener('click',openOverlay);
  overlay.addEventListener('click',e=>{if(e.target.dataset.close)closeOverlay();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#sst-overlay')?.classList.contains('open'))closeOverlay();});
  bindToolbarButton();
  bindSettings();
  render();
}
function bindToolbarButton(){
  const add=()=>{
    const bar=$('#top-bar')||$('#top-settings-holder')||$('.top-bar');
    if(!bar||$('#sst-toolbar-open')) return;
    const b=document.createElement('button');
    b.id='sst-toolbar-open';b.type='button';b.className='menu_button';b.innerHTML='<i class="fa-solid fa-masks-theater"></i> <span>异想剧场</span>';
    b.addEventListener('click',openOverlay);bar.append(b);
  };
  add();
  const mo=new MutationObserver(add);
  mo.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>mo.disconnect(),10000);
}
function bindSettings(){
  const s=settings();
  const set=(id,key,parse=v=>v)=>{$(id).addEventListener('change',e=>{s[key]=parse(e.target.type==='checkbox'?e.target.checked:e.target.value);save();});};
  set('#sst-system','systemPrompt');set('#sst-rules','creativeRules');set('#sst-jailbreak','jailbreakPrompt');
  set('#sst-capture-character','captureCharacter',Boolean);set('#sst-capture-persona','capturePersona',Boolean);
  set('#sst-capture-chat','captureChat',Boolean);set('#sst-capture-lore','captureEmbeddedLore',Boolean);
  set('#sst-max-history','maxHistory',v=>Math.max(1,Math.min(200,Number(v)||30)));
  $('#sst-preset').addEventListener('change',e=>{s.activePreset=e.target.value;save();$('#sst-preset-content').value=s.presets[s.activePreset]||'';});
  $('#sst-preset-content').addEventListener('change',e=>{s.presets[s.activePreset]=e.target.value;save();});
  $('#sst-save-preset').addEventListener('click',()=>{s.presets[s.activePreset]=$('#sst-preset-content').value;save();toast('预设已保存');});
  $('#sst-new-preset').addEventListener('click',()=>{const name=prompt('新预设名称');if(name){s.presets[name]=$('#sst-preset-content').value;s.activePreset=name;save();render();$('#sst-settings').hidden=false;}});
  $('#sst-lore').addEventListener('change',e=>{const t=getTheater(s);t.loreSupplement=e.target.value;save();});
  $('#sst-refresh-context').addEventListener('click',()=>{const t=getTheater(s);t.snapshot=makeSnapshot(s);save();render();$('#sst-settings').hidden=false;toast('主线背景快照已刷新');});
  $('#sst-rename').addEventListener('click',()=>{const t=getTheater(s),n=prompt('剧场名称',t.title);if(n){t.title=n;save();render();$('#sst-settings').hidden=false;}});
  $('#sst-clear').addEventListener('click',()=>{const t=getTheater(s);if(confirm('清空当前剧场的番外记录？')){t.messages=[];save();render();$('#sst-settings').hidden=false;}});
  $('#sst-delete').addEventListener('click',()=>{const t=getTheater(s);if(confirm('删除当前剧场？此操作无法撤销。')){s.theaters=s.theaters.filter(x=>x.id!==t.id);s.activeId=null;save();render();$('#sst-settings').hidden=true;}});
  $('#sst-export').addEventListener('click',exportData);
  $('#sst-import').addEventListener('click',()=>$('#sst-file').click());
  $('#sst-file').addEventListener('change',importData);
  $('#sst-generate').addEventListener('click',generate);
  $('#sst-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();generate();}});
}
function toast(message){
  if(window.toastr?.info) window.toastr.info(message);
  else console.info('[Side Story]',message);
}
function render(){
  if(!$('#sst-overlay')) return;
  const s=settings(),t=getTheater(s);
  $('#sst-tabs').innerHTML=s.theaters.map(x=>`<button class="sst-tab ${x.id===t.id?'active':''}" data-id="${esc(x.id)}">${esc(x.title)}</button>`).join('');
  $('#sst-tabs').querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>{s.activeId=b.dataset.id;save();render();}));
  $('#sst-title').value=t.title;
  $('#sst-title').onchange=e=>{t.title=e.target.value;save();render();};
  $('#sst-source').textContent=t.snapshot?`背景快照：${t.snapshot.sourceLabel} · ${new Date(t.snapshot.capturedAt).toLocaleString()}`:'尚未建立主线背景快照';
  $('#sst-messages').innerHTML=t.messages.length?t.messages.map(m=>`<article class="sst-msg ${m.role}"><div class="sst-role">${m.role==='user'?'你':'剧场'}</div><div class="sst-text">${esc(m.content).replace(/\n/g,'<br>')}</div></article>`).join(''):'<div class="sst-empty"><div>🌙</div><strong>这里是主线之外的小小宇宙</strong><span>写下一个脑洞，开启独立番外。</span></div>';
  $('#sst-messages').scrollTop=$('#sst-messages').scrollHeight;
  $('#sst-preset').innerHTML=Object.keys(s.presets).map(k=>`<option ${k===s.activePreset?'selected':''}>${esc(k)}</option>`).join('');
  $('#sst-system').value=s.systemPrompt;$('#sst-rules').value=s.creativeRules;$('#sst-jailbreak').value=s.jailbreakPrompt;
  $('#sst-preset-content').value=s.presets[s.activePreset]||'';$('#sst-lore').value=t.loreSupplement||'';
  $('#sst-capture-character').checked=s.captureCharacter;$('#sst-capture-persona').checked=s.capturePersona;
  $('#sst-capture-chat').checked=s.captureChat;$('#sst-capture-lore').checked=s.captureEmbeddedLore;
  $('#sst-max-history').value=s.maxHistory;
}
async function generate(){
  const s=settings(),t=getTheater(s),input=$('#sst-input').value.trim();
  if(!input)return;
  const c=ctx();
  if(typeof c.generateRaw!=='function'){alert('当前酒馆没有提供 generateRaw()，请检查版本。');return;}
  const button=$('#sst-generate');button.disabled=true;button.textContent='正在生成…';
  try{
    if(!t.snapshot)t.snapshot=makeSnapshot(s);
    const previous=t.messages.slice(-s.maxTheaterTurns).map(m=>`${m.role==='user'?'用户':'剧场'}：${m.content}`).join('\n\n');
    const system=[s.systemPrompt,s.creativeRules,s.jailbreakPrompt,s.presets[s.activePreset]||''].filter(Boolean).join('\n\n');
    const prompt=[
      '【独立番外背景快照】\n'+(t.snapshot.text||'未提供主线背景'),
      '【本剧场补充世界书与设定】\n'+(t.loreSupplement||'无'),
      '【本剧场此前对话】\n'+(previous||'这是本剧场的第一轮'),
      '【用户本轮要求】\n'+input,
      '请只在本番外空间内延续，不要声称这些事件已经发生在主线。'
    ].join('\n\n');
    const result=await c.generateRaw({systemPrompt:system,prompt});
    if(!result)throw new Error('模型没有返回内容，请检查 API 连接与中转配置。');
    t.messages.push({role:'user',content:input,time:Date.now()},{role:'assistant',content:String(result),time:Date.now()});
    $('#sst-input').value='';save();render();
  }catch(err){console.error('[Side Story]',err);alert('生成失败：'+(err?.message||err));}
  finally{button.disabled=false;button.textContent='生成剧场 ✦';}
}
function exportData(){
  const s=settings(),blob=new Blob([JSON.stringify({version:'0.3.0',theaters:s.theaters,presets:s.presets},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='side-story-backup.json';a.click();URL.revokeObjectURL(a.href);
}
async function importData(e){
  const f=e.target.files?.[0];if(!f)return;
  try{const data=JSON.parse(await f.text()),s=settings();if(Array.isArray(data.theaters))s.theaters=data.theaters;if(data.presets&&typeof data.presets==='object')s.presets=data.presets;s.activeId=null;save();render();toast('剧场数据导入成功');}
  catch(err){alert('导入失败：文件格式不正确。');}
  e.target.value='';
}
function init(){
  if(!window.SillyTavern?.getContext){console.warn('[Side Story] SillyTavern context not ready');return;}
  settings();ensureUI();
  const c=ctx();
  c.eventSource?.on?.('APP_READY',ensureUI);
  console.log('[Side Story] v0.3.0 loaded');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();