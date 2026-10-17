/**
 * 轻量 i18n：中文为源语言，t('中文') 直接返回原文；
 * 英文走字典映射；缺失时回退中文。
 * 静态 HTML 使用 data-i18n / data-i18n-placeholder / data-i18n-title 属性。
 * 动态渲染的文案一律经 t()；语言切换后各视图通过 onLanguageChange 重渲染。
 */

import { store } from './store.js';

const EN = {
    // 通用
    '搜索': 'Search',
    '搜索可信网站...': 'Search trusted sites...',
    '在{engine}中搜索...': 'Search on {engine}...',
    '在{engine}中搜索': 'Search on {engine}',
    '历史': 'History',
    '收藏': 'Favorites',
    '设置': 'Settings',
    '保存': 'Save',
    '取消': 'Cancel',
    '删除': 'Delete',
    '编辑': 'Edit',
    '添加': 'Add',
    '打开': 'Open',
    '关闭': 'Close',
    '重试': 'Retry',
    '停止': 'Stop',
    '确定': 'OK',
    '清除': 'Clear',
    '复制': 'Copy',
    '已复制到剪贴板': 'Copied to clipboard',
    '复制失败': 'Copy failed',
    '确认删除': 'Confirm deletion',
    '返回首页': 'Back to home',
    // 引擎
    '必应': 'Bing',
    '百度': 'Baidu',
    '谷歌': 'Google',
    'GitHub': 'GitHub',
    '自定义': 'Custom',
    '自定义字典': 'My dictionary',
    '字典': 'Dict',
    '字典（默认）': 'Dictionary (default)',
    '先在设置中配置自定义引擎地址...': 'Set a custom engine URL in Settings first...',
    '请先在 设置 → 搜索设置 中配置自定义引擎地址': 'Please set the custom engine URL in Settings → Search first',
    '自定义引擎地址': 'Custom engine URL',
    '支持 {query} 占位符；不含时自动追加 ?q=。选择“自定义”引擎前请先填写': 'Use a {query} placeholder; ?q= is appended automatically. Fill this in before choosing the "Custom" engine',
    '{source}建议': '{source} suggestions',
    '建议来源': 'Suggestion source',
    '自定义建议接口': 'Custom suggestion API',
    '建议接口代理': 'Suggestion API proxy',
    '建议来源选“自定义”时必填，响应支持 OpenSearch 数组 / suggestions / 字符串数组': 'Required when the source is "Custom". Accepts OpenSearch arrays / suggestions / plain string arrays',
    '仅自定义接口需要：若接口被浏览器跨域（CORS）拦截，填入代理模板重试，{url} 为目标地址占位符': 'Custom source only: if the endpoint is CORS-blocked, set a proxy template to retry — {url} is the target URL placeholder',
    // 首页
    '目录还是空的': 'Your directory is empty',
    '把常用的官方网站加进来，搜索后一键直达，远离广告和仿冒站。': 'Add the official sites you use most, search and jump instantly — away from ads and fake sites.',
    '添加常用网站': 'Add sites',
    '载入示例条目': 'Load sample entries',
    '正在构建搜索索引 {n}%': 'Building search index {n}%',
    '启动失败': 'Startup failed',
    '如果是直接双击打开（file://），请改用本地 HTTP 服务访问，详见 README。': 'If you opened the file directly (file://), please serve it over local HTTP instead — see README.',
    // 建议下拉
    '搜索历史': 'Search history',
    '搜索推荐': 'Suggestions',
    '删除该历史': 'Delete this history item',
    // 结果页
    'AI 回答': 'AI Answer',
    '正在思考...': 'Thinking...',
    '（已停止）': '(stopped)',
    '请求失败': 'Request failed',
    '上一页': 'Prev',
    '下一页': 'Next',
    '没有找到相关网站': 'No matching sites found',
    '语法过滤后无命中，可去掉 site:/filetype: 试试': 'No hits after syntax filtering — try removing site:/filetype:',
    '试试其他关键词、拼音或简拼': 'Try other keywords, pinyin or initials',
    '搜索中...': 'Searching...',
    '搜索出错': 'Search error',
    '未知错误': 'Unknown error',
    '共 {n} 条结果': '{n} results',
    '外部搜索': 'External search',
    '无结果': 'No results',
    '已按 {q} 过滤': 'Filtered by {q}',
    '取消收藏': 'Unfavorite',
    '已收藏': 'Added to favorites',
    '已取消收藏': 'Removed from favorites',
    // 设置 - 标签
    '主题设置': 'Appearance',
    '搜索设置': 'Search',
    '字典管理': 'Dictionary',
    'AI 设置': 'AI',
    '功能区设置': 'Features',
    '数据管理': 'Data',
    '关于': 'About',
    // 主题
    '外观': 'Appearance',
    '主题模式': 'Theme mode',
    '跟随系统': 'System',
    '亮色': 'Light',
    '暗色': 'Dark',
    '主题颜色': 'Accent color',
    '恢复默认': 'Reset',
    '背景': 'Background',
    '背景图片': 'Background image',
    '背景透明度': 'Background opacity',
    'Logo': 'Logo',
    'Logo 文字': 'Logo text',
    'Logo 图片': 'Logo image',
    '选择图片': 'Choose image',
    '未选择文件': 'No file chosen',
    '已设置': 'Set',
    '请选择图片文件': 'Please choose an image file',
    '图片过大（>2MB），请压缩后再试': 'Image too large (>2MB) — please compress it first',
    '图片处理失败': 'Image processing failed',
    '已更新背景图片': 'Background image updated',
    '已更新Logo 图片': 'Logo image updated',
    '测试连接失败': 'Test connection failed',
    // 搜索设置
    '搜索引擎': 'Search engine',
    '默认搜索引擎': 'Default engine',
    '选择外部引擎时，输入后按 Enter 将直接跳转到该引擎；选择字典时在本机搜索': 'With an external engine, pressing Enter jumps to it directly; with dictionary, searches stay local',
    '多数据源搜索': 'Multi-source results',
    '开启后，字典搜索结果底部显示外部引擎快捷跳转；关闭则仅显示本地结果': 'When on, external engine quick links appear under dictionary results; when off, local results only',
    '当前默认引擎为外部引擎，搜索时将直接跳转；此开关仅在字典模式下生效': 'An external engine is the default — searches jump to it directly. This toggle only affects dictionary mode',
    '搜索结果': 'Results',
    '每页结果数': 'Results per page',
    '新标签页打开': 'Open in new tab',
    '高级功能': 'Advanced',
    '高级搜索语法': 'Advanced syntax (site:/filetype:)',
    '支持 site:example.com 限定域名、filetype:pdf 限定类型，本地与外部引擎均生效': 'site:example.com limits the domain, filetype:pdf limits the type; works for local and external engines',
    '搜索缓存': 'Search cache',
    '同一查询 5 分钟内复用结果，修改字典后自动失效': 'Reuses results for the same query within 5 minutes; invalidated after dictionary changes',
    '搜索推荐': 'Suggestions',
    '启用推荐': 'Enable suggestions',
    '推荐数量': 'Suggestion count',
    // 字典
    '添加条目': 'Add entry',
    '导入': 'Import',
    '导出': 'Export',
    '条目': 'entries',
    '筛选...': 'Filter...',
    '编辑字典条目': 'Edit entry',
    '名称': 'Name',
    '网址': 'URL',
    '描述': 'Description',
    '标签': 'Tags',
    '输入标签后按回车': 'Type a tag and press Enter',
    '特殊标签': 'Special tag',
    '无': 'None',
    '官方': 'Official',
    '政府': 'Government',
    '图标 URL': 'Icon URL',
    '确定要删除这个条目吗': 'Delete this entry?',
    '载入示例': 'Load samples',
    '暂无条目，点击上方「添加条目」或「载入示例」开始': 'No entries yet — click "Add entry" or "Load samples" above',
    '无匹配条目': 'No matching entries',
    '例如：中国铁路12306': 'e.g. China Railway 12306',
    '一句话描述该网站': 'One-line description',
    '示例条目已存在': 'Sample entries already loaded',
    '已载入 {n} 条示例条目': 'Loaded {n} sample entries',
    // AI
    'AI 功能': 'AI feature',
    '在结果页显示 AI 回答': 'Show AI answer on results page',
    '服务商配置': 'Provider',
    '服务商': 'Provider',
    'Base URL (域名)': 'Base URL (domain)',
    '服务路径 (留空使用默认)': 'API path (blank = default)',
    '完整URL': 'Full URL',
    'API Key': 'API Key',
    '显示': 'Show',
    '隐藏': 'Hide',
    '模型': 'Model',
    '选择或输入模型名称': 'Pick or type a model name',
    '获取模型': 'Fetch models',
    '测试连接': 'Test connection',
    '测试': 'Test',
    '测试中...': 'Testing...',
    '自定义请求头': 'Custom headers',
    '高级选项': 'Advanced',
    'CORS 代理策略': 'CORS proxy policy',
    '自动（失败后走代理重试）': 'Auto (retry via proxy on failure)',
    '总是使用代理': 'Always use proxy',
    '从不使用代理': 'Never use proxy',
    '已知被 CORS 拦截的服务商（NVIDIA、腾讯混元）在自动模式下会直接走代理': 'Providers known to be CORS-blocked (NVIDIA, Tencent Hunyuan) go through the proxy directly in auto mode',
    '代理地址模板': 'Proxy URL template',
    '支持占位符 {url} 与 {encodedUrl}；走代理时自动改用非流式请求': 'Supports {url} / {encodedUrl} placeholders; non-streaming requests are used when proxied',
    '系统提示词': 'System prompt',
    '简洁模式': 'Concise',
    '详细模式': 'Detailed',
    '创意模式': 'Creative',
    '诊断信息': 'Diagnostics',
    '暂无诊断信息': 'No diagnostics yet',
    '服务商未返回模型列表，可手动输入模型名': 'Provider returned no model list — type a model name manually',
    '获取到 {n} 个模型，点击模型输入框查看': 'Fetched {n} models — click the model input to view',
    '已应用模板': 'Template applied',
    'API Key 无效或权限不足，请检查 AI 设置': 'Invalid API key or insufficient permission — check AI settings',
    '接口路径不存在，请检查 Base URL 与服务路径': 'Endpoint not found — check Base URL and API path',
    '请求过于频繁或额度不足（429）': 'Rate limited or quota exceeded (429)',
    '请求超时或已手动停止': 'Request timed out or was stopped',
    '网络请求失败（可能是 CORS 拦截），可在 AI 设置中调整代理策略': 'Network request failed (possibly CORS) — adjust the proxy policy in AI settings',
    '未配置 Base URL，请先在 AI 设置中完成服务商配置': 'Base URL not configured — set up a provider in AI settings first',
    '请先填写 Base URL': 'Enter a Base URL first',
    '连接成功': 'Connected',
    '（空回复）': '(empty reply)',
    '连接失败': 'Connection failed',
    '（模型未返回内容）': '(model returned no content)',
    // 功能区
    '界面语言': 'Language',
    '工具卡片': 'Tool cards',
    '按查询关键词触发：时间、日期、计算器、进制、单位、汇率、IP、随机数': 'Triggered by query keywords: time, date, calculator, base, unit, currency, IP, random',
    // 数据
    '导出配置': 'Export',
    '导出所有设置和数据到 JSON 文件（不包含 API Key）': 'Export all settings and data to a JSON file (API key excluded)',
    '导出全部数据': 'Export everything',
    '仅导出字典': 'Dictionary only',
    '只导出字典条目 JSON（name、url 必填，description、tags、specialTag、icon 可选）': 'Export dictionary entries only (name & url required; description, tags, specialTag, icon optional)',
    '字典为空，无可导出条目': 'Dictionary is empty — nothing to export',
    '导入配置': 'Import',
    '从 JSON 备份文件导入设置和数据（全量覆盖现有字典、设置、历史与收藏）': 'Import settings and data from a JSON backup (full overwrite: replaces the current dictionary, settings, history and favorites)',
    '导入全部数据': 'Import everything',
    '仅导入字典': 'Dictionary only',
    '追加导入；网址重复时按「同网址导入策略」处理（字典管理面板可改，默认智能合并：名称保留先导入的，补全缺失字段）': 'Append import; duplicate URLs follow the "Same-URL import strategy" (changeable in Dictionary settings; default smart merge: keep the first-imported name, fill missing fields)',
    '文件内容不是有效的备份数据': 'Not a valid backup file',
    '未找到条目数组（应为 JSON 数组或 {entries:[...]}）': 'No entries array found (expect a JSON array or {entries:[...]})',
    '导入成功：共 {n} 条': 'Import succeeded: {n} entries',
    '新增 {a} 条，合并补全 {m} 条，网址重复 {b} 条，无效 {c} 条': '{a} added, {m} merged (missing fields filled), {b} duplicate URL, {c} invalid',
    '清除数据': 'Danger zone',
    '清除所有本地存储的数据（设置、字典、历史、收藏）': 'Erase all locally stored data (settings, dictionary, history, favorites)',
    '清除全部数据': 'Erase everything',
    '仅清除字典': 'Erase dictionary only',
    '删除全部字典条目，保留设置与历史': 'Deletes all dictionary entries; keeps settings and history',
    '字典已清空': 'Dictionary cleared',
    '已恢复到初始状态': 'Reset to initial state',
    '此操作不可恢复，确定继续吗': 'This cannot be undone. Continue?',
    '此操作不可恢复，确定继续吗（将删除全部字典条目）': 'This cannot be undone. Continue? (all dictionary entries will be deleted)',
    '此操作不可恢复，确定继续吗（设置、字典、历史、收藏将全部删除）': 'This cannot be undone. Continue? (settings, dictionary, history and favorites will all be deleted)',
    '请确认': 'Please confirm',
    '全部清除': 'Erase all',
    // 历史 / 收藏
    '暂无搜索历史': 'No search history yet',
    '清除全部': 'Clear all',
    '暂无收藏': 'No favorites yet',
    '在搜索结果中点击星标即可收藏': 'Click the star on any result to favorite it',
    // 工具卡片
    '当前时间': 'Current time',
    '当前日期': 'Today',
    '计算器': 'Calculator',
    '输入表达式': 'Enter expression',
    '进制转换': 'Base conversion',
    '输入数字': 'Enter a number',
    '二进制': 'Bin',
    '八进制': 'Oct',
    '十进制': 'Dec',
    '十六进制': 'Hex',
    '源进制': 'From base',
    '单位转换': 'Unit conversion',
    '输入数值': 'Enter a value',
    '长度': 'Length',
    '重量': 'Weight',
    '温度': 'Temperature',
    '米': 'm', '千米': 'km', '厘米': 'cm', '英里': 'mi', '英尺': 'ft', '英寸': 'in',
    '千克': 'kg', '克': 'g', '吨': 't', '磅': 'lb', '盎司': 'oz',
    '摄氏度': '°C', '华氏度': '°F', '开尔文': 'K',
    '汇率转换': 'Currency',
    '金额': 'Amount',
    '获取汇率失败': 'Failed to load rates',
    '重新获取': 'Reload',
    'IP 查询': 'IP lookup',
    '位置': 'Location',
    '运营商': 'ISP',
    '查询中...': 'Looking up...',
    '查询失败': 'Lookup failed',
    '随机数生成': 'Random number',
    '最小值': 'Min',
    '最大值': 'Max',
    '生成': 'Generate',
    '随机': 'Random',
    // 提示
    '设置已保存': 'Settings saved',
    '导入成功': 'Import succeeded',
    '导入失败': 'Import failed',
    '导出成功': 'Export succeeded',
    '请填写名称和网址': 'Name and URL are required',
    '网址格式不正确': 'Invalid URL',
    '操作成功': 'Done',
    // 关于
    '版本': 'Version',
    '定位': 'About',
    '数据': 'Data',
    '个人可信网站目录搜索引擎：字典条目手动维护，搜索后一键直达官网，替代广告与仿冒站。': 'A personal trusted-site directory search engine: entries are hand-maintained, search and jump straight to official sites — no ads or fakes.',
    '全部保存在本机（IndexedDB + localStorage），无任何上传。': 'Everything stays on this device (IndexedDB + localStorage). Nothing is uploaded.',
    '快捷键': 'Shortcuts',
    '聚焦搜索框': 'Focus the search box',
    '搜索技巧': 'Search tips',
    '直接输入中文、全拼（<code>weixin</code>）、简拼（<code>wxzf</code>）均可命中': 'Type Chinese, full pinyin (<code>weixin</code>) or initials (<code>wxzf</code>) — all work',
    // AI 面板诊断
    '直连请求': 'Direct request',
    '经代理请求': 'Proxied request',
    '（经代理）': ' (via proxy)',
    '（流式）': ' (streaming)',
    '（非流式）': ' (non-streaming)',
    '回答完成，共 {n} 字': 'Answer complete, {n} chars',
    '请求失败': 'Request failed',
    '直连疑似被 CORS 拦截，自动改用代理重试…': 'Direct connection likely CORS-blocked — retrying via proxy…',
    'AI 回答失败': 'AI answer failed',
    // v2.4 搜索推荐来源与字典帮助
    '字典：建议始终来自本机字典，不随搜索引擎变化；百度 / 必应 / 谷歌：内置接口直连可用（JSONP 免跨域，无需代理），网络建议叠加在字典建议之上，失败自动回退字典': 'Dictionary: suggestions always come from the local dictionary regardless of the search engine; Baidu / Bing / Google: built-in JSONP endpoints work without a proxy — remote suggestions are merged on top of the dictionary, with silent fallback on failure',
    '字典 JSON 格式与导入说明': 'Dictionary JSON format & import rules',
    '文件格式': 'Format',
    'JSON 数组，或包含 entries 字段的对象': 'A JSON array, or an object with an "entries" field',
    '铁路官方购票网站': 'Official railway ticketing site',
    '出行': 'Travel',
    '购票': 'Ticketing',
    '字段': 'Field',
    '必填': 'Required',
    '可选': 'Optional',
    '说明': 'Description',
    '网站名称，支持中文/全拼/简拼搜索': 'Site name; searchable via Chinese / full pinyin / initials',
    '网址；导入时按它判断重复': 'URL; also the key used for duplicate detection',
    '一句话描述': 'One-line description',
    '标签数组，最多 12 个': 'Array of tags, up to 12',
    '仅支持 "官方" 或 "政府"': 'Only "官方" (official) or "政府" (government), must be written in Chinese',
    '图标图片地址': 'Icon image URL',
    '导入规则': 'Import rules',
    '追加导入：现有条目保留，新条目追加到列表': 'Append mode: existing entries are kept, new entries are appended',
    '网址重复：按「同网址导入策略」处理（「导入」按钮旁可改）：': 'Duplicate URL: handled per the "Same-URL import strategy" (changeable next to the Import button):',
    '智能合并（默认）：名称保留先导入的，旧条目缺的简介/标签/图标由新数据补全': 'Smart merge (default): the first-imported name is kept; missing description/tags/icon are filled from the new data',
    '合并为别名：同上，且新名称写入「别名」——新旧名称都能搜到，条数不增加': 'Merge as alias: same as above, plus the new name is written into "Aliases" — both names stay searchable, no extra entries',
    '新数据覆盖：新名称/简介/标签覆盖旧条目，旧名称自动转为别名保留可搜': 'Overwrite with new: the new name/description/tags replace the old entry; the old name becomes a searchable alias',
    '保留多条：同一网址保留多条独立记录（多名称场景），条数增加': 'Keep both entries: the same URL keeps separate records (multi-name scenario); entry count grows',
    '完全跳过：同网址条目直接丢弃，不做任何修改': 'Skip entirely: duplicate-URL entries are dropped without any modification',
    '子域名或路径不同（如 api.example.com、example.com/chat）是不同网址，全部保留——它们是不同入口，不会误合并': 'Different subdomains or paths (e.g. api.example.com, example.com/chat) are different URLs and are all kept — they are separate entry points and will never be merged by mistake',
    '标题相似或相同不判重：判重只认规范化网址，同名/近名条目是合法的别名场景': 'Similar or identical titles never trigger dedup: only the normalized URL counts — same/similar names are a legitimate alias scenario',
    '无效条目（缺名称或网址不合法）：自动跳过，不影响其余条目': 'Invalid entries (missing name or bad URL): skipped automatically without affecting the rest',
    '拼音字段无需提供，导入后自动补算（别名也参与拼音/简拼索引）': 'Pinyin fields are not needed — they are computed automatically after import (aliases are indexed for pinyin/initials too)',
    '导入完成后显示统计：新增 / 合并补全 / 网址重复 / 无效 各多少条': 'After import, a summary shows how many were added / merged (fields filled) / duplicate / invalid',
    '「数据管理 → 导入全部数据」为全量覆盖：替换现有字典、设置、历史与收藏': '"Data → Import all data" fully overwrites: it replaces the current dictionary, settings, history and favorites',
    // ---- v2.5 设置面板：帮助 tab / 历史 & 收藏数量与导入导出 / 表单恢复 ----
    '帮助': 'Help',
    '目录': 'Contents',
    '快速上手': 'Quick start',
    '搜索与引擎': 'Search & engines',
    '搜索建议': 'Search suggestions',
    '外观个性化': 'Appearance',
    '常见问题': 'FAQ',
    // 数据管理面板
    '历史与收藏': 'History & favorites',
    '历史保存数量': 'History limit',
    '收藏保存数量': 'Favorites limit',
    '最多保留最近 {n} 条搜索记录，超出自动删除最旧的；调小后立即裁剪': 'Keeps at most the latest {n} searches; older ones are removed automatically. Shrinking the limit trims immediately',
    '超出后自动移除最早收藏的条目；调小后立即裁剪（不可恢复）': 'Oldest favorites beyond the limit are removed automatically; shrinking the limit trims immediately (irreversible)',
    '导出历史': 'Export history',
    '导入历史': 'Import history',
    '导出收藏': 'Export favorites',
    '导入收藏': 'Import favorites',
    '历史 JSON：数组或 {history:[...]}；导入按查询词合并去重（时间取最新），不超过保存数量': 'History JSON: an array or {history:[...]}; import merges by query (latest time wins) and trims to the limit',
    '收藏 JSON：数组或 {favorites:[...]}；导入按 id 与网址去重后追加，保留原收藏时间': 'Favorites JSON: an array or {favorites:[...]}; import appends with id/URL dedup, keeping original timestamps',
    // 字典面板
    '更多帮助：查看帮助中心': 'More help: open the Help Center',
    // 帮助中心 - 快速上手
    '在「字典管理」中「载入示例」或「添加条目」，把常用官方网站加入字典': 'In "Dictionary", use "Load samples" or "Add entry" to put your frequently used official sites into the directory',
    '回到首页输入关键词（中文 / 全拼 weixin / 简拼 wxzf 均可命中），下拉会显示历史与字典建议': 'Type keywords on the home page (Chinese, full pinyin "weixin", or initials "wxzf" all match); the dropdown shows history and dictionary suggestions',
    '回车在本机搜索，点击结果直达官网；结果右侧星标可收藏': 'Press Enter to search locally; click a result to jump to the official site; star it to favorite',
    '输入框下方的引擎快捷条可切换到必应 / 百度 / 谷歌 / GitHub / 自定义，回车直接跳转': 'The engine bar under the input switches Bing / Baidu / Google / GitHub / Custom — Enter jumps straight to it',
    '快捷键：Ctrl / Cmd + K 聚焦搜索框，Esc 关闭弹层与下拉': 'Shortcuts: Ctrl/Cmd + K focuses the search box, Esc closes dialogs and the dropdown',
    // 帮助中心 - 字典
    '添加与编辑': 'Adding & editing',
    '表单字段与 JSON 字段一一对应；标签输入后按回车生成标签块，点 ✕ 删除': 'Form fields map 1:1 to the JSON fields; press Enter after typing a tag to make a chip, click ✕ to remove one',
    '新增时可点「保存并继续」：保存后表单自动清空，适合连续录入': 'When adding, click "Save & continue": the form clears automatically for rapid entry',
    '在设置中进行的添加 / 编辑 / 删除，确认后都会自动回到原界面，不会丢失当前设置页': 'Add / edit / delete done inside Settings return to the same panel after confirming — the settings page is never lost',
    '「同网址导入策略」下拉与导入 / 导出按钮在同一行（字典列表上方）；导出内容就是上表格式的纯数组（不含拼音等内部字段）': 'The "Same-URL import strategy" dropdown shares one row with the Import/Export buttons (above the list); exports are plain arrays in the table format above (no internal pinyin fields)',
    // 帮助中心 - 搜索与引擎
    '默认引擎为「自定义字典」时在本机搜索；选择外部引擎后回车将直接跳转到该引擎（新标签页）': 'With "My dictionary" selected, searches run locally; with an external engine, Enter jumps straight to it (new tab)',
    '自定义引擎：填写地址模板，{query} 会被替换为搜索词；不含占位符时自动追加 ?q=；缺协议自动补 https://': 'Custom engine: fill a URL template — {query} is replaced by your search; ?q= is appended automatically; https:// is added if missing',
    '高级搜索语法：site:example.com 限定域名；filetype:pdf 限定类型。本地与外部引擎均生效': 'Advanced syntax: site:example.com limits the domain; filetype:pdf limits the type. Works for local and external engines',
    '「多数据源搜索」开启后，字典搜索结果底部附带外部引擎快捷跳转': 'With multi-source search on, dictionary results show external engine quick links at the bottom',
    '搜索缓存：同一查询 5 分钟内复用结果；修改字典后缓存自动失效': 'Search cache: results are reused within 5 minutes for the same query; editing the dictionary invalidates it automatically',
    // 帮助中心 - 搜索建议
    '建议来源与搜索引擎相互独立：选「字典」时建议始终来自本机字典，不随搜索引擎变化': 'Suggestion source is independent of the engine: with "Dictionary", suggestions always come from your local dictionary no matter which engine is active',
    '选百度 / 必应 / 谷歌：内置官方建议接口，JSONP 直连免代理，国内网络与开代理均可使用': 'Baidu / Bing / Google: built-in official suggestion APIs over JSONP — no proxy needed, works with or without a system proxy',
    '选「自定义」：填写建议接口地址（{query} 占位符），响应支持 OpenSearch 数组 / suggestions 字段 / 纯字符串数组': 'Custom: fill a suggestion API URL ({query} placeholder); accepts OpenSearch arrays / a suggestions field / plain string arrays',
    '远程建议叠加在字典建议之上并自动去重；接口失败时静默回退为字典建议，不影响使用': 'Remote suggestions are merged above dictionary ones with dedup; on failure it silently falls back to dictionary suggestions',
    '「建议接口代理」仅自定义接口被浏览器跨域（CORS）拦截时需要：填代理模板（{url} 占位符）重试': 'The suggestion proxy is only for a custom API blocked by CORS: fill a proxy template ({url} placeholder) to retry',
    '建议数量 1–10 条；关闭「启用推荐」后输入框不再弹下拉': 'Suggestion count is 1–10; turning suggestions off disables the dropdown',
    // 帮助中心 - 历史与收藏
    '保存数量': 'Limits',
    '历史默认保存 100 条（可设 1–1000），收藏默认 500 条（可设 1–5000），在「数据管理」页修改': 'History keeps 100 items by default (1–1000), favorites 500 (1–5000); change both on the Data page',
    '超出数量后自动删除最旧的记录；把数量调小会立即裁剪且不可恢复': 'Beyond the limit the oldest are removed; shrinking the limit trims immediately and irreversibly',
    '导入 / 导出格式': 'Import / export format',
    '文件可为纯数组，也可为 {history:[...]} / {favorites:[...]} 包裹对象；「导出全部数据」的备份文件可直接用于导入': 'Files can be plain arrays or wrapped as {history:[...]} / {favorites:[...]}; the full-backup file from "Export all data" can be imported directly',
    '历史导入：按查询词合并去重，同一查询保留最新时间，不超过保存数量': 'History import merges by query (latest time wins) and trims to the limit',
    '收藏导入：按 id 与规范化网址去重后追加，保留原收藏时间；字段缺 id 会自动补齐': 'Favorites import appends with id/normalized-URL dedup, keeps original timestamps, and fills in missing ids',
    '历史保存在浏览器 localStorage，收藏保存在 IndexedDB，均仅存本机': 'History lives in localStorage and favorites in IndexedDB — everything stays on this device',
    // 帮助中心 - 数据管理
    '「导出全部数据」= 设置 + 字典 + 历史 + 收藏 打包为一个 JSON 备份（不含 AI API Key）': '"Export all data" packs settings + dictionary + history + favorites into one JSON backup (no AI API key)',
    '「导入全部数据」为全量覆盖：字典、设置、历史、收藏都会被备份文件替换，操作前有确认提示': '"Import all data" is a full overwrite: dictionary, settings, history and favorites are replaced by the backup, with a confirmation first',
    '「仅导入字典」为追加模式（网址重复按导入策略处理）；「仅导出字典」只含条目数组': '"Import dictionary" appends (duplicate URLs handled per the import strategy); "Export dictionary" contains just the entries array',
    '「仅清除字典」删除全部条目但保留设置与历史；「清除全部数据」恢复到初始状态': '"Clear dictionary" removes all entries but keeps settings and history; "Clear all data" resets to the initial state',
    '全部数据保存在本机（IndexedDB + localStorage），无任何上传与同步': 'All data is stored locally (IndexedDB + localStorage) with no upload or sync',
    // 帮助中心 - AI
    '先在「AI 设置」开启「在结果页显示 AI 回答」，再选择服务商并填写 API Key 与模型': 'Enable "Show AI answer on results" in AI settings first, then pick a provider and fill in the API key and model',
    'Base URL 留空使用服务商默认域名；服务路径留空使用默认；下方实时显示最终请求地址': 'Leave Base URL empty for the provider default; same for the API path; the final request URL is previewed below',
    '「测试连接」验证配置，「获取模型」拉取可用模型列表（也可手动输入模型名）': '"Test" verifies the config; "Models" fetches the available model list (you can also type a model name manually)',
    'CORS 代理策略：自动 = 直连失败自动改走代理；被 CORS 拦截的服务商在自动模式下会直接走代理': 'CORS proxy policy: Auto = retry via proxy after a direct failure; providers known to be CORS-blocked go through the proxy directly in Auto mode',
    '代理地址模板支持 {url} 与 {encodedUrl} 占位符；走代理时自动改用非流式请求': 'The proxy template supports {url} and {encodedUrl} placeholders; proxied requests automatically switch to non-streaming',
    '「诊断信息」记录每次请求的关键步骤与错误原因，排查连通性问题时先看这里': '"Diagnostics" logs key steps and errors of each request — check it first when troubleshooting connectivity',
    // 帮助中心 - 外观
    '主题模式：跟随系统 / 亮色 / 暗色；主题颜色改强调色，可一键恢复默认': 'Theme mode: system / light / dark; the accent color changes the highlight color and can be reset to default',
    '背景图片自动压缩存储，透明度滑杆调节背景与内容的融合程度': 'Background images are compressed automatically; the opacity slider blends background and content',
    'Logo 支持文字与图片两种；界面语言（中文 / English）切换即时生效': 'Logo supports text or an image; switching the UI language (中文 / English) applies instantly',
    // 帮助中心 - FAQ
    '打开白屏，控制台报 does not provide an export named ...': 'Blank page with "does not provide an export named ..." in the console',
    '浏览器缓存了旧版模块。按 Ctrl+F5 强制刷新，或用无痕窗口打开；升级版本时建议删除旧目录后完整重新解压': 'The browser cached old modules. Press Ctrl+F5 to hard-refresh or open an incognito window; when upgrading, delete the old folder and re-extract the new one completely',
    '双击 index.html 打不开或一直构建索引': 'Double-clicking index.html does not load, or indexing never finishes',
    'file:// 协议下浏览器会拦截 ES 模块。请用本地 HTTP 服务，例如在目录内执行 python3 -m http.server 8080 后访问 http://localhost:8080': 'Browsers block ES modules over file://. Serve it over local HTTP instead — run `python3 -m http.server 8080` inside the folder and open http://localhost:8080',
    '搜索建议不出现': 'Search suggestions never appear',
    '检查「搜索设置 → 启用推荐」是否开启；字典为空时只有历史与远程建议；远程源失败会自动回退字典建议': 'Check that "Settings → Search → Suggestions" is on; with an empty dictionary only history and remote suggestions show; remote failures fall back to dictionary suggestions automatically',
    '必应 / 谷歌建议可用吗': 'Do Bing / Google suggestions work?',
    '可用。两者均走内置 JSONP 接口直连，无需代理，与系统代理无关': 'Yes. Both use built-in JSONP endpoints directly — no proxy needed, independent of your system proxy',
    '换电脑 / 浏览器如何迁移数据': 'How do I move data to another computer or browser?',
    '旧环境「数据管理 → 导出全部数据」，新环境「导入全部数据」；API Key 出于安全不随备份导出，需重新填写': 'Export all data on the old device, then import it on the new one; for security the AI API key is not exported and must be re-entered',
    '删除的条目 / 收藏能恢复吗': 'Can deleted entries or favorites be recovered?',
    '不能。删除立即生效且不可恢复；重要数据请先导出备份': 'No. Deletion is immediate and irreversible; export a backup first for anything important',
    // 历史 / 收藏数量与导入导出 toast
    '已按新上限保留最近 {n} 条历史': 'Keeping the latest {n} history items per the new limit',
    '已按新上限移除 {n} 条较早收藏': 'Removed {n} older favorites per the new limit',
    '已达到收藏保存上限（{n} 条），最早收藏已移除': 'Favorites limit reached ({n}); the oldest favorite was removed',
    '历史为空，无可导出记录': 'History is empty — nothing to export',
    '收藏为空，无可导出条目': 'Favorites are empty — nothing to export',
    '未找到历史数组（应为 JSON 数组或 {history:[...]}）': 'No history array found (expected a JSON array or {history:[...]})',
    '未找到收藏数组（应为 JSON 数组或 {favorites:[...]}）': 'No favorites array found (expected a JSON array or {favorites:[...]})',
    '新增 {a} 条，合并更新 {b} 条，无效 {c} 条': '{a} added, {b} merged/updated, {c} invalid',
    '，超出保存数量移除 {n} 条': ', {n} removed as they exceeded the limit',
    '已保存，可继续添加': 'Saved — you can keep adding',
    '保存并继续': 'Save & continue',

    // ---- v2.8 同网址导入策略 + 别名 ----
    '别名': 'Aliases',
    '别名：': 'Aliases: ',
    '其他名称，逗号分隔，如：大肥鱼AI、DeepSeek AI': 'Other names, comma-separated, e.g. BigFish AI, DeepSeek AI',
    '别名与名称同样参与搜索（中文/拼音/简拼），适合一站多名': 'Aliases are searchable just like the name (Chinese / pinyin / initials) — ideal when one site has several names',
    '同网址导入策略': 'Same-URL import strategy',
    '智能合并（默认）': 'Smart merge (default)',
    '合并为别名': 'Merge as alias',
    '新数据覆盖': 'Overwrite with new',
    '保留多条': 'Keep both entries',
    '完全跳过': 'Skip entirely',
    '网址重复时保留旧条目，仅补全缺失的简介/标签/图标，名称保留先导入的；新数据自带的别名会并入': 'Duplicate URLs keep the existing entry; only missing description/tags/icon are filled in and the first-imported name is kept. Aliases carried by the new data are merged in',
    '在智能合并基础上，新名称存入「别名」——新旧名称都能搜到，条数不增加，适合一站多名（如 DeepSeek / 大肥鱼AI）': 'On top of smart merge, the new name is stored as an "alias" — both names stay searchable without adding entries. Ideal for one site with several names (e.g. DeepSeek / 大肥鱼AI)',
    '新数据的名称/简介/标签覆盖旧条目（新数据缺的字段保留旧值），旧名称自动转为别名保留可搜': 'The new name/description/tags overwrite the existing entry (fields missing from the new data keep old values); the old name automatically becomes a searchable alias',
    '同一网址保留多条独立记录（多名称场景），搜索范围最大，条数会增加': 'Keep separate entries for the same URL (multi-name scenario); maximum search coverage, more entries',
    '同网址条目直接跳过，不做任何修改（标题不参与判重，同名/近名条目不受影响）': 'Duplicate-URL entries are skipped without any modification (titles never trigger dedup; same/similar names are unaffected)',
    '别名数组，与名称同样参与搜索（中文/拼音/简拼），适合一站多名': 'Array of aliases, searchable just like the name (Chinese / pinyin / initials) — ideal for one site with several names',
};

