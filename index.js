(() => {
'use strict';

const KEY = 'side_story_theater';
const DEFAULTS = {
  systemPrompt: '你是一位擅长角色扮演与同人创作的小说作者。尊重提供的人物设定、关系、世界观和时间线。',
  creativeRules: '本次内容是独立番外，不是主线已经发生的事实。不要修改、总结或声称写入主线记忆。保持角色言行符合设定。',
  jailbreakPrompt: '',
  customPrompt: '',
  generationMode: 'quiet',
  apiChoice: 'primary',
  secondaryApi: { baseUrl:'', apiKey:'', model:'', temperature:null, maxTokens:null },
  localPresets: [],
  activeLocalPresetId: null,
  scripts: [],
  storyLibrary: [],
  regexRules: [],
  floatPosition: null,
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
        <nav class="sst-library-nav">
          <button data-page="theater" class="active">剧场</button>
          <button data-page="scripts">剧本库</button>
          <button data-page="archive">番外收藏馆</button>
          <button data-page="beautify">正则美化</button>
        </nav>
        <div id="sst-page-theater" class="sst-page active">
          <div id="sst-messages" class="sst-messages"></div>
        </div>
        <section id="sst-page-scripts" class="sst-page" hidden>
          <div class="sst-library-head"><strong>可重复使用的剧本</strong><button id="sst-add-script">＋ 新建剧本</button></div>
          <div id="sst-scripts-list"></div>
          <div id="sst-script-editor" class="sst-editor" hidden>
            <input id="sst-script-title" placeholder="剧本名称">
            <textarea id="sst-script-content" rows="7" placeholder="写下剧本内容、事件设定或开场要求"></textarea>
            <div class="sst-button-row"><button id="sst-save-script">保存剧本</button><button id="sst-cancel-script">取消</button></div>
          </div>
        </section>
        <section id="sst-page-archive" class="sst-page" hidden>
          <div class="sst-library-head"><strong>生成过的番外</strong><input id="sst-archive-search" placeholder="搜索标题或内容"></div>
          <div id="sst-archive-list"></div>
        </section>
        <section id="sst-page-beautify" class="sst-page" hidden>
          <div class="sst-library-head"><strong>输出正则美化规则</strong><button id="sst-add-regex">＋ 添加规则</button></div>
          <div class="sst-button-row"><button id="sst-scan-regex">扫描酒馆全局 / 当前聊天正则</button><button id="sst-import-regex">导入正则 JSON</button><input id="sst-regex-file" type="file" accept=".json,application/json" hidden></div>
          <p class="sst-note">扫描结果会复制到异想剧场的独立规则列表，按来源标记全局或当前聊天。编辑和启用状态不会反向修改酒馆原正则。</p>
          <p class="sst-note">规则只处理剧场显示与归档的输出，不修改主线聊天。请谨慎使用复杂正则，避免灾难性回溯。</p>
          <div id="sst-regex-list"></div>
          <div id="sst-regex-editor" class="sst-editor" hidden>
            <input id="sst-regex-name" placeholder="规则名称">
            <input id="sst-regex-pattern" placeholder="查找正则，例如：\\*\\*(.*?)\\*\\*">
            <input id="sst-regex-replace" placeholder="替换内容，例如：$1">
            <div class="sst-regex-flags">
              <label><input id="sst-regex-global" type="checkbox" checked> 全局 g</label>
              <label><input id="sst-regex-insensitive" type="checkbox"> 忽略大小写 i</label>
              <label><input id="sst-regex-enabled" type="checkbox" checked> 启用</label>
            </div>
            <label>测试文本<textarea id="sst-regex-test" rows="3"></textarea></label>
            <label>预览<textarea id="sst-regex-preview" rows="3" readonly></textarea></label>
            <div class="sst-button-row"><button id="sst-save-regex">保存规则</button><button id="sst-cancel-regex">取消</button></div>
          </div>
        </section>
        <div class="sst-composer">
          <textarea id="sst-input" rows="3" placeholder="写下你想看的番外……"></textarea>
          <div class="sst-compose-actions">
            <select id="sst-generation-mode" aria-label="生成模式">
              <option value="quiet">沿用酒馆提示词预设（Quiet）</option>
              <option value="raw">独立 Raw（不套用 Prompt Manager）</option>
            </select>
            <select id="sst-api-choice" aria-label="模型接口">
              <option value="primary">主 API · 酒馆当前模型</option>
              <option value="secondary">副 API · 备用模型</option>
            </select>
            <button id="sst-generate" class="sst-generate">生成剧场 ✦</button>
          </div>
        </div>
        <section id="sst-settings" class="sst-settings" hidden>
          <div class="sst-settings-head"><strong>剧场设置</strong><button id="sst-settings-close" class="sst-icon-btn">✕</button></div>
          <label>系统提示词<textarea id="sst-system" rows="3"></textarea></label>
          <label>创作规则<textarea id="sst-rules" rows="3"></textarea></label>
          <label>自定义创作提示词<textarea id="sst-custom-prompt" rows="3" placeholder="例如：整体风格偏吐槽、节奏轻快，多写角色之间的互怼。仅作用于异想剧场，不必改动酒馆预设。"></textarea></label>
          <label>额外创作 / 破限提示词<textarea id="sst-jailbreak" rows="3" placeholder="可选：补充创作边界、文风或角色表现要求"></textarea></label>
          <div class="sst-preset-info">
            <strong>异想剧场预设副本</strong>
            <p>导入酒馆导出的 Prompt Manager 预设 JSON 后，会在这里保存一份独立副本。你可以编辑副本中的提示词条目、启用/停用并应用到番外；不会覆盖酒馆原预设。</p>
            <div class="sst-button-row"><button id="sst-import-preset">导入预设 JSON</button><button id="sst-save-preset">将当前配置另存为预设</button><input id="sst-preset-file" type="file" accept=".json,application/json" hidden></div>
            <div id="sst-preset-list"></div>
          </div>
          <div class="sst-preset-info">
            <strong>副 API（可选）</strong>
            <p>主 API 直接沿用酒馆当前连接；副 API 使用独立的 OpenAI 兼容 Chat Completions 接口。API Key 仅保存在本机酒馆扩展设置中，请勿导出或分享设置文件。</p>
            <label>接口基础 URL<input id="sst-secondary-url" type="url" placeholder="https://example.com/v1"></label>
            <label>API Key<input id="sst-secondary-key" type="password" autocomplete="off" placeholder="副 API 密钥"></label>
            <label>模型名称<input id="sst-secondary-model" placeholder="model-name"></label>
            <label>温度<input id="sst-secondary-temperature" type="number" min="0" max="2" step="0.05" placeholder="留空使用模型默认值"></label>
            <label>最大输出 Token<input id="sst-secondary-max-tokens" type="number" min="1" step="1" placeholder="留空使用模型默认值"></label>
            <button id="sst-save-secondary">保存副 API</button>
          </div>
          <div class="sst-preset-info">
            <strong>酒馆原生提示词预设</strong>
            <p>这里不再创建假冒的酒馆预设。Chat Completion 使用 AI Response Configuration 中的 Prompt Manager；Text Completion 使用 Advanced Formatting。选择 Quiet 模式时，生成请求会经过酒馆当前配置；Raw 模式则只使用本剧场自行组装的提示词。</p>
          </div>
          <label>补充世界书 / 额外设定<textarea id="sst-lore" rows="5" placeholder="可粘贴世界书条目或跨作品角色资料"></textarea></label>
          <div class="sst-settings-grid">
            <label><input type="checkbox" id="sst-capture-character"> 读取角色卡</label>
            <label><input type="checkbox" id="sst-capture-persona"> 读取 User Persona</label>
            <label><input type="checkbox" id="sst-capture-chat"> 读取主线聊天记录</label>
            <label><input type="checkbox" id="sst-capture-lore"> 读取角色卡内嵌世界书</label>
          </div>
          <label>读取最近主线消息数<input id="sst-max-history" type="number" min="1" max="200"></label>
          <p class="sst-note">主线背景快照只读保存。Quiet 模式会使用酒馆当前聊天上下文及当前 Prompt Manager / Advanced Formatting（主线不会被写入），因此适合沿用角色卡、世界书与酒馆预设；Raw 模式只发送本剧场快照和剧场历史，隔离性更强，但不会自动套用酒馆 Prompt Manager 的提示词列表。</p>
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
  bindLibrary();
  bindDraggableFloat(float);
  overlay.querySelectorAll('.sst-library-nav [data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
  render();
}
function bindToolbarButton(){
  // Use the Extensions menu rather than injecting into the crowded top icon strip.
  const add=()=>{
    const menu=$('#extensionsMenu')||$('#extensions-menu');
    if(!menu||$('#sst-toolbar-open')) return;
    const b=document.createElement('div');
    b.id='sst-toolbar-open';b.className='list-group-item flex-container flexGap5 interactable';
    b.setAttribute('role','button');b.tabIndex=0;
    b.innerHTML='<i class="fa-solid fa-masks-theater"></i><span>异想剧场</span>';
    b.addEventListener('click',openOverlay);
    b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openOverlay();}});
    menu.append(b);
  };
  add();
  const mo=new MutationObserver(add);
  mo.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>mo.disconnect(),15000);
}
function bindDraggableFloat(el){
  const s=settings();
  if(s.floatPosition && Number.isFinite(s.floatPosition.x) && Number.isFinite(s.floatPosition.y)){
    el.style.left=s.floatPosition.x+'px';el.style.top=s.floatPosition.y+'px';el.style.right='auto';el.style.bottom='auto';
  }
  let sx=0,sy=0,ox=0,oy=0,moved=false;
  el.addEventListener('pointerdown',e=>{
    const r=el.getBoundingClientRect();sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;moved=false;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove',e=>{
    if(!el.hasPointerCapture(e.pointerId))return;
    const dx=e.clientX-sx,dy=e.clientY-sy;
    if(Math.abs(dx)+Math.abs(dy)>7)moved=true;
    if(!moved)return;
    const x=Math.max(4,Math.min(innerWidth-el.offsetWidth-4,ox+dx));
    const y=Math.max(4,Math.min(innerHeight-el.offsetHeight-4,oy+dy));
    el.style.left=x+'px';el.style.top=y+'px';el.style.right='auto';el.style.bottom='auto';
  });
  el.addEventListener('pointerup',()=>{
    if(moved){
      const r=el.getBoundingClientRect();
      s.floatPosition={x:Math.max(4,Math.min(innerWidth-el.offsetWidth-4,r.left)),y:Math.max(4,Math.min(innerHeight-el.offsetHeight-4,r.top))};
      save();
    }
  });
  el.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopImmediatePropagation();moved=false;}},true);
}
function showPage(page){
  document.querySelectorAll('#sst-overlay .sst-page').forEach(p=>{p.hidden=p.id!=='sst-page-'+page;p.classList.toggle('active',p.id==='sst-page-'+page);});
  document.querySelectorAll('#sst-overlay .sst-library-nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='scripts')renderScripts();
  if(page==='archive')renderArchive();
  if(page==='beautify')renderRegexRules();
}
function bindSettings(){
  const s=settings();
  const set=(id,key,parse=v=>v)=>{$(id).addEventListener('change',e=>{s[key]=parse(e.target.type==='checkbox'?e.target.checked:e.target.value);save();});};
  set('#sst-system','systemPrompt');set('#sst-rules','creativeRules');set('#sst-jailbreak','jailbreakPrompt');set('#sst-custom-prompt','customPrompt');
  set('#sst-capture-character','captureCharacter',Boolean);set('#sst-capture-persona','capturePersona',Boolean);
  set('#sst-capture-chat','captureChat',Boolean);set('#sst-capture-lore','captureEmbeddedLore',Boolean);
  set('#sst-max-history','maxHistory',v=>Math.max(1,Math.min(200,Number(v)||30)));
  $('#sst-generation-mode').value=s.generationMode||'quiet';
  $('#sst-generation-mode').addEventListener('change',e=>{s.generationMode=e.target.value;save();});
  $('#sst-api-choice').value=s.apiChoice||'primary';
  $('#sst-api-choice').addEventListener('change',e=>{s.apiChoice=e.target.value;save();});
  $('#sst-secondary-url').value=s.secondaryApi?.baseUrl||'';
  $('#sst-secondary-key').value=s.secondaryApi?.apiKey||'';
  $('#sst-secondary-model').value=s.secondaryApi?.model||'';
  $('#sst-secondary-temperature').value=s.secondaryApi?.temperature??'';
  $('#sst-secondary-max-tokens').value=s.secondaryApi?.maxTokens??'';
  $('#sst-save-secondary').addEventListener('click',()=>{
    s.secondaryApi={baseUrl:$('#sst-secondary-url').value.trim().replace(/\/$/,''),apiKey:$('#sst-secondary-key').value.trim(),model:$('#sst-secondary-model').value.trim(),temperature:$('#sst-secondary-temperature').value===''?null:Number($('#sst-secondary-temperature').value),maxTokens:$('#sst-secondary-max-tokens').value===''?null:Number($('#sst-secondary-max-tokens').value)};
    save();toast('副 API 配置已保存');
  });
  $('#sst-import-preset').addEventListener('click',()=>$('#sst-preset-file').click());
  $('#sst-preset-file').addEventListener('change',importLocalPreset);
  $('#sst-save-preset').addEventListener('click',saveLocalPreset);
  renderLocalPresets();
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

function bindLibrary(){
  $('#sst-add-script').addEventListener('click',()=>{$('#sst-script-editor').hidden=false;$('#sst-script-editor').dataset.id='';$('#sst-script-title').value='';$('#sst-script-content').value='';});
  $('#sst-cancel-script').addEventListener('click',()=>$('#sst-script-editor').hidden=true);
  $('#sst-save-script').addEventListener('click',()=>{
    const s=settings(),name=$('#sst-script-title').value.trim(),content=$('#sst-script-content').value.trim();
    if(!name||!content){alert('请填写剧本名称和内容');return;}
    const editId=$('#sst-script-editor').dataset.id;
    if(editId){const old=s.scripts.find(x=>x.id===editId);if(old){old.name=name;old.content=content;old.updatedAt=Date.now();}}
    else s.scripts.push({id:uuid(),name,content,createdAt:Date.now()});
    $('#sst-script-editor').dataset.id='';save();$('#sst-script-editor').hidden=true;renderScripts();
  });
  $('#sst-archive-search').addEventListener('input',renderArchive);
  $('#sst-add-regex').addEventListener('click',()=>openRegexEditor());
  $('#sst-scan-regex').addEventListener('click',scanTavernRegex);
  $('#sst-import-regex').addEventListener('click',()=>$('#sst-regex-file').click());
  $('#sst-regex-file').addEventListener('change',importRegexFile);
  $('#sst-cancel-regex').addEventListener('click',()=>$('#sst-regex-editor').hidden=true);
  $('#sst-save-regex').addEventListener('click',()=>{
    const s=settings(),rule={id:$('#sst-regex-editor').dataset.id||uuid(),name:$('#sst-regex-name').value.trim()||'未命名规则',
      pattern:$('#sst-regex-pattern').value,replace:$('#sst-regex-replace').value,
      global:$('#sst-regex-global').checked,insensitive:$('#sst-regex-insensitive').checked,enabled:$('#sst-regex-enabled').checked};
    try{new RegExp(rule.pattern,(rule.global?'g':'')+(rule.insensitive?'i':''));}
    catch(e){alert('正则表达式无效：'+e.message);return;}
    const i=s.regexRules.findIndex(x=>x.id===rule.id);if(i>=0)s.regexRules[i]=rule;else s.regexRules.push(rule);
    save();$('#sst-regex-editor').hidden=true;renderRegexRules();
  });
  ['sst-regex-pattern','sst-regex-replace','sst-regex-test','sst-regex-global','sst-regex-insensitive'].forEach(id=>$('#'+id).addEventListener('input',previewRegex));
  ['sst-regex-global','sst-regex-insensitive'].forEach(id=>$('#'+id).addEventListener('change',previewRegex));
}
function renderScripts(){
  const s=settings(),el=$('#sst-scripts-list');
  el.innerHTML=s.scripts.length?s.scripts.map(x=>`<article class="sst-library-card"><strong>${esc(x.name)}</strong><p>${esc(x.content.slice(0,240))}</p><div class="sst-button-row"><button data-use-script="${esc(x.id)}">用于当前剧场</button><button data-edit-script="${esc(x.id)}">编辑</button><button data-delete-script="${esc(x.id)}">删除</button></div></article>`).join(''):'<div class="sst-empty-small">还没有保存的剧本。可以把常用脑洞、事件设定或开场词保存到这里。</div>';
  el.querySelectorAll('[data-use-script]').forEach(b=>b.addEventListener('click',()=>{const x=s.scripts.find(a=>a.id===b.dataset.useScript);if(x){$('#sst-input').value=x.content;showPage('theater');}}));
  el.querySelectorAll('[data-edit-script]').forEach(b=>b.addEventListener('click',()=>{const x=s.scripts.find(a=>a.id===b.dataset.editScript);if(x){$('#sst-script-editor').dataset.id=x.id;$('#sst-script-title').value=x.name;$('#sst-script-content').value=x.content;$('#sst-script-editor').hidden=false;}}));
  el.querySelectorAll('[data-delete-script]').forEach(b=>b.addEventListener('click',()=>{if(confirm('删除这个剧本？')){s.scripts=s.scripts.filter(a=>a.id!==b.dataset.deleteScript);save();renderScripts();}}));
}
function renderArchive(){
  const s=settings(),q=($('#sst-archive-search').value||'').toLowerCase();
  const items=s.storyLibrary.filter(x=>(x.title+' '+x.content).toLowerCase().includes(q)).slice().reverse();
  const el=$('#sst-archive-list');
  el.innerHTML=items.length?items.map(x=>`<article class="sst-library-card"><strong>${esc(x.title)}</strong><small>${new Date(x.createdAt).toLocaleString()}</small><p>${esc(x.content.slice(0,320))}</p><div class="sst-button-row"><button data-open-story="${esc(x.id)}">阅读全文</button><button data-copy-story="${esc(x.id)}">复制</button><button data-delete-story="${esc(x.id)}">删除</button></div><div class="sst-full-story" id="sst-story-${esc(x.id)}" hidden>${esc(x.content).replace(/\\n/g,'<br>')}</div></article>`).join(''):'<div class="sst-empty-small">还没有生成记录。以后生成的番外会自动归档在这里。</div>';
  el.querySelectorAll('[data-open-story]').forEach(b=>b.addEventListener('click',()=>{const d=$('#sst-story-'+b.dataset.openStory);d.hidden=!d.hidden;}));
  el.querySelectorAll('[data-copy-story]').forEach(b=>b.addEventListener('click',()=>{const x=s.storyLibrary.find(a=>a.id===b.dataset.copyStory);if(x)navigator.clipboard?.writeText(x.content).then(()=>toast('已复制'));}));
  el.querySelectorAll('[data-delete-story]').forEach(b=>b.addEventListener('click',()=>{if(confirm('删除这条番外归档？')){s.storyLibrary=s.storyLibrary.filter(a=>a.id!==b.dataset.deleteStory);save();renderArchive();}}));
}
function openRegexEditor(rule=null){
  const ed=$('#sst-regex-editor');ed.hidden=false;ed.dataset.id=rule?.id||'';
  $('#sst-regex-name').value=rule?.name||'';$('#sst-regex-pattern').value=rule?.pattern||'';
  $('#sst-regex-replace').value=rule?.replace||'';$('#sst-regex-global').checked=rule?.global!==false;
  $('#sst-regex-insensitive').checked=!!rule?.insensitive;$('#sst-regex-enabled').checked=rule?.enabled!==false;
  $('#sst-regex-test').value='';$('#sst-regex-preview').value='';previewRegex();
}
function applyRegex(text){
  let out=String(text);
  for(const r of settings().regexRules){if(!r.enabled)continue;try{out=out.replace(new RegExp(r.pattern,(r.global?'g':'')+(r.insensitive?'i':'')),r.replace);}catch(e){console.warn('[Side Story] Invalid regex',r.name,e);}}
  return out;
}
function previewRegex(){
  try{
    const flags=($('#sst-regex-global').checked?'g':'')+($('#sst-regex-insensitive').checked?'i':'');
    const re=new RegExp($('#sst-regex-pattern').value,flags);
    $('#sst-regex-preview').value=$('#sst-regex-test').value.replace(re,$('#sst-regex-replace').value);
  }catch(e){$('#sst-regex-preview').value='正则错误：'+e.message;}
}
function renderRegexRules(){
  const s=settings(),el=$('#sst-regex-list');
  el.innerHTML=s.regexRules.length?s.regexRules.map(r=>`<article class="sst-library-card"><label class="sst-inline-check"><input type="checkbox" data-regex-toggle="${esc(r.id)}" ${r.enabled?'checked':''}> ${esc(r.name)}</label><small>${esc(r.source||'异想剧场自定义')} · /${esc(r.pattern)}/${r.global?'g':''}${r.insensitive?'i':''} → ${esc(r.replace)}</small><div class="sst-button-row"><button data-edit-regex="${esc(r.id)}">编辑</button><button data-delete-regex="${esc(r.id)}">删除</button></div></article>`).join(''):'<div class="sst-empty-small">还没有美化规则。</div>';
  el.querySelectorAll('[data-regex-toggle]').forEach(b=>b.addEventListener('change',()=>{const r=s.regexRules.find(x=>x.id===b.dataset.regexToggle);if(r){r.enabled=b.checked;save();}}));
  el.querySelectorAll('[data-edit-regex]').forEach(b=>b.addEventListener('click',()=>openRegexEditor(s.regexRules.find(x=>x.id===b.dataset.editRegex))));
  el.querySelectorAll('[data-delete-regex]').forEach(b=>b.addEventListener('click',()=>{s.regexRules=s.regexRules.filter(x=>x.id!==b.dataset.deleteRegex);save();renderRegexRules();}));
}

function activePresetPrompt(s){
  const preset=(s.localPresets||[]).find(x=>x.id===s.activeLocalPresetId);
  if(!preset)return '';
  return (preset.prompts||[]).filter(x=>x.enabled!==false && x.content).map(x=>`【导入预设：${x.name||'Prompt'}】\n${x.content}`).join('\n\n');
}
function renderLocalPresets(){
  const el=$('#sst-preset-list');if(!el)return;const s=settings();
  el.innerHTML=(s.localPresets||[]).map(p=>`<article class="sst-library-card"><label class="sst-inline-check"><input type="radio" name="sst-active-preset" data-activate-preset="${esc(p.id)}" ${s.activeLocalPresetId===p.id?'checked':''}> ${esc(p.name)}</label><small>${(p.prompts||[]).length} 个提示词条目 · 独立副本</small><div class="sst-button-row"><button data-edit-preset="${esc(p.id)}">编辑条目</button><button data-delete-preset="${esc(p.id)}">删除</button></div></article>`).join('')||'<small>尚未导入预设副本。</small>';
  el.querySelectorAll('[data-activate-preset]').forEach(b=>b.addEventListener('change',()=>{s.activeLocalPresetId=b.dataset.activatePreset;save();toast('番外预设副本已启用');}));
  el.querySelectorAll('[data-delete-preset]').forEach(b=>b.addEventListener('click',()=>{if(confirm('删除这份异想剧场预设副本？酒馆原预设不会受影响。')){s.localPresets=s.localPresets.filter(x=>x.id!==b.dataset.deletePreset);if(s.activeLocalPresetId===b.dataset.deletePreset)s.activeLocalPresetId=null;save();renderLocalPresets();}}));
  el.querySelectorAll('[data-edit-preset]').forEach(b=>b.addEventListener('click',()=>editLocalPreset(s.localPresets.find(x=>x.id===b.dataset.editPreset))));
}
function extractPresetPrompts(data){
  const arr=Array.isArray(data?.prompts)?data.prompts:Array.isArray(data?.entries)?data.entries:[];
  return arr.map((p,i)=>({id:String(p.identifier||p.id||i),name:p.name||p.identifier||`提示词 ${i+1}`,role:p.role||'system',content:String(p.content??p.prompt??p.text??''),enabled:p.enabled!==false && p.injection_position!==-1})).filter(x=>x.content.trim());
}
async function importLocalPreset(e){
  const f=e.target.files?.[0];if(!f)return;
  try{const data=JSON.parse(await f.text());const prompts=extractPresetPrompts(data);if(!prompts.length)throw new Error('没有识别到 prompts/entries 提示词条目。');
    const s=settings(),p={id:uuid(),name:data.name||f.name.replace(/\.json$/i,''),prompts,source:'import',createdAt:Date.now()};s.localPresets.push(p);s.activeLocalPresetId=p.id;const embedded=data.extensions?.regex_scripts||data.regex_scripts||[];if(Array.isArray(embedded))embedded.forEach((r,i)=>{const rule=normalizeRegexRule(r,'预设内嵌正则',i);if(rule)s.regexRules.push(rule);});save();renderLocalPresets();toast(`已导入 ${prompts.length} 个提示词条目副本`);
  }catch(err){alert('预设导入失败：'+err.message+'。请使用酒馆导出的 Chat Completion Prompt Manager 预设 JSON。');}finally{e.target.value='';}
}
function saveLocalPreset(){
  const s=settings(),name=prompt('给当前异想剧场配置起个名字');if(!name)return;
  const prompts=[{id:'custom',name:'自定义创作提示词',role:'system',content:s.customPrompt||'',enabled:true},{id:'rules',name:'创作规则',role:'system',content:s.creativeRules||'',enabled:true},{id:'jailbreak',name:'额外创作提示词',role:'system',content:s.jailbreakPrompt||'',enabled:!!s.jailbreakPrompt}].filter(x=>x.content);
  const p={id:uuid(),name,prompts,source:'local',createdAt:Date.now()};s.localPresets.push(p);s.activeLocalPresetId=p.id;save();renderLocalPresets();
}
function editLocalPreset(p){
  if(!p)return;for(const item of p.prompts||[]){const enabled=confirm(`条目：${item.name}\n当前：${item.enabled===false?'停用':'启用'}\n点击“确定”保持/设为启用，点击“取消”停用。`);item.enabled=enabled;
    const content=prompt(`编辑提示词内容：${item.name}`,item.content);if(content!==null)item.content=content;}
  save();renderLocalPresets();
}
async function callSecondaryApi(s,system,prompt){
  const a=s.secondaryApi||{};if(!a.baseUrl||!a.model)throw new Error('请先填写副 API 的基础 URL 和模型名称。');
  const url=a.baseUrl.replace(/\/$/,'')+'/chat/completions';
  const body={model:a.model,messages:[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}],stream:false};
  if(a.temperature!==null&&a.temperature!==undefined)body.temperature=a.temperature;
  if(a.maxTokens)body.max_tokens=a.maxTokens;
  const headers={'Content-Type':'application/json'};if(a.apiKey)headers.Authorization='Bearer '+a.apiKey;
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});
  if(!response.ok)throw new Error(`副 API 请求失败（HTTP ${response.status}）：${(await response.text()).slice(0,500)}`);
  const data=await response.json();const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.map(x=>x.text||'').join('');
  throw new Error('副 API 返回格式不是兼容 OpenAI 的 choices[0].message.content。');
}
function normalizeRegexRule(r,source,index){
  const pattern=r.findRegex??r.pattern??r.regex??r.find??'';if(!pattern)return null;
  let raw=String(pattern),flags='';const m=raw.match(/^\/(.*)\/([gimsuy]*)$/);if(m){raw=m[1];flags=m[2];}
  return {id:uuid(),name:r.scriptName||r.name||`酒馆正则 ${index+1}`,pattern:raw,replace:String(r.replaceString??r.replace??r.replacement??''),global:flags.includes('g')||r.markdownOnly===false||r.global===true,insensitive:flags.includes('i'),enabled:r.disabled!==true&&r.enabled!==false,source};
}
function collectRegexArrays(root,source,out,seen=new Set(),depth=0){
  if(!root||typeof root!=='object'||depth>6||seen.has(root))return;seen.add(root);
  if(Array.isArray(root)){if(root.some(x=>x&&typeof x==='object'&&('findRegex'in x||'pattern'in x||'regex'in x)))root.forEach((x,i)=>{const n=normalizeRegexRule(x,source,i);if(n)out.push(n);});else root.forEach(x=>collectRegexArrays(x,source,out,seen,depth+1));return;}
  for(const [k,v] of Object.entries(root)){if(/regex/i.test(k))collectRegexArrays(v,source,out,seen,depth+1);}
}
function scanTavernRegex(){
  const c=ctx(),out=[];const globalCandidates=[window.extension_settings?.regex,window.extension_settings?.regex_scripts,c?.extensionSettings?.regex,c?.extensionSettings?.regex_scripts,window.power_user?.regex_scripts];
  globalCandidates.forEach(x=>collectRegexArrays(x,'酒馆全局',out));
  const localCandidates=[c?.chatMetadata?.regex_scripts,c?.chatMetadata?.extensions?.regex_scripts,c?.chatMetadata?.regex,c?.chatMetadata?.extensions?.regex];
  localCandidates.forEach(x=>collectRegexArrays(x,'当前聊天',out));
  const s=settings(),known=new Set(s.regexRules.map(x=>x.name+'|'+x.pattern+'|'+x.source));let added=0;
  out.forEach(x=>{const k=x.name+'|'+x.pattern+'|'+x.source;if(!known.has(k)){s.regexRules.push(x);known.add(k);added++;}});
  save();renderRegexRules();toast(added?`扫描完成，复制 ${added} 条规则；未改动酒馆原规则。`:'没有发现新的可识别正则。可导出酒馆正则 JSON 后手动导入。');
}
async function importRegexFile(e){
  const f=e.target.files?.[0];if(!f)return;
  try{const data=JSON.parse(await f.text()),list=Array.isArray(data)?data:(data.regex_scripts||data.scripts||data.regexScripts||[]);if(!Array.isArray(list))throw new Error('文件中没有识别到正则数组');
    const s=settings();list.forEach((r,i)=>{const n=normalizeRegexRule(r,'导入文件',i);if(n)s.regexRules.push(n);});save();renderRegexRules();toast('正则规则已复制到异想剧场');
  }catch(err){alert('正则导入失败：'+err.message);}finally{e.target.value='';}
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
  $('#sst-generation-mode').value=s.generationMode||'quiet';
  $('#sst-api-choice').value=s.apiChoice||'primary';
  $('#sst-system').value=s.systemPrompt;$('#sst-rules').value=s.creativeRules;$('#sst-jailbreak').value=s.jailbreakPrompt;$('#sst-custom-prompt').value=s.customPrompt||'';
  $('#sst-lore').value=t.loreSupplement||'';
  $('#sst-capture-character').checked=s.captureCharacter;$('#sst-capture-persona').checked=s.capturePersona;
  $('#sst-capture-chat').checked=s.captureChat;$('#sst-capture-lore').checked=s.captureEmbeddedLore;
  $('#sst-max-history').value=s.maxHistory;
}
async function generate(){
  const s=settings(),t=getTheater(s),input=$('#sst-input').value.trim();
  if(!input)return;
  const c=ctx(),mode=$('#sst-generation-mode').value;
  const button=$('#sst-generate');button.disabled=true;button.textContent='正在生成…';
  try{
    if(!t.snapshot)t.snapshot=makeSnapshot(s);
    const previous=t.messages.slice(-s.maxTheaterTurns).map(m=>`${m.role==='user'?'用户':'剧场'}：${m.content}`).join('\n\n');
    const system=[s.systemPrompt,s.creativeRules,s.customPrompt,s.jailbreakPrompt,activePresetPrompt(s)].filter(Boolean).join('\n\n');
    const prompt=[
      '【独立番外背景快照】\n'+(t.snapshot.text||'未提供主线背景'),
      '【本剧场补充世界书与设定】\n'+(t.loreSupplement||'无'),
      '【本剧场此前对话】\n'+(previous||'这是本剧场的第一轮'),
      '【用户本轮要求】\n'+input,
      '请只在本番外空间内延续，不要声称这些事件已经发生在主线。'
    ].join('\n\n');
    let result;
    if((s.apiChoice||'primary')==='secondary'){
      result=await callSecondaryApi(s,system,prompt);
    }else if(mode==='quiet'){
      if(typeof c.generateQuietPrompt!=='function')throw new Error('当前酒馆未提供 generateQuietPrompt()。');
      result=await c.generateQuietPrompt({quietPrompt:[system,prompt].filter(Boolean).join('\n\n')});
    }else{
      if(typeof c.generateRaw!=='function')throw new Error('当前酒馆未提供 generateRaw()。');
      result=await c.generateRaw({systemPrompt:system,prompt});
    }
    if(!result)throw new Error('模型没有返回内容，请检查 API 连接与中转配置。');
    const raw=String(result),beautified=applyRegex(raw);
    t.messages.push({role:'user',content:input,time:Date.now()},{role:'assistant',content:beautified,rawContent:raw,time:Date.now()});
    s.storyLibrary.push({id:uuid(),title:(input.length>36?input.slice(0,36)+'…':input),content:beautified,rawContent:raw,theaterId:t.id,createdAt:Date.now()});
    $('#sst-input').value='';save();render();
  }catch(err){console.error('[Side Story]',err);alert('生成失败：'+(err?.message||err));}
  finally{button.disabled=false;button.textContent='生成剧场 ✦';}
}
function exportData(){
  const s=settings(),blob=new Blob([JSON.stringify({version:'0.5.0',theaters:s.theaters,scripts:s.scripts,storyLibrary:s.storyLibrary,regexRules:s.regexRules,localPresets:s.localPresets,customPrompt:s.customPrompt,apiChoice:s.apiChoice},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='side-story-backup.json';a.click();URL.revokeObjectURL(a.href);
}
async function importData(e){
  const f=e.target.files?.[0];if(!f)return;
  try{const data=JSON.parse(await f.text()),s=settings();if(Array.isArray(data.theaters))s.theaters=data.theaters;if(Array.isArray(data.scripts))s.scripts=data.scripts;if(Array.isArray(data.storyLibrary))s.storyLibrary=data.storyLibrary;if(Array.isArray(data.regexRules))s.regexRules=data.regexRules;if(Array.isArray(data.localPresets))s.localPresets=data.localPresets;if(typeof data.customPrompt==='string')s.customPrompt=data.customPrompt;s.activeId=null;save();render();toast('剧场数据导入成功');}
  catch(err){alert('导入失败：文件格式不正确。');}
  e.target.value='';
}
function init(){
  if(!window.SillyTavern?.getContext){console.warn('[Side Story] SillyTavern context not ready');return;}
  settings();ensureUI();
  const c=ctx();
  c.eventSource?.on?.('APP_READY',ensureUI);
  console.log('[Side Story] v0.4.0 loaded');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();