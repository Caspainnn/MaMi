const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const DAILY_USER_LIMIT = readPositiveInt(process.env.MAMI_AI_DRAFT_DAILY_LIMIT, 10)
const DAILY_GLOBAL_LIMIT = 200
const API_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const MODEL = process.env.MAMI_AI_MODEL || 'agnes-2.0-flash'
const RECALL_LABELS = {
  no_idea: '鼠鼠不会', some_idea: '有点印象', almost: '差一捏捏', independent: '独立通过',
}
const DURATION_LABELS = {
  under_5: '<5分钟', '5_to_15': '5~15分钟', '15_to_30': '15~30分钟', over_30: '>30分钟',
}

function getChinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((map, part) => {
    map[part.type] = part.value
    return map
  }, {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

async function getUser() {
  const { OPENID } = cloud.getWXContext()
  const result = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  if (!result.data[0]) throw new Error('未找到当前用户，请重新打开小程序后再试')
  return result.data[0]
}

function requestAI(messages) {
  const apiKey = process.env.MAMI_AI_API_KEY
  if (!apiKey) return Promise.reject(new Error('AI 服务尚未配置'))
  const endpoint = new URL(`${API_BASE_URL}/chat/completions`)
  const body = JSON.stringify({ model: MODEL, messages, temperature: 0.35, max_tokens: 500 })
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: endpoint.hostname,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      timeout: 12000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (response) => {
      let raw = ''
      response.on('data', (chunk) => { raw += chunk })
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error('AI 服务暂时不可用'))
        try {
          const parsed = JSON.parse(raw)
          const content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content
          if (!content) throw new Error('AI 返回内容为空')
          resolve(String(content).trim())
        } catch (error) {
          reject(new Error('AI 返回格式异常'))
        }
      })
    })
    request.on('timeout', () => request.destroy(new Error('AI 请求超时')))
    request.on('error', () => reject(new Error('AI 服务暂时不可用')))
    request.write(body)
    request.end()
  })
}

function buildPrompt(problem, record, histories) {
  const problemInfo = `标题：${problem.title}\n难度：${problem.difficulty || '未标注'}\n标签：${(problem.tags || []).join('、') || '未标注'}\n简介：${problem.summary || '未提供'}`
  const historyRecords = histories.length
    ? histories.map((item, index) => `${index + 1}. ${RECALL_LABELS[item.recallResult] || item.recallResult}，${DURATION_LABELS[item.duration] || item.duration}`).join('\n')
    : '暂无历史记录'
  const hasCode = Boolean(String(record.code || '').trim())
  const instruction = hasCode
    ? '第一段输出一句 50 字以内的复盘，必须包含时间复杂度和空间复杂度；只有在代码有问题、不是最优解或存在明显优化空间时，再输出第二段（100 字内）。禁止完整题解和代码。输出示例：时间O(n)，空间O(n)。优化：暴力->哈希'
    : '输出两段：第一段为 50 字以内的记忆状态总结，不能照搬用户的回忆结果和耗时，而是将这些信息总结成1~2个词；仅在未独立通过、历史明显退步或耗时异常时输出第二段（100 字内的复习建议），以“需要...”开头，比如：需要重点刷二分；需要模仿他人题解等。禁止完整题解、代码和编造错误。'
  return `你是「码秘」算法记忆复盘助手。你的工作是评估记忆与复盘，不是讲题或生成题解。\n\n【题目信息】\n${problemInfo}\n\n【本次回忆结果】\n${RECALL_LABELS[record.recallResult] || record.recallResult}\n\n【本次耗时】\n${DURATION_LABELS[record.duration] || record.duration}\n\n【用户代码】\n${hasCode ? record.code : '未提交代码'}\n\n【用户总结】\n${record.summary || '未提交总结'}\n\n【历史刷题记录】\n${historyRecords}\n\n${instruction}`
}

function splitAnalysis(content) {
  const parts = content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean)
  return {
    summary: (parts[0] || content).slice(0, 200),
    suggestion: parts.slice(1).join('\n').slice(0, 500),
  }
}

async function checkQuota(userId, date) {
  const [userCount, globalCount] = await Promise.all([
    db.collection('ai_usage').where({ userId, date, status: 'success' }).count(),
    db.collection('ai_usage').where({ date, status: 'success' }).count(),
  ])
  if (userCount.total >= DAILY_USER_LIMIT) throw new Error(`今日 AI 复盘已达 ${DAILY_USER_LIMIT} 次上限`)
  if (globalCount.total >= DAILY_GLOBAL_LIMIT) throw new Error('今日 AI 服务繁忙，请明天再试')
}

async function generateDraft(event) {
  if (!event.problemId) throw new Error('缺少题目信息')
  if (!RECALL_LABELS[event.recallResult]) throw new Error('请先选择刷题情况')
  if (!DURATION_LABELS[event.duration]) throw new Error('请先选择本次耗时')
  const user = await getUser()
  const date = getChinaDate()
  try {
    await checkQuota(user._id, date)
  } catch (error) {
    if (String(error.message || '').includes('ai_usage')) throw new Error('AI 服务尚未初始化，请先执行 initDB 云函数')
    throw error
  }
  try {
    const [problemResult, historyResult] = await Promise.all([
      db.collection('problems').doc(event.problemId).get(),
      db.collection('practice_records').where({ userId: user._id, problemId: event.problemId }).orderBy('submittedAt', 'desc').limit(10).get(),
    ])
    if (!problemResult.data) throw new Error('题目不存在')
    const record = {
      recallResult: event.recallResult,
      duration: event.duration,
      code: String(event.code || '').trim().slice(0, 8000),
      summary: String(event.summary || '').trim().slice(0, 2000),
    }
    const content = await requestAI([
      { role: 'system', content: '请严格遵守用户给出的格式、字数和禁止项。' },
      { role: 'user', content: buildPrompt(problemResult.data, record, historyResult.data) },
    ])
    const analysis = splitAnalysis(content)
    await db.collection('ai_usage').add({ data: { userId: user._id, date, status: 'success', model: MODEL, createdAt: db.serverDate() } })
    return { success: true, analysis }
  } catch (error) {
    try {
      await db.collection('ai_usage').add({ data: { userId: user._id, date, status: 'failed', createdAt: db.serverDate() } })
    } catch (_) {
      // 初始化缺失时不覆盖原始、可操作的错误信息。
    }
    throw error
  }
}

exports.main = async (event = {}) => {
  try {
    if (event.action !== 'draft') return { success: false, message: '不支持的操作' }
    return await generateDraft(event)
  } catch (error) {
    console.error('AI 复盘生成失败', error.message)
    return { success: false, message: error.message || 'AI 复盘生成失败' }
  }
}
