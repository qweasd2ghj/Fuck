(() => {
'use strict';

const KEY = 'side_story_theater';
const VERSION = '0.6.3';
let secondaryKeySession = '';
let nativePresetRows = [];
let presetSearch = '';
let currentEditCopyId = null;
let compatScan = [];

const DEFAULTS = {
  systemPrompt: '你是一位擅长角色扮演与同人创作的小说作者。尊重人物设定、关系、世界观和时间线。',
  creativeRules: '本次内容是独立番外，不是主线已经发生的事实。不要修改、总结或声称写入主线记忆。保持角色言行符合设定。',
  jailbreakPrompt: '', customPrompt: '', generationMode: 'quiet', apiChoice: 'primary',
  secondaryApi: { baseUrl: '', model: '', temperature: null, maxTokens: null },
  localPresets: [], activeLocalPresetId: null, scripts: [], storyLibrary: [], regexRules: [],
  floatPosition: null, theaters: [], activeId: null, maxHistory: 30, maxTheaterTurns: 24,
  captureChat: true, captureCharacter: true, capturePersona: true, captureEmbeddedLore: true,
  modelProfiles: {}, compatibilityNotes: [],
};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clone = v => structuredClone(v);
const ctx = () => window.SillyTavern?.getContext?.();
function settings() {
  const c = ctx();
  if (!c) throw new Error('没有取得 SillyTavern 上下文');
  c.extensionSettings ||= {};
  c.extensionSettings[KEY] ||= clone(DEFAULTS);
  const s = c.extensionSettings[KEY];
  for (const [k,v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = clone(v);
  s.secondaryApi ||= clone(DEFAULTS.secondaryApi);
  s.modelProfiles ||= {}; s.localPresets ||= []; s.regexRules ||= []; s.theaters ||= [];
  // Migrate the old setting without leaving the secret in exported extension settings.
  if (!secondaryKeySession && s.secondaryApi.apiKey) secondaryKeySession = String(s.secondaryApi.apiKey);
  if (Object.hasOwn(s.secondaryApi, 'apiKey')) { delete s.secondaryApi.apiKey; save(); }
  return s;
}
function save() { ctx()?.saveSettingsDebounced?.(); }
function toast(msg) { if (window.toastr?.info) window.toastr.info(msg); else console.info('[异想剧场]', msg); }
function characterData(c) {
  const card = c?.characters?.[c.characterId];
  if (!card) return null;
  const d = card.data || card;
  return { name: card.name || d.name || '未命名角色', description:d.description||'', personality:d.personality||'', scenario:d.scenario||'', first_mes:d.first_mes||'', mes_example:d.mes_example||'', creator_notes:d.creator_notes||'', book:d.character_book||d.characterBook||null, raw:card };
}
function snapshot(s) {
  const c = ctx(); const d = characterData(c); const parts = [];
  if (s.captureCharacter) {
    let lore = '';
    if (s.captureEmbeddedLore && d?.book) {
      const entries = Array.isArray(d.book.entries) ? d.book.entries : Object.values(d.book.entries || {});
      lore = entries.filter(x => !x.disable).map(x => `【${x.name || x.keys || '世界书条目'}】\n${x.content || ''}`).join('\n\n');
    }
    parts.push(`【角色卡】\n角色：${d?.name || '未选择角色'}\n描述：${d?.description || ''}\n性格：${d?.personality || ''}\n场景：${d?.scenario || ''}\n开场白：${d?.first_mes || ''}\n示例：${d?.mes_example || ''}\n创作者注释：${d?.creator_notes || ''}\n角色卡内嵌世界书：\n${lore || '无/未读取'}`);
  }
  if (s.capturePersona) {
    const p = c?.powerUserSettings?.persona_description || c?.personaDescription || c?.persona?.description || '';
    parts.push(`【User Persona】\n${p || '当前上下文未暴露 Persona 描述'}`);
  }
  const worldInfo = c?.worldInfo || c?.world_info || c?.activeWorldInfo || null;
  if (worldInfo) {
    const entries = Array.isArray(worldInfo) ? worldInfo : Object.values(worldInfo.entries || worldInfo);
    const text = entries.filter(x => x && !x.disable && (x.content || x.text)).map(x => `【${x.name || x.comment || '世界书条目'}】\n${x.content || x.text}`).join('\n\n');
    if (text) parts.push('【当前上下文暴露的世界书（只读）】\n' + text);
  }
  if (s.captureChat) {
    const chat = Array.isArray(c?.chat) ? c.chat : [];
    parts.push('【主线聊天只读快照】\n' + chat.slice(-s.maxHistory).map(m => `${m.is_user ? (c.name1 || 'User') : (m.name || c.name2 || '角色')}：${m.mes || m.message || ''}`).join('\n\n'));
  }
  const chatId = c?.chatId || c?.chatMetadata?.chat_id || '当前聊天';
  return { text:parts.join('\n\n'), sourceLabel:`${d?.name || '当前角色'} · ${chatId}`, capturedAt:Date.now() };
}
function activeTheater(s) {
  let t = s.theaters.find(x => x.id === s.activeId);
  if (!t) { t = {id:uid(),title:'新建小剧场',messages:[],createdAt:Date.now(),snapshot:snapshot(s),loreSupplement:''}; s.theaters.unshift(t); s.activeId=t.id; save(); }
  return t;
}
function makeTheater() {
  const s=settings(); const t={id:uid(),title:'新建小剧场',messages:[],createdAt:Date.now(),snapshot:snapshot(s),loreSupplement:''};
  s.theaters.unshift(t); s.activeId=t.id; save(); render();
}

function ensureStyles() {
  if (document.getElementById('sst060-inline-style')) return;
  const style = document.createElement('style'); style.id = 'sst060-inline-style';
  style.textContent = "#sst060-float{position:fixed;right:16px;bottom:calc(22px + env(safe-area-inset-bottom));z-index:99990;width:58px;height:58px;border:0;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(145deg,#9a78c8,#604b87);color:#fff;box-shadow:0 5px 22px #0007;touch-action:none;cursor:grab;font-size:22px}\n#sst060-float small{font-size:10px;line-height:12px}#sst-v060-overlay{position:fixed;inset:0;z-index:100000;display:none;color:#f5eff8;font-family:inherit}#sst-v060-overlay.open{display:block}#sst-v060-overlay .sst060-backdrop{position:absolute;inset:0;background:#09070d}#sst-v060-overlay .sst060-app{position:absolute;inset:0;display:flex;flex-direction:column;background:linear-gradient(180deg,#211c2a,#17141e);padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}#sst-v060-overlay button,#sst-v060-overlay input,#sst-v060-overlay textarea,#sst-v060-overlay select{font:inherit;color:inherit}#sst-v060-overlay button{cursor:pointer}#sst-v060-overlay .sst060-head{height:56px;flex:0 0 56px;display:flex;align-items:center;gap:12px;padding:0 12px;border-bottom:1px solid #ffffff1b}#sst-v060-overlay .sst060-head>div{display:flex;flex-direction:column;flex:1}#sst-v060-overlay .sst060-head small{font-size:10px;color:#b9adca}#sst-v060-overlay .sst060-head button{width:40px;height:38px;border:0;border-radius:10px;background:#ffffff12;font-size:20px}#sst-v060-overlay .sst060-tabs{display:flex;gap:5px;overflow-x:auto;padding:8px;border-bottom:1px solid #ffffff14;flex:0 0 auto}#sst-v060-overlay .sst060-tabs button{white-space:nowrap;border:1px solid #ffffff22;border-radius:99px;background:#ffffff0b;padding:8px 12px;font-size:11px}#sst-v060-overlay .sst060-tabs button.active{background:#8064a9;border-color:#bca0dc}#sst-v060-overlay .sst060-body{display:flex;flex-direction:column;min-height:0;flex:1}#sst-v060-overlay .sst060-page{display:flex;flex-direction:column;gap:10px;min-height:0;flex:1;overflow:auto;padding:10px 12px}#sst-v060-overlay .sst060-page[hidden]{display:none}#sst-v060-overlay .sst060-title{display:flex;flex-direction:column;gap:3px}#sst-v060-overlay #sst060-title{background:transparent;border:0;font-size:16px;font-weight:700;outline:none}#sst-v060-overlay #sst060-source{font-size:10px;color:#a99db6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#sst-v060-overlay .sst060-messages{display:flex;flex:1;min-height:140px;overflow:auto;flex-direction:column;gap:10px;padding:8px;overscroll-behavior:contain}#sst-v060-overlay .sst060-msg{padding:11px 13px;border-radius:14px;line-height:1.65;overflow-wrap:anywhere;font-size:14px}#sst-v060-overlay .sst060-msg.user{align-self:flex-end;max-width:95%;background:#59476d}#sst-v060-overlay .sst060-msg.assistant{align-self:stretch;background:#ffffff0c;border:1px solid #ffffff18}#sst-v060-overlay .sst060-msg b{display:block;font-size:10px;color:#c9b6df;margin-bottom:4px}#sst-v060-overlay .sst060-empty{margin:auto;display:flex;flex-direction:column;align-items:center;gap:8px;color:#b9adc7}#sst-v060-overlay .sst060-empty span{font-size:12px}#sst-v060-overlay .sst060-compose{padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:#211c2a;border-top:1px solid #ffffff1a;display:grid;gap:8px}#sst-v060-overlay #sst060-input{width:100%;resize:vertical;min-height:68px;max-height:25vh;background:#ffffff0c;border:1px solid #ffffff24;border-radius:12px;padding:10px;font-size:14px}#sst-v060-overlay .sst060-actions,#sst-v060-overlay .sst060-row{display:flex;flex-wrap:wrap;gap:7px;align-items:center}#sst-v060-overlay .sst060-actions select{flex:1;min-width:0}#sst-v060-overlay select,#sst-v060-overlay input:not([type=checkbox]):not([type=file]),#sst-v060-overlay textarea{background:#ffffff0d;border:1px solid #ffffff25;border-radius:9px;padding:9px;min-width:0}#sst-v060-overlay .sst060-actions button,#sst-v060-overlay .sst060-row button,#sst-v060-overlay .sst060-card button{border:1px solid #ffffff25;background:#ffffff12;border-radius:9px;padding:9px 11px;font-size:12px}#sst-v060-overlay #sst060-generate{background:linear-gradient(135deg,#a17acb,#75549d);border:0;font-weight:800}#sst-v060-overlay .sst060-card{background:#ffffff09;border:1px solid #ffffff20;border-radius:12px;padding:11px;display:flex;flex-direction:column;gap:9px}#sst-v060-overlay .sst060-card h3{font-size:14px;margin:0}#sst-v060-overlay .sst060-card p,#sst-v060-overlay .sst060-card small,#sst-v060-overlay .sst060-note{font-size:11px;line-height:1.6;color:#c0b4ca;margin:0}#sst-v060-overlay .sst060-card label{display:flex;flex-direction:column;gap:5px;font-size:12px}#sst-v060-overlay .sst060-card label input[type=checkbox]{accent-color:#a17acb}#sst-v060-overlay .sst060-list{display:flex;flex-direction:column;gap:7px}#sst-v060-overlay .sst060-list-item{background:#ffffff09;border:1px solid #ffffff1c;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}#sst-v060-overlay .sst060-list-item small{font-size:10px;color:#b7aabe}#sst-v060-overlay .sst060-list-item p{white-space:pre-wrap}#sst-v060-overlay .sst060-list-item details pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}#sst-v060-overlay .sst060-table-wrap{overflow:auto;max-height:55vh;border:1px solid #ffffff1c;border-radius:9px}#sst-v060-overlay .sst060-table{border-collapse:collapse;width:100%;min-width:560px;font-size:11px}#sst-v060-overlay .sst060-table th,#sst-v060-overlay .sst060-table td{padding:7px;border-bottom:1px solid #ffffff1a;vertical-align:top;text-align:left}#sst-v060-overlay .sst060-table input:not([type=checkbox]),#sst-v060-overlay .sst060-table textarea{width:100%;font-size:11px}#sst-v060-overlay .sst060-table small{display:block;color:#b7aabe;margin-top:4px}#sst-v060-overlay .sst060-param-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}#sst-v060-overlay .sst060-param{display:flex;flex-direction:column;gap:5px;border:1px solid #ffffff1e;border-radius:9px;padding:8px}#sst-v060-overlay .sst060-param b{font-size:12px}#sst-v060-overlay .sst060-param small{font-size:10px;color:#b7aabe}#sst-v060-overlay .sst060-param label{display:flex;flex-direction:row;align-items:center}#sst-v060-overlay .sst060-param input[type=checkbox]{accent-color:#a17acb}@media(min-width:760px){#sst-v060-overlay .sst060-app{width:min(850px,100%);height:min(94dvh,980px);top:50%;left:50%;transform:translate(-50%,-50%);border:1px solid #ffffff2a;border-radius:20px;overflow:hidden;box-shadow:0 20px 90px #000a}#sst-v060-overlay .sst060-backdrop{background:#05030aaf;backdrop-filter:blur(5px)}#sst060-float{right:24px;bottom:28px}}@media(max-width:480px){#sst-v060-overlay .sst060-actions{flex-direction:column}#sst-v060-overlay .sst060-actions>*{width:100%}#sst-v060-overlay .sst060-param-grid{grid-template-columns:1fr}}\n#sst-v060-overlay .sst060-theater-tabs{display:flex;gap:6px;overflow-x:auto;padding:2px 0 5px;scrollbar-width:none}#sst-v060-overlay .sst060-theater-tabs button{white-space:nowrap;border:1px solid #ffffff22;background:#ffffff0b;border-radius:99px;padding:6px 10px;font-size:11px}#sst-v060-overlay .sst060-theater-tabs button.active{background:#755b91;border-color:#bca0dc}\n";
  document.head.append(style);
}

function ensureMagicWandEntry() {
  // SillyTavern's Extensions dropdown is the content opened by the chat-input magic wand.
  // Add a normal dropdown item there; do not inject anything into the top toolbar.
  const menu = document.querySelector('#extensionsMenu');
  if (!menu || document.getElementById('sst060-wand-entry')) return;
  const item = document.createElement('div');
  item.id = 'sst060-wand-entry';
  item.className = 'list-group-item';
  item.setAttribute('role', 'button');
  item.tabIndex = 0;
  item.innerHTML = '<i class="fa-solid fa-masks-theater"></i><span>异想剧场</span>';
  item.title = '打开异想剧场';
  item.addEventListener('click', open);
  item.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  menu.append(item);
}

function mount() {
  ensureStyles();
  ensureMagicWandEntry();
  if ($('#sst-v060-overlay')) return;
  const root = document.createElement('div'); root.id='sst-v060-overlay'; root.setAttribute('aria-hidden','true');
  root.innerHTML = `
    <div class="sst060-backdrop" data-close="1"></div>
    <section class="sst060-app" role="dialog" aria-modal="true" aria-label="异想剧场">
      <header class="sst060-head"><button id="sst060-close">←</button><div><b>🎭 异想剧场</b><small>独立番外空间 · v${VERSION}</small></div><button id="sst060-new">＋</button></header>
      <nav class="sst060-tabs"><button data-page="story" class="active">剧场</button><button data-page="scripts">剧本库</button><button data-page="presets">预设中心</button><button data-page="params">模型参数</button><button data-page="compat">脚本兼容</button><button data-page="archive">收藏馆</button><button data-page="settings">设置</button></nav>
      <main class="sst060-body">
        <section class="sst060-page active" id="sst060-page-story">
          <div id="sst060-theater-tabs" class="sst060-theater-tabs"></div><div class="sst060-title"><input id="sst060-title" aria-label="剧场名称"><span id="sst060-source"></span></div>
          <div id="sst060-messages" class="sst060-messages"></div>
          <div class="sst060-compose"><textarea id="sst060-input" rows="3" placeholder="写下想看的番外……"></textarea><div class="sst060-actions"><select id="sst060-mode"><option value="quiet">Quiet · 沿用当前酒馆提示词上下文</option><option value="raw">Raw · 独立上下文</option></select><select id="sst060-api"><option value="primary">主 API · 当前酒馆连接</option><option value="secondary">副 API · 独立接口</option></select><button id="sst060-generate">生成番外 ✦</button></div></div>
        </section>
        <section class="sst060-page" id="sst060-page-scripts" hidden>
          <div class="sst060-card"><h3>可复用剧本 / 开场设定</h3><label>剧本名称<input id="sst060-script-name" placeholder="例如：雨夜重逢"></label><label>剧本内容<textarea id="sst060-script-content" rows="5" placeholder="保存常用的事件设定、开场词或剧情要求"></textarea></label><div class="sst060-row"><button id="sst060-save-script">保存剧本</button><button id="sst060-clear-script-form">清空输入</button></div><div id="sst060-script-list" class="sst060-list"></div></div>
        </section>
        <section class="sst060-page" id="sst060-page-presets" hidden>
          <div class="sst060-card"><h3>酒馆原生 Prompt Manager 预设</h3><p>扫描结果只读。选择某个原生预设并建立副本后，才可在下方批量编辑；不会覆盖酒馆原文件。</p><div class="sst060-row"><button id="sst060-scan-presets">扫描酒馆预设</button><input id="sst060-preset-search" placeholder="搜索预设 / 条目"></div><div id="sst060-native-presets" class="sst060-list"></div></div>
          <div class="sst060-card"><h3>异想剧场预设副本 · 批量编辑表</h3><div class="sst060-row"><select id="sst060-copy-select"><option value="">选择预设副本</option></select><button id="sst060-import-preset">手动导入 JSON</button><input type="file" id="sst060-preset-file" accept=".json,application/json" hidden></div><div class="sst060-row"><input id="sst060-prompt-filter" placeholder="筛选提示词条目"><button id="sst060-select-all">全选</button><button id="sst060-select-none">全不选</button><button id="sst060-enable-selected">批量启用</button><button id="sst060-disable-selected">批量停用</button><button id="sst060-save-copy">保存全部修改</button></div><div class="sst060-table-wrap"><table class="sst060-table"><thead><tr><th><input type="checkbox" id="sst060-table-all"></th><th>启用</th><th>名称 / 角色</th><th>提示词内容（副本）</th></tr></thead><tbody id="sst060-prompt-rows"></tbody></table></div></div>
        </section>
        <section class="sst060-page" id="sst060-page-params" hidden>
          <div class="sst060-card"><h3>模型参数档案</h3><p>按 API / Provider + Model ID 分别保存。系统不会猜测模型能力；只有你勾选为支持的参数才会发送到副 API。主 API 的参数档案可保存，但不会擅自改写酒馆全局预设。</p><label>最大输出参数字段<select id="sst060-max-token-field"><option value="max_tokens">max_tokens</option><option value="max_completion_tokens">max_completion_tokens</option></select></label><div class="sst060-row"><label>接口类型 / Provider<input id="sst060-provider" placeholder="例如 OpenAI / OpenRouter / Google"></label><label>Model ID<input id="sst060-model-id" placeholder="准确模型 ID"></label></div><div class="sst060-row"><button id="sst060-load-profile">载入此模型档案</button><button id="sst060-save-profile">保存此模型档案</button><button id="sst060-reset-profile">清空档案</button></div><div id="sst060-profile-fields" class="sst060-param-grid"></div><div id="sst060-profile-note" class="sst060-note"></div></div>
          <div class="sst060-card"><h3>副 API 连接</h3><div class="sst060-row"><label>基础 URL<input id="sst060-base-url" placeholder="https://example.com/v1"></label><label>API Key<input id="sst060-api-key" type="password" autocomplete="off" placeholder="仅本次页面会话保存"></label></div><div class="sst060-row"><label>副 API Model ID<input id="sst060-secondary-model" placeholder="model-id"></label><button id="sst060-fetch-models">读取 /models</button></div><div class="sst060-row"><select id="sst060-model-list"><option value="">读取到的模型会列在这里</option></select><button id="sst060-save-api">保存连接设置</button></div><small>API Key 不写入酒馆扩展设置、备份或 ZIP；刷新页面后需重新输入。模型列表读取失败时仍可手动填写 ID。</small></div>
        </section>
        <section class="sst060-page" id="sst060-page-compat" hidden>
          <div class="sst060-card"><h3>TavernHelper 脚本兼容性检查</h3><p>只识别脚本名称与可见元数据，不读取或复制第三方脚本实现；不自动启停任何脚本。检测不到可靠证据时会标成“待验证”，不会伪装成已验证。</p><div class="sst060-row"><button id="sst060-scan-compat">扫描已安装脚本</button><button id="sst060-add-compat">添加本地备注</button></div><div id="sst060-compat-list" class="sst060-list"></div><p class="sst060-note">已纳入关注项：Kemini 防路由脚本、Kemini「雪融雪降 v2」预设伴随脚本。这里仅记录识别结果和潜在冲突，不包含它们的源代码。</p></div>
        </section>
        <section class="sst060-page" id="sst060-page-archive" hidden><div class="sst060-card"><h3>番外收藏馆</h3><input id="sst060-archive-search" placeholder="搜索标题或内容"><div id="sst060-archive-list" class="sst060-list"></div></div></section>
        <section class="sst060-page" id="sst060-page-settings" hidden>
          <div class="sst060-card"><h3>创作设定</h3><label>系统提示词<textarea id="sst060-system" rows="3"></textarea></label><label>创作规则<textarea id="sst060-rules" rows="3"></textarea></label><label>自定义提示词<textarea id="sst060-custom" rows="3"></textarea></label><label>额外创作 / Jailbreak 提示词<textarea id="sst060-jailbreak" rows="3"></textarea></label><label>补充世界书<textarea id="sst060-lore" rows="4"></textarea></label></div>
          <div class="sst060-card"><h3>主线背景快照（只读）</h3><div class="sst060-row"><label><input type="checkbox" id="sst060-c-char"> 角色卡</label><label><input type="checkbox" id="sst060-c-persona"> Persona</label><label><input type="checkbox" id="sst060-c-chat"> 主线聊天</label><label><input type="checkbox" id="sst060-c-lore"> 内嵌世界书</label></div><label>读取最近消息数<input type="number" id="sst060-history" min="1" max="200"></label><div class="sst060-row"><button id="sst060-refresh-snapshot">刷新当前快照</button><button id="sst060-delete-theater">删除当前剧场</button><button id="sst060-export">导出剧场资料</button><button id="sst060-import">导入剧场资料</button><input type="file" id="sst060-data-file" accept=".json" hidden></div></div>
          <div class="sst060-card"><h3>独立输出正则</h3><button id="sst060-scan-regex">扫描全局 / 当前角色规则并复制</button><button id="sst060-import-regex">导入规则 JSON</button><input type="file" id="sst060-regex-file" accept=".json" hidden><div id="sst060-regex-list" class="sst060-list"></div></div>
        </section>
      </main>
    </section>`;
  document.body.append(root);
  const floater=document.createElement('button'); floater.id='sst060-float'; floater.innerHTML='🎭<small>剧场</small>'; floater.type='button'; floater.title='打开异想剧场'; document.body.append(floater);
  bindUI(root, floater); render();
}
function open() { $('#sst-v060-overlay')?.classList.add('open'); $('#sst-v060-overlay')?.setAttribute('aria-hidden','false'); render(); }
function close() { $('#sst-v060-overlay')?.classList.remove('open'); $('#sst-v060-overlay')?.setAttribute('aria-hidden','true'); }
function bindUI(root, floater) {
  $('#sst060-close').onclick=close; $('#sst060-new').onclick=makeTheater; floater.onclick=open;
  root.addEventListener('click', e => { if (e.target.dataset.close) close(); });
  document.addEventListener('keydown', e => { if (e.key==='Escape') close(); });
  $$('.sst060-tabs button',root).forEach(b => b.onclick=()=>showPage(b.dataset.page));
  $('#sst060-generate').onclick=generate;
  $('#sst060-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();generate();}});
  $('#sst060-mode').onchange=e=>{settings().generationMode=e.target.value;save();};
  $('#sst060-api').onchange=e=>{settings().apiChoice=e.target.value;save();refreshModelIdentity();};
  $('#sst060-title').onchange=e=>{const t=activeTheater(settings());t.title=e.target.value;save();render();};
  $('#sst060-lore').onchange=e=>{activeTheater(settings()).loreSupplement=e.target.value;save();};
  ['system','rules','custom','jailbreak'].forEach(k=>$('#sst060-'+k).onchange=e=>{const s=settings();s[k==='system'?'systemPrompt':k==='rules'?'creativeRules':k==='custom'?'customPrompt':'jailbreakPrompt']=e.target.value;save();});
  [['char','captureCharacter'],['persona','capturePersona'],['chat','captureChat'],['lore','captureEmbeddedLore']].forEach(([id,key])=>$('#sst060-c-'+id).onchange=e=>{settings()[key]=e.target.checked;save();});
  $('#sst060-history').onchange=e=>{settings().maxHistory=Math.max(1,Math.min(200,Number(e.target.value)||30));save();};
  $('#sst060-refresh-snapshot').onclick=()=>{const t=activeTheater(settings());t.snapshot=snapshot(settings());save();render();toast('背景快照已刷新');};
  $('#sst060-delete-theater').onclick=deleteActiveTheater;
  $('#sst060-save-script').onclick=saveScript; $('#sst060-clear-script-form').onclick=()=>{$('#sst060-script-name').value='';$('#sst060-script-content').value='';};
  $('#sst060-scan-presets').onclick=scanNativePresets;
  $('#sst060-preset-search').oninput=e=>{presetSearch=e.target.value.toLowerCase();renderNativePresets();};
  $('#sst060-copy-select').onchange=renderPromptTable;
  $('#sst060-prompt-filter').oninput=filterPromptRows;
  $('#sst060-select-all').onclick=()=>$$('[data-prompt-select]').forEach(x=>x.checked=true);
  $('#sst060-select-none').onclick=()=>$$('[data-prompt-select]').forEach(x=>x.checked=false);
  $('#sst060-table-all').onchange=e=>$$('[data-prompt-select]').forEach(x=>x.checked=e.target.checked);
  $('#sst060-enable-selected').onclick=()=>batchPromptEnabled(true);
  $('#sst060-disable-selected').onclick=()=>batchPromptEnabled(false);
  $('#sst060-save-copy').onclick=savePromptTable;
  $('#sst060-import-preset').onclick=()=>$('#sst060-preset-file').click();
  $('#sst060-preset-file').onchange=importPresetFile;
  $('#sst060-fetch-models').onclick=fetchModels;
  $('#sst060-save-api').onclick=saveSecondarySettings;
  $('#sst060-model-list').onchange=e=>{if(e.target.value){$('#sst060-secondary-model').value=e.target.value;refreshModelIdentity();}};
  $('#sst060-load-profile').onclick=loadProfile; $('#sst060-save-profile').onclick=saveProfile; $('#sst060-reset-profile').onclick=resetProfile;
  $('#sst060-scan-compat').onclick=scanCompatibility; $('#sst060-add-compat').onclick=addCompatNote;
  $('#sst060-archive-search').oninput=renderArchive;
  $('#sst060-export').onclick=exportData; $('#sst060-import').onclick=()=>$('#sst060-data-file').click(); $('#sst060-data-file').onchange=importData;
  $('#sst060-scan-regex').onclick=scanRegex; $('#sst060-import-regex').onclick=()=>$('#sst060-regex-file').click(); $('#sst060-regex-file').onchange=importRegex;
  renderProfileFields();
  makeDraggable(floater);
  // Entry point is the draggable floating button only; never inject into native toolbar.
  document.getElementById('sst060-toolbar')?.remove();
}
function makeDraggable(el) {
  const s=settings(); if(s.floatPosition){el.style.left=s.floatPosition.x+'px';el.style.top=s.floatPosition.y+'px';el.style.right='auto';el.style.bottom='auto';}
  let sx=0,sy=0,ox=0,oy=0,moved=false;
  el.addEventListener('pointerdown',e=>{const r=el.getBoundingClientRect();sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;moved=false;el.setPointerCapture(e.pointerId);});
  el.addEventListener('pointermove',e=>{if(!el.hasPointerCapture(e.pointerId))return;const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)+Math.abs(dy)>6)moved=true;if(moved){el.style.left=Math.max(4,Math.min(innerWidth-el.offsetWidth-4,ox+dx))+'px';el.style.top=Math.max(4,Math.min(innerHeight-el.offsetHeight-4,oy+dy))+'px';el.style.right='auto';el.style.bottom='auto';}});
  el.addEventListener('pointerup',()=>{if(moved){const r=el.getBoundingClientRect();s.floatPosition={x:r.left,y:r.top};save();}});
  el.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopImmediatePropagation();moved=false;}},true);
}
function showPage(page) {
  $$('.sst060-page').forEach(p=>{p.hidden=p.id!=='sst060-page-'+page;p.classList.toggle('active',!p.hidden);});
  $$('.sst060-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='archive')renderArchive(); if(page==='scripts')renderScripts(); if(page==='presets')renderPromptTable(); if(page==='compat')renderCompatibility(); if(page==='settings')renderRegex();
}
function render() {
  if(!$('#sst-v060-overlay'))return;
  const s=settings(),t=activeTheater(s);
  const theaterTabs=$('#sst060-theater-tabs');
  theaterTabs.innerHTML=s.theaters.map(x=>`<button class="${x.id===t.id?'active':''}" data-theater-id="${esc(x.id)}">${esc(x.title)}</button>`).join('');
  $$('[data-theater-id]',theaterTabs).forEach(b=>b.onclick=()=>{s.activeId=b.dataset.theaterId;save();render();});
  $('#sst060-title').value=t.title; $('#sst060-source').textContent=t.snapshot?`只读背景：${t.snapshot.sourceLabel} · ${new Date(t.snapshot.capturedAt).toLocaleString()}`:'尚未建立背景快照';
  $('#sst060-messages').innerHTML=t.messages.length?t.messages.map(m=>`<article class="sst060-msg ${m.role}"><b>${m.role==='user'?'你':'剧场'}</b><div>${esc(m.content).replace(/\n/g,'<br>')}</div></article>`).join(''):'<div class="sst060-empty">🌙<b>主线之外的小小宇宙</b><span>写下一个脑洞，开始独立番外。</span></div>';
  $('#sst060-messages').scrollTop=$('#sst060-messages').scrollHeight;
  $('#sst060-mode').value=s.generationMode; $('#sst060-api').value=s.apiChoice;
  $('#sst060-system').value=s.systemPrompt; $('#sst060-rules').value=s.creativeRules; $('#sst060-custom').value=s.customPrompt; $('#sst060-jailbreak').value=s.jailbreakPrompt; $('#sst060-lore').value=t.loreSupplement||'';
  $('#sst060-c-char').checked=s.captureCharacter; $('#sst060-c-persona').checked=s.capturePersona; $('#sst060-c-chat').checked=s.captureChat; $('#sst060-c-lore').checked=s.captureEmbeddedLore; $('#sst060-history').value=s.maxHistory;
  $('#sst060-base-url').value=s.secondaryApi.baseUrl||''; $('#sst060-secondary-model').value=s.secondaryApi.model||'';
  if(!$('#sst060-provider').value)$('#sst060-provider').value=s.apiChoice==='secondary'?'OpenAI-compatible':'SillyTavern current API';
  renderCopySelect(); renderPromptTable(); renderRegex();
}
async function generate() {
  const s=settings(),t=activeTheater(s),input=$('#sst060-input').value.trim(); if(!input)return;
  const button=$('#sst060-generate');button.disabled=true;button.textContent='正在生成…';
  try {
    if(!t.snapshot)t.snapshot=snapshot(s);
    const previous=t.messages.slice(-s.maxTheaterTurns).map(m=>`${m.role==='user'?'用户':'剧场'}：${m.content}`).join('\n\n');
    const system=[s.systemPrompt,s.creativeRules,s.customPrompt,s.jailbreakPrompt,activePresetText(s)].filter(Boolean).join('\n\n');
    const prompt=[`【独立番外背景快照】\n${t.snapshot.text||'未提供'}`,`【补充世界书】\n${t.loreSupplement||'无'}`,`【本剧场历史】\n${previous||'第一轮'}`,`【本轮要求】\n${input}`,'只在本番外空间内续写；不要声称事件已发生在主线。'].join('\n\n');
    let result;
    if(s.apiChoice==='secondary') result=await callSecondary(s,system,prompt);
    else {
      const c=ctx();
      if($('#sst060-mode').value==='quiet') {
        if(typeof c.generateQuietPrompt!=='function')throw new Error('当前酒馆上下文没有公开 generateQuietPrompt()；请升级酒馆或切换 Raw 模式。');
        result=await c.generateQuietPrompt({quietPrompt:[system,prompt].filter(Boolean).join('\n\n')});
      } else {
        if(typeof c.generateRaw!=='function')throw new Error('当前酒馆上下文没有公开 generateRaw()。');
        result=await c.generateRaw({systemPrompt:system,prompt});
      }
    }
    if(!result)throw new Error('模型没有返回文本。');
    const raw=String(result),content=applyRegex(raw);
    t.messages.push({role:'user',content:input,time:Date.now()},{role:'assistant',content,rawContent:raw,time:Date.now()});
    s.storyLibrary.push({id:uid(),title:input.length>36?input.slice(0,36)+'…':input,content,rawContent:raw,theaterId:t.id,createdAt:Date.now()});
    $('#sst060-input').value='';save();render();
  } catch(e) { console.error('[异想剧场]',e); alert('生成失败：'+(e?.message||e)); }
  finally {button.disabled=false;button.textContent='生成番外 ✦';}
}
function activePresetText(s) { const p=s.localPresets.find(x=>x.id===s.activeLocalPresetId);return (p?.prompts||[]).filter(x=>x.enabled!==false&&x.content).map(x=>`【副本提示词：${x.name}】\n${x.content}`).join('\n\n'); }

// Native preset discovery uses PresetManager read methods only. It never calls select/save/update/delete.
function getNativePresetObjects() {
  const c=ctx(),pm=c?.getPresetManager?.(); if(!pm)return {pm,rows:[],error:'当前酒馆没有暴露 getPresetManager()。'};
  const names=[]; try { if(typeof pm.getAllPresets==='function') names.push(...pm.getAllPresets()); } catch {}
  let list=null; try { list=pm.getPresetList?.(); } catch {}
  if(!names.length && list) {
    const obj=list.preset_names||list.presets||{};
    if(Array.isArray(obj)) names.push(...obj.map(x=>typeof x==='string'?x:x.name).filter(Boolean));
    else names.push(...Object.keys(obj));
  }
  const uniq=[...new Set(names.map(String))];
  const rows=[];
  for(const name of uniq) {
    let data; try { data=pm.getCompletionPresetByName?.(name); } catch {}
    // findPreset() returns the select option value, not the preset payload; never treat it as settings.
    if(!data && list?.presets) data=Array.isArray(list.presets)?list.presets.find(x=>x.name===name):list.presets[name];
    if(data) rows.push({name,data});
  }
  return {pm,rows,error:rows.length?'':'未找到可读取的原生预设条目；可以手动导入 JSON。'};
}
function getPromptArray(data) {
  const a=Array.isArray(data?.prompts)?data.prompts:Array.isArray(data?.entries)?data.entries:[];
  return a.map((p,i)=>({id:String(p.identifier||p.id||i),name:p.name||p.identifier||`提示词 ${i+1}`,role:p.role||p.role_type||'system',content:String(p.content??p.prompt??p.text??''),enabled:p.enabled!==false&&p.injection_position!==-1,sourceEnabled:p.enabled!==false}));
}
function scanNativePresets() {
  const found=getNativePresetObjects();nativePresetRows=found.rows.map(r=>({name:r.name,count:getPromptArray(r.data).length,data:r.data}));
  renderNativePresets();toast(nativePresetRows.length?`发现 ${nativePresetRows.length} 个可读取原生预设；原文件保持只读。`:found.error);
}
function renderNativePresets() {
  const el=$('#sst060-native-presets');if(!el)return;
  const rows=nativePresetRows.filter(r=>(r.name+' '+JSON.stringify(r.data)).toLowerCase().includes(presetSearch));
  el.innerHTML=rows.length?rows.map((r,i)=>`<article class="sst060-list-item"><div><b>${esc(r.name)}</b><small>${r.count} 条可识别提示词 · 原生只读</small></div><button data-copy-native="${i}">建立可编辑副本</button></article>`).join(''):'<p class="sst060-note">尚未扫描，或没有匹配结果。</p>';
  $$('[data-copy-native]',el).forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.copyNative)];if(!r)return;const prompts=getPromptArray(r.data);if(!prompts.length){toast('该预设结构暂未识别为提示词列表，原生文件未改动。');return;}const s=settings();const copy={id:uid(),name:r.name+'（剧场副本）',source:'native-copy',sourceName:r.name,createdAt:Date.now(),prompts};s.localPresets.push(copy);s.activeLocalPresetId=copy.id;save();renderCopySelect();renderPromptTable();toast('副本已建立；原生预设未修改。');});
}
function renderCopySelect() {
  const el=$('#sst060-copy-select');if(!el)return;const s=settings();const old=el.value;
  el.innerHTML='<option value="">选择预设副本</option>'+s.localPresets.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  el.value=s.localPresets.some(p=>p.id===old)?old:(s.activeLocalPresetId||'');
}
function selectedCopy() { const s=settings();return s.localPresets.find(p=>p.id===$('#sst060-copy-select').value)||s.localPresets.find(p=>p.id===s.activeLocalPresetId)||null; }
function renderPromptTable() {
  const el=$('#sst060-prompt-rows');if(!el)return;const p=selectedCopy();
  if(!p){el.innerHTML='<tr><td colspan="4">先扫描原生预设并建立副本，或手动导入 JSON。</td></tr>';return;}
  el.innerHTML=(p.prompts||[]).map((x,i)=>`<tr data-prompt-row="${i}"><td><input type="checkbox" data-prompt-select="${i}"></td><td><input type="checkbox" data-prompt-enabled="${i}" ${x.enabled!==false?'checked':''}></td><td><input data-prompt-name="${i}" value="${esc(x.name)}"><small>${esc(x.role)}</small></td><td><textarea data-prompt-content="${i}" rows="3">${esc(x.content)}</textarea></td></tr>`).join('')||'<tr><td colspan="4">这个副本没有识别到提示词条目。</td></tr>';
  $('#sst060-copy-select').value=p.id;
  filterPromptRows();
}
function filterPromptRows() {
  const q=($('#sst060-prompt-filter')?.value||'').toLowerCase();
  $$('[data-prompt-row]').forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(q);});
}
function batchPromptEnabled(value) {
  const p=selectedCopy();if(!p)return;const idx=$$('[data-prompt-select]:checked').map(x=>Number(x.dataset.promptSelect));
  if(!idx.length){toast('先勾选要批量处理的行。');return;}
  idx.forEach(i=>{if(p.prompts[i])p.prompts[i].enabled=value;});renderPromptTable();
}
function savePromptTable() {
  const p=selectedCopy();if(!p)return;
  p.prompts.forEach((x,i)=>{const e=$(`[data-prompt-enabled="${i}"]`),n=$(`[data-prompt-name="${i}"]`),c=$(`[data-prompt-content="${i}"]`);if(e)x.enabled=e.checked;if(n)x.name=n.value;if(c)x.content=c.value;});
  const s=settings();s.activeLocalPresetId=p.id;save();toast('副本所有修改已保存。');
}
async function importPresetFile(e) {
  const f=e.target.files?.[0];if(!f)return;
  try {const data=JSON.parse(await f.text()),prompts=getPromptArray(data);if(!prompts.length)throw new Error('未识别到 prompts / entries 列表');const s=settings();const p={id:uid(),name:data.name||f.name.replace(/\.json$/i,'')+'（剧场副本）',source:'manual-import',createdAt:Date.now(),prompts};s.localPresets.push(p);s.activeLocalPresetId=p.id;save();renderCopySelect();renderPromptTable();toast(`已导入 ${prompts.length} 条提示词副本。`);}catch(err){alert('导入失败：'+err.message);}finally{e.target.value='';}
}

