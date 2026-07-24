const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_MARKDOWN_LENGTH = 12000
function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
const DAILY_EXPERIENCE_LIMIT = readPositiveInt(process.env.MAMI_AI_EXPERIENCE_DAILY_LIMIT, 1)
const API_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const MODEL = process.env.MAMI_AI_MODEL || 'agnes-2.0-flash'

const text = (value, max = MAX_MARKDOWN_LENGTH) => String(value || '').trim().slice(0, max)
const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

function getChinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((map, part) => { map[part.type] = part.value; return map }, {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

function cardsToMarkdown(cards, type) {
  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const content = text(card.content, 30)
    if (!content) return ''
    if (type === 'syntax') return `${index + 1}. ${content}\n\`\`\`${text(card.language, 20) || 'text'}\n${text(card.code, 240)}\n\`\`\``
    return `${index + 1}. ${content}`
  }).filter(Boolean).join('\n\n')
}

function normalizeLibrary(library) {
  const hasThinkingMarkdown = Object.prototype.hasOwnProperty.call(library, 'thinkingMarkdown')
  const hasSyntaxMarkdown = Object.prototype.hasOwnProperty.call(library, 'syntaxMarkdown')
  const thinkingMarkdown = hasThinkingMarkdown ? text(library.thinkingMarkdown) : text(cardsToMarkdown(library.thinkingCards, 'thinking'))
  const syntaxMarkdown = hasSyntaxMarkdown ? text(library.syntaxMarkdown) : text(cardsToMarkdown(library.syntaxCards, 'syntax'))
  return { ...library, thinkingMarkdown, syntaxMarkdown }
}

async function getUserAndPlan() {
  const { OPENID } = cloud.getWXContext()
  const userResult = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  const user = userResult.data[0]
  if (!user) throw new Error('未找到当前用户，请重新打开小程序后再试')
  const planResult = await db.collection('study_plans').where({ userId: user._id, status: 'active' }).limit(1).get()
  const plan = planResult.data[0]
  if (!plan) throw new Error('请先创建并启用一个计划')
  return { user, plan }
}

async function getLibrary(userId, planId, create = false) {
  const result = await db.collection('experience_libraries').where({ userId, planId }).limit(1).get()
  if (result.data[0]) {
    const raw = result.data[0]
    const library = normalizeLibrary(raw)
    const legacyFields = ['thinkingCards', 'syntaxCards', 'draftContent'].filter((field) => Object.prototype.hasOwnProperty.call(raw, field))
    if (legacyFields.length) {
      const updateData = {}
      if (!Object.prototype.hasOwnProperty.call(raw, 'thinkingMarkdown')) updateData.thinkingMarkdown = library.thinkingMarkdown
      if (!Object.prototype.hasOwnProperty.call(raw, 'syntaxMarkdown')) updateData.syntaxMarkdown = library.syntaxMarkdown
      legacyFields.forEach((field) => { updateData[field] = db.command.remove() })
      await db.collection('experience_libraries').doc(raw._id).update({ data: { ...updateData, updatedAt: db.serverDate() } })
    }
    return library
  }
  const library = { userId, planId, thinkingMarkdown: '', syntaxMarkdown: '', lastRefinedAt: null, lastRefinementLogId: '' }
  if (!create) return library
  const created = await db.collection('experience_libraries').add({ data: { ...library, createdAt: db.serverDate(), updatedAt: db.serverDate() } })
  return { ...library, _id: created._id }
}

async function saveLibrary(library, changes) {
  await db.collection('experience_libraries').doc(library._id).update({ data: { ...changes, updatedAt: db.serverDate() } })
  return { ...library, ...changes }
}

function requestAI(messages) {
  const apiKey = process.env.MAMI_AI_API_KEY
  if (!apiKey) return Promise.reject(new Error('AI 服务尚未配置'))
  const endpoint = new URL(`${API_BASE_URL}/chat/completions`)
  const body = JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 1200 })
  return new Promise((resolve, reject) => {
    const request = https.request({ hostname: endpoint.hostname, path: `${endpoint.pathname}${endpoint.search}`, method: 'POST', timeout: 12000, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (response) => {
      let raw = ''
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('AI 服务暂时不可用'))
        try {
          const data = JSON.parse(raw); const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
          if (!content) throw new Error('empty')
          resolve(String(content).trim())
        } catch (_) { reject(new Error('AI 返回格式异常')) }
      })
    })
    request.on('timeout', () => request.destroy(new Error('AI 请求超时')))
    request.on('error', () => reject(new Error('AI 服务暂时不可用')))
    request.write(body); request.end()
  })
}