const EN_PH = {
    '搜索...': 'Search...',
    '搜索可信网站...': 'Search trusted sites...',
    '筛选...': 'Filter...',
    '输入标签后按回车': 'Type a tag and press Enter',
};

/** 翻译：中文为源串 */
export function t(zh) {
    const lang = store.get('config')?.language || 'zh';
    if (lang !== 'en') return zh;
    return EN[zh] ?? zh;
}

/** 模板翻译：t('共 {n} 条结果', { n: 5 }) → "5 results" */
export function tf(zh, params) {
    let s = t(zh);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            s = s.replaceAll(`{${k}}`, String(v));
        }
    }
    return s;
}

/** 输入框占位符专用（部分占位与正文不同） */
export function ph(zh) {
    const lang = store.get('config')?.language || 'zh';
    if (lang !== 'en') return zh;
    return EN_PH[zh] ?? EN[zh] ?? zh;
}

/** 应用静态 HTML 上的 data-i18n / data-i18n-placeholder / data-i18n-title */
export function applyStaticI18n(root = document) {
    const lang = store.get('config')?.language || 'zh';
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const src = el.dataset.i18nSrc ?? el.textContent;
        el.dataset.i18nSrc = src;
        el.textContent = lang === 'en' ? (EN[src] ?? src) : src;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const src = el.dataset.i18nSrc ?? el.getAttribute('placeholder');
        el.dataset.i18nSrc = src;
        el.setAttribute('placeholder', lang === 'en' ? (EN_PH[src] ?? EN[src] ?? src) : src);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const src = el.dataset.i18nTitleSrc ?? el.getAttribute('title');
        el.dataset.i18nTitleSrc = src;
        el.setAttribute('title', lang === 'en' ? (EN[src] ?? src) : src);
    });
}

/** 语言变更后执行回调（视图模块用它重渲染动态文案） */
export function onLanguageChange(fn) {
    store.subscribe('config', (cfg, prev) => {
        if (prev && cfg && cfg.language !== prev.language) fn(cfg.language);
    }, { immediate: false });
}

/** 当前语言的 locale（时间/日期格式化用） */
export function currentLocale() {
    return (store.get('config')?.language === 'en') ? 'en-US' : 'zh-CN';
}

/** 初始化：应用静态文案 + 语言变更时重应用 */
export function initI18n() {
    applyStaticI18n();
    store.subscribe('config', (cfg, prev) => {
        if (prev && cfg.language !== prev.language) applyStaticI18n();
    });
}