function profileKey(provider,model) { return `${String(provider||'unknown').trim().toLowerCase()}::${String(model||'unknown').trim()}`; }
const PARAMS = [
  ['temperature','Temperature','数值，例如 0.8','number'],['maxOutputTokens','Max Response Tokens','最大输出 token 数','number'],['contextLength','Context Length','上下文长度（仅保存，不向通用接口盲发）','number'],['topP','Top P','例如 0.95','number'],['repetitionPenalty','Repetition Penalty','例如 1.05','number'],['reasoningEffort','Reasoning Effort','low / medium / high','text'],['thinkingBudget','Thinking Budget','思考预算 token 数','number']
];
function activeModelIdentity() {
  const c=ctx(),s=settings();
  if(s.apiChoice==='secondary')return {provider:'openai-compatible:'+String(s.secondaryApi.baseUrl||'').replace(/\/$/,''),model:s.secondaryApi.model||''};
  let provider=c?.mainApi||c?.api||c?.chatCompletionSource||'SillyTavern current API';
  let model='';try{model=c?.getChatCompletionModel?.()||c?.chatCompletionModel||c?.model||'';}catch{}
  return {provider:String(provider),model:String(model)};
}
function refreshModelIdentity() {
  const ident=activeModelIdentity();$('#sst060-provider').value=ident.provider;$('#sst060-model-id').value=ident.model;loadProfile();
}
function renderProfileFields() {
  const el=$('#sst060-profile-fields');if(!el)return;
  el.innerHTML=PARAMS.map(([k,label,help,type])=>`<div class="sst060-param"><label><input type="checkbox" data-param-supported="${k}"> 该模型确认支持</label><b>${label}</b><input type="${type}" data-param-value="${k}" placeholder="${esc(help)}"><small>${esc(help)}</small></div>`).join('');
  const ident=activeModelIdentity();$('#sst060-provider').value=ident.provider;$('#sst060-model-id').value=ident.model;
  loadProfile();
}
function getCurrentProfile() {
  const provider=$('#sst060-provider').value.trim(),model=$('#sst060-model-id').value.trim();if(!provider||!model)throw new Error('请填写 Provider/API 类型和准确 Model ID。');
  return {key:profileKey(provider,model),provider,model};
}
function loadProfile() {
  try {const id=getCurrentProfile(),p=settings().modelProfiles[id.key]||{};
    PARAMS.forEach(([k])=>{const v=$(`[data-param-value="${k}"]`),c=$(`[data-param-supported="${k}"]`);if(v)v.value=p.values?.[k]??'';if(c)c.checked=!!p.supported?.[k];});
    if($('#sst060-max-token-field'))$('#sst060-max-token-field').value=p.maxTokenField||'max_tokens';
    $('#sst060-profile-note').textContent=p.updatedAt?`已载入：${id.provider} / ${id.model} · ${new Date(p.updatedAt).toLocaleString()}`:'首次使用此模型：尚无经验证的能力档案，参数默认留空且不擅自猜测。';
  }catch(e){$('#sst060-profile-note').textContent=e.message;}
}
function saveProfile() {
  try {const id=getCurrentProfile(),values={},supported={};PARAMS.forEach(([k])=>{values[k]=$(`[data-param-value="${k}"]`).value;supported[k]=$(`[data-param-supported="${k}"]`).checked;});settings().modelProfiles[id.key]={provider:id.provider,model:id.model,values,supported,maxTokenField:$('#sst060-max-token-field')?.value||'max_tokens',updatedAt:Date.now()};save();loadProfile();toast('该模型的参数档案已保存。');}catch(e){alert(e.message);}
}
function resetProfile() { try {const id=getCurrentProfile();delete settings().modelProfiles[id.key];save();loadProfile();toast('已清空此模型档案。');}catch(e){alert(e.message);} }
async function fetchModels() {
  const url=$('#sst060-base-url').value.trim().replace(/\/$/,'');if(!url){alert('请先填写基础 URL。');return;}
  const key=$('#sst060-api-key').value.trim()||secondaryKeySession;
  try {const res=await fetch(url+'/models',{headers:key?{Authorization:'Bearer '+key}:{}});if(!res.ok)throw new Error(`HTTP ${res.status}`);const data=await res.json();const items=(data.data||data.models||[]).map(x=>typeof x==='string'?x:x.id).filter(Boolean);const sel=$('#sst060-model-list');sel.innerHTML='<option value="">选择模型（也可手动输入）</option>'+items.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');toast(`读取到 ${items.length} 个模型 ID。`);}catch(e){alert('读取 /models 失败：'+e.message+'。可手动填写模型 ID。');}
}
function saveSecondarySettings() {
  const s=settings();s.secondaryApi={baseUrl:$('#sst060-base-url').value.trim().replace(/\/$/,''),model:$('#sst060-secondary-model').value.trim()};
  if($('#sst060-api-key').value.trim())secondaryKeySession=$('#sst060-api-key').value.trim();
  $('#sst060-api-key').value='';save();refreshModelIdentity();toast('副 API 地址与模型已保存；密钥仅保留在当前页面会话内。');
}
async function callSecondary(s,system,prompt) {
  const a=s.secondaryApi;if(!a.baseUrl||!a.model)throw new Error('请先设置副 API 基础 URL 和模型 ID。');
  const url=a.baseUrl.replace(/\/$/,'')+'/chat/completions';const headers={'Content-Type':'application/json'};if(secondaryKeySession)headers.Authorization='Bearer '+secondaryKeySession;
  const id=profileKey('openai-compatible:'+a.baseUrl,a.model),profile=s.modelProfiles[id]||{},body={model:a.model,messages:[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}],stream:false};
  const values=profile.values||{},supported=profile.supported||{};
  const map={temperature:'temperature',maxOutputTokens:profile.maxTokenField||'max_tokens',topP:'top_p',repetitionPenalty:'repetition_penalty',reasoningEffort:'reasoning_effort',thinkingBudget:'thinking_budget'};
  for(const [k,param] of Object.entries(map))if(supported[k]&&values[k]!==''&&values[k]!==undefined&&values[k]!==null){const num=Number(values[k]);body[param]=k==='reasoningEffort'?String(values[k]):(Number.isFinite(num)?num:values[k]);}
  const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body)});if(!res.ok)throw new Error(`副 API HTTP ${res.status}：${(await res.text()).slice(0,350)}`);
  const data=await res.json(),content=data?.choices?.[0]?.message?.content;if(typeof content==='string')return content;if(Array.isArray(content))return content.map(x=>x.text||'').join('');throw new Error('返回内容不是兼容 OpenAI 的 choices[0].message.content。');
}