function buildPrompt(records, library) {
  const summaries = records.map((item, index) => `【总结 ${index + 1}】\n${text(item.summary, 2000)}`).join('\n\n')
  const fence = String.fromCharCode(96).repeat(3)
  return `你是编程刷题经验编辑器。根据当前计划新增的用户总结，将有效、可复用的内容分别沉淀到“思路 Markdown”和“语法 Markdown”。忽略闲聊、情绪表达、无关内容、不完整或没有复用价值的信息；不得输出完整题解。\n\n【思路 Markdown】AI 自行判断属于解题策略、触发条件、思考路径的内容。注意，若总结中出现“文字描述”+“示例代码”这样的情况不属于本模块。使用 Markdown 有序列表；每条不超过30个汉字；格式为“1. 触发条件 → 行动策略”；合并重复项，最多12条。\n【语法 Markdown】AI 自行判断属于编程语言语法、标准库或工具用法的内容。使用 Markdown 有序列表，每项先写一句用途说明，再用带语言标识的围栏代码块给出一个经典短示例；说明不超过30个汉字，代码尽量一行；不限定语言；最多12条。\n\n以下是用户已有内容。不要重复或改写它们，只返回新增内容。若已有思路或语法有序，则你返回的文本序号应该紧接着，而不是另起新的序号：\n【已有思路】\n${text(library.thinkingMarkdown, 4000) || '无'}\n【已有语法】\n${text(library.syntaxMarkdown, 4000) || '无'}\n\n严格返回 JSON，不要 JSON 外的解释：\n{"thinkingMarkdown":"1. ...","syntaxMarkdown":"1. ...\\n${fence}python\\n...\\n${fence}"}\n\n【新增提交总结】\n${summaries}`
}

function parseAIResult(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let data
  try { data = JSON.parse(cleaned) } catch (_) {
    const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
    try { data = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : '') } catch (_) {
      const match = cleaned.match(/"thinkingMarkdown"\s*:\s*"([\s\S]*?)"\s*,\s*"syntaxMarkdown"\s*:\s*"([\s\S]*?)"\s*}/)
      if (!match) throw new Error('AI 返回格式异常')
      const unescape = (value) => value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      data = { thinkingMarkdown: unescape(match[1]), syntaxMarkdown: unescape(match[2]) }
    }
  }
  return { thinkingMarkdown: text(data.thinkingMarkdown), syntaxMarkdown: text(data.syntaxMarkdown) }
}

function appendMarkdown(existing, addition) {
  if (!addition) return existing
  if (existing.includes(addition)) return existing
  return text(existing ? `${existing}\n\n${addition}` : addition)
}

async function checkExperienceQuota(userId, date) {
  const result = await db.collection('ai_usage').where({ userId, date, status: 'success', feature: 'experience_refinement' }).count()
  if (result.total >= DAILY_EXPERIENCE_LIMIT) {
    const error = new Error(`今日“一键追加经验”已达 ${DAILY_EXPERIENCE_LIMIT} 次上限`)
    error.code = 'EXPERIENCE_DAILY_LIMIT'
    throw error
  }
}

async function getExperience() {
  const { user, plan } = await getUserAndPlan()
  const library = await getLibrary(user._id, plan._id)
  return { success: true, plan: { _id: plan._id, questionBankName: plan.questionBankName }, library }
}

async function saveMarkdown(event) {
  const { user, plan } = await getUserAndPlan(); const library = await getLibrary(user._id, plan._id, true)
  const next = await saveLibrary(library, { thinkingMarkdown: text(event.thinkingMarkdown), syntaxMarkdown: text(event.syntaxMarkdown), lastRefinementLogId: '' })
  return { success: true, library: next }
}