function normRegex(r,source,index) {
  if(!r||typeof r!=='object')return null;let raw=String(r.findRegex??r.pattern??r.regex??'');if(!raw)return null;let flags='';const m=raw.match(/^\/(.*)\/([gimsuy]*)$/);if(m){raw=m[1];flags=m[2];}
  return {id:uid(),name:r.scriptName||r.name||`规则 ${index+1}`,pattern:raw,replace:String(r.replaceString??r.replace??r.replacement??''),flags:flags||((r.markdownOnly===false)?'g':''),enabled:r.disabled!==true&&r.enabled!==false,source};
}
function collectRegex(root,source,out,depth=0,seen=new Set()) {
  if(!root||typeof root!=='object'||depth>5||seen.has(root))return;seen.add(root);
  if(Array.isArray(root)){root.forEach((x,i)=>{if(x&&typeof x==='object'&&(x.findRegex||x.pattern||x.regex)){const n=normRegex(x,source,i);if(n)out.push(n);}else collectRegex(x,source,out,depth+1,seen);});return;}
  for(const [k,v] of Object.entries(root))if(/regex/i.test(k))collectRegex(v,source,out,depth+1,seen);
}
function scanRegex() {
  const c=ctx(),s=settings(),out=[];
  // Documented storage scopes: global extension_settings.regex and character.data.extensions.regex_scripts.
  collectRegex(window.extension_settings?.regex,'酒馆全局',out);
  collectRegex(c?.extensionSettings?.regex,'酒馆全局',out);
  const card=characterData(c);collectRegex(card?.raw?.data?.extensions?.regex_scripts,'当前角色卡',out);
  const seen=new Set(s.regexRules.map(x=>`${x.source}|${x.name}|${x.pattern}`));let added=0;
  out.forEach(x=>{const k=`${x.source}|${x.name}|${x.pattern}`;if(!seen.has(k)){s.regexRules.push(x);seen.add(k);added++;}});save();renderRegex();toast(`扫描完成：复制 ${added} 条规则；原始酒馆规则未修改。`);
}
function applyRegex(text) { let out=String(text);for(const r of settings().regexRules){if(!r.enabled)continue;try{out=out.replace(new RegExp(r.pattern,r.flags||''),r.replace);}catch(e){console.warn('[异想剧场] regex invalid',r.name,e);}}return out; }
async function importRegex(e) { const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text()),a=Array.isArray(d)?d:(d.regex_scripts||d.scripts||[]);a.forEach((r,i)=>{const n=normRegex(r,'导入文件',i);if(n)settings().regexRules.push(n);});save();renderRegex();toast('规则已导入为剧场副本。');}catch(err){alert('导入失败：'+err.message);}finally{e.target.value='';} }
function renderRegex() {
  const el=$('#sst060-regex-list');if(!el)return;const s=settings();
  el.innerHTML=s.regexRules.map((r,i)=>`<article class="sst060-list-item"><label><input type="checkbox" data-regex-enabled="${i}" ${r.enabled?'checked':''}> ${esc(r.name)}</label><small>${esc(r.source)} · /${esc(r.pattern)}/${esc(r.flags||'')}</small><div class="sst060-row"><input data-regex-replace="${i}" value="${esc(r.replace)}"><button data-regex-delete="${i}">删除</button></div></article>`).join('')||'<p class="sst060-note">还没有独立正则副本。</p>';
  $$('[data-regex-enabled]',el).forEach(x=>x.onchange=()=>{s.regexRules[Number(x.dataset.regexEnabled)].enabled=x.checked;save();});
  $$('[data-regex-replace]',el).forEach(x=>x.onchange=()=>{s.regexRules[Number(x.dataset.regexReplace)].replace=x.value;save();});
  $$('[data-regex-delete]',el).forEach(x=>x.onclick=()=>{s.regexRules.splice(Number(x.dataset.regexDelete),1);save();renderRegex();});
}