async function refine() {
  const { user, plan } = await getUserAndPlan(); const library = await getLibrary(user._id, plan._id, true)
  const condition = { userId: user._id, planId: plan._id, summary: db.command.neq('') }
  if (library.lastRefinedAt) condition.submittedAt = db.command.gt(library.lastRefinedAt)
  const result = await db.collection('practice_records').where(condition).orderBy('submittedAt', 'asc').limit(100).get()
  const records = result.data.filter((item) => text(item.summary, 2000))
  if (!records.length) return { success: false, code: 'NO_CONTENT', message: '当前没有可精炼的总结。日常多记录解题思路和易错点，这里才能沉淀出更有用的经验。' }
  const date = getChinaDate(); await checkExperienceQuota(user._id, date)
  const beforeSnapshot = { thinkingMarkdown: library.thinkingMarkdown, syntaxMarkdown: library.syntaxMarkdown, lastRefinedAt: library.lastRefinedAt || null }
  try {
    const raw = await requestAI([{ role: 'system', content: '严格遵守用户要求的 JSON 格式、Markdown 格式、字数限制与过滤规则。' }, { role: 'user', content: buildPrompt(records, library) }])
    const addition = parseAIResult(raw)
    if (!addition.thinkingMarkdown && !addition.syntaxMarkdown) return { success: false, code: 'NO_NEW_EXPERIENCE', message: '本次总结中暂无可追加的经验' }
    const logId = makeId('refinement')
    await db.collection('experience_refinement_logs').add({ data: { logId, userId: user._id, planId: plan._id, libraryId: library._id, beforeSnapshot, addition, sourceRecordIds: records.map((item) => item._id), createdAt: db.serverDate(), status: 'pending' } })
    await db.collection('ai_usage').add({ data: { userId: user._id, date, status: 'success', model: MODEL, feature: 'experience_refinement', createdAt: db.serverDate() } })
    return { success: true, pendingLogId: logId, addition, added: { thinking: Boolean(addition.thinkingMarkdown), syntax: Boolean(addition.syntaxMarkdown) } }
  } catch (error) {
    try { await db.collection('ai_usage').add({ data: { userId: user._id, date, status: 'failed', feature: 'experience_refinement', createdAt: db.serverDate() } }) } catch (_) {}
    throw error
  }
}

async function commitRefinement(event) {
  const { user, plan } = await getUserAndPlan(); const library = await getLibrary(user._id, plan._id, true)
  if (!event.logId) throw new Error('缺少待保存的追加记录')
  const result = await db.collection('experience_refinement_logs').where({ userId: user._id, planId: plan._id, logId: event.logId, status: 'pending' }).limit(1).get()
  const log = result.data[0]; if (!log) throw new Error('待保存的追加记录已失效')
  await saveLibrary(library, { thinkingMarkdown: text(event.thinkingMarkdown), syntaxMarkdown: text(event.syntaxMarkdown), lastRefinedAt: db.serverDate(), lastRefinementLogId: '' })
  await db.collection('experience_refinement_logs').doc(log._id).update({ data: { status: 'active', committedAt: db.serverDate() } })
  return { success: true, library: await getLibrary(user._id, plan._id, true) }
}

async function undo(event) {
  const { user, plan } = await getUserAndPlan(); const library = await getLibrary(user._id, plan._id, true)
  const logId = event.logId || library.lastRefinementLogId
  if (!logId) throw new Error('当前没有可安全撤销的 AI 追加')
  const result = await db.collection('experience_refinement_logs').where({ userId: user._id, planId: plan._id, logId }).limit(1).get()
  const log = result.data[0]; if (!log) throw new Error('未找到可撤销记录')
  if (log.status === 'pending') {
    await db.collection('experience_refinement_logs').doc(log._id).update({ data: { status: 'discarded', discardedAt: db.serverDate() } })
    return { success: true, pendingDiscarded: true }
  }
  if (log.status !== 'active') throw new Error('该追加记录已失效')
  const before = log.beforeSnapshot || {}
  const next = await saveLibrary(library, { thinkingMarkdown: text(before.thinkingMarkdown), syntaxMarkdown: text(before.syntaxMarkdown), lastRefinedAt: before.lastRefinedAt || null, lastRefinementLogId: '' })
  await db.collection('experience_refinement_logs').doc(log._id).update({ data: { status: 'undone', undoneAt: db.serverDate() } })
  return { success: true, library: next }
}

exports.main = async (event = {}) => {
  try {
    if (event.action === 'get') return await getExperience()
    if (event.action === 'saveMarkdown') return await saveMarkdown(event)
    if (event.action === 'refine') return await refine()
    if (event.action === 'commitRefinement') return await commitRefinement(event)
    if (event.action === 'undo') return await undo(event)
    return { success: false, message: '不支持的操作' }
  } catch (error) { console.error('经验沉淀操作失败', error.message); return { success: false, code: error.code || '', message: error.message || '经验沉淀操作失败' } }
}