function visibleScriptNames() {
  const nodes=$$('[data-script-name], [data-name], .script_management, .script-manager-list, .script-card, .list-group-item');
  return nodes.map(n=>({text:(n.getAttribute('data-script-name')||n.getAttribute('data-name')||n.textContent||'').trim().replace(/\s+/g,' ').slice(0,180)})).filter(x=>x.text);
}
function scanCompatibility() {
  const texts=visibleScriptNames().map(x=>x.text.toLowerCase()).join('\n');
  const known=[
    {id:'kemini-router',name:'Kemini 防路由脚本',terms:['防路由','anti-routing','anti routing'],risk:'可能拦截 fetch / XMLHttpRequest，影响副 API 请求或模型路由识别。',status:'待验证'},
    {id:'snow-melt-v2',name:'Kemini「雪融雪降 v2」预设伴随脚本',terms:['雪融雪降','dramatron'],risk:'提示词防截断与请求改写可能改变最终请求；与其它网络拦截脚本叠加时需单独验证。',status:'待验证'}
  ];
  compatScan=known.map(x=>{const hit=x.terms.some(t=>texts.includes(t));return {...x,detected:hit,status:hit?'已检测到名称，行为待验证':'未能从当前可见界面确认安装'};});
  renderCompatibility();
}
function addCompatNote() { const name=prompt('脚本名称（仅记录名称，不读取或执行代码）');if(!name)return;const note=prompt('兼容性备注（例如模型路由 / 请求拦截 / 防截断）')||'';settings().compatibilityNotes.push({name,note,createdAt:Date.now(),status:'待验证'});save();renderCompatibility(); }
function renderCompatibility() {
  const el=$('#sst060-compat-list');if(!el)return;
  const rows=compatScan.length?compatScan:[{name:'尚未执行扫描',status:'待扫描',risk:'点击“扫描已安装脚本”。脚本名称若未暴露在页面 DOM 中，扫描结果会标明无法确认。'}];
  el.innerHTML=rows.map(x=>`<article class="sst060-list-item"><b>${esc(x.name)}</b><small>${esc(x.status)}</small><p>${esc(x.risk)}</p></article>`).join('')+settings().compatibilityNotes.map(x=>`<article class="sst060-list-item"><b>${esc(x.name)}</b><small>人工备注 · ${esc(x.status)}</small><p>${esc(x.note)}</p></article>`).join('');
}
function saveScript() {
  const name=$('#sst060-script-name').value.trim(),content=$('#sst060-script-content').value.trim();
  if(!name||!content){alert('请填写剧本名称和内容。');return;}
  settings().scripts.push({id:uid(),name,content,createdAt:Date.now()});save();
  $('#sst060-script-name').value='';$('#sst060-script-content').value='';renderScripts();toast('剧本已保存。');
}
function renderScripts() {
  const el=$('#sst060-script-list');if(!el)return;const s=settings();
  el.innerHTML=s.scripts.map(x=>`<article class="sst060-list-item"><b>${esc(x.name)}</b><p>${esc(x.content.slice(0,360))}</p><div class="sst060-row"><button data-script-use="${esc(x.id)}">填入当前番外</button><button data-script-delete="${esc(x.id)}">删除</button></div></article>`).join('')||'<p class="sst060-note">还没有保存的剧本。</p>';
  $$('[data-script-use]',el).forEach(b=>b.onclick=()=>{const x=s.scripts.find(y=>y.id===b.dataset.scriptUse);if(x){$('#sst060-input').value=x.content;showPage('story');}});
  $$('[data-script-delete]',el).forEach(b=>b.onclick=()=>{if(confirm('删除这个剧本？')){s.scripts=s.scripts.filter(x=>x.id!==b.dataset.scriptDelete);save();renderScripts();}});
}
function deleteActiveTheater() {
  const s=settings(),t=activeTheater(s);if(!confirm(`删除剧场“${t.title}”？已经单独归档的番外仍会保留。`))return;
  s.theaters=s.theaters.filter(x=>x.id!==t.id);s.activeId=s.theaters[0]?.id||null;save();render();toast('当前剧场已删除。');
}
function renderArchive() {
  const el=$('#sst060-archive-list');if(!el)return;const s=settings(),q=($('#sst060-archive-search').value||'').toLowerCase();const arr=s.storyLibrary.filter(x=>(x.title+' '+x.content).toLowerCase().includes(q)).slice().reverse();
  el.innerHTML=arr.map(x=>`<article class="sst060-list-item"><b>${esc(x.title)}</b><small>${new Date(x.createdAt).toLocaleString()}</small><p>${esc(x.content.slice(0,360))}</p><details><summary>阅读全文</summary><pre>${esc(x.content)}</pre></details><button data-archive-delete="${esc(x.id)}">删除归档</button></article>`).join('')||'<p class="sst060-note">还没有番外归档。</p>';
  $$('[data-archive-delete]',el).forEach(b=>b.onclick=()=>{if(confirm('删除这条归档？')){s.storyLibrary=s.storyLibrary.filter(x=>x.id!==b.dataset.archiveDelete);save();renderArchive();}});
}
function exportData() {
  const s=settings(),t={version:VERSION,theaters:s.theaters,scripts:s.scripts,storyLibrary:s.storyLibrary,regexRules:s.regexRules,localPresets:s.localPresets,modelProfiles:s.modelProfiles,compatibilityNotes:s.compatibilityNotes};
  const url=URL.createObjectURL(new Blob([JSON.stringify(t,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='side-story-theater-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importData(e) {const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text()),s=settings();for(const k of ['theaters','scripts','storyLibrary','regexRules','localPresets','modelProfiles','compatibilityNotes'])if(Array.isArray(d[k])|| (k==='modelProfiles'&&d[k]&&typeof d[k]==='object'))s[k]=d[k];s.activeId=null;save();render();toast('资料导入完成。');}catch(err){alert('导入失败：'+err.message);}finally{e.target.value='';}}

let initialized = false;
let readyListenerBound = false;
let initObserver = null;

function init() {
  const c = ctx();
  if (!c) {
    console.warn('[异想剧场] SillyTavern 上下文尚未就绪，等待界面初始化');
    if (!initObserver && document.body) {
      initObserver = new MutationObserver(() => {
        if (ctx()) {
          initObserver.disconnect();
          initObserver = null;
          init();
        }
      });
      initObserver.observe(document.body, { childList: true, subtree: true });
    }
    return;
  }

  try {
    settings();
    mount();
    if (!readyListenerBound && c.eventSource?.on) {
      c.eventSource.on('APP_READY', () => {
        mount();
        ensureMagicWandEntry();
      });
      readyListenerBound = true;
    }
    if (!initialized) {
      initialized = true;
      console.info(`[异想剧场] v${VERSION} loaded`);
    }
  } catch (error) {
    console.error('[异想剧场] 初始化失败', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
// A second safe attempt handles cases where the extension script loads before Tavern's UI.
window.addEventListener('load', init, { once: true });
})();
