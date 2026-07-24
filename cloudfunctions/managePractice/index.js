const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const RECALL_RESULTS = ['no_idea', 'some_idea', 'almost', 'independent']
const DURATIONS = ['under_5', '5_to_15', '15_to_30', 'over_30']
const RECALL_LABELS = { no_idea: '鼠鼠不会', some_idea: '有点印象', almost: '差一捏捏', independent: '独立通过' }
const DURATION_LABELS = { under_5: '<5 分钟', '5_to_15': '5~15 分钟', '15_to_30': '15~30 分钟', over_30: '>30 分钟' }
const RECALL_SCORES = { no_idea: -60, some_idea: -20, almost: 10, independent: 40 }
const DURATION_SCORES = { under_5: 40, '5_to_15': 20, '15_to_30': 0, over_30: -20 }
const TRANSITIONS = {
  Lv0: { excellent: ['Lv1', 1], normal: ['Lv1', 1], forgotten: ['Lv0', 1] },
  Lv1: { excellent: ['Lv2', 2], normal: ['Lv1', 2], forgotten: ['Lv0', 1] },
  Lv2: { excellent: ['Lv3', 4], normal: ['Lv2', 4], forgotten: ['Lv1', 2] },
  Lv3: { excellent: ['Lv4', 8], normal: ['Lv3', 7], forgotten: ['Lv2', 3] },
  Lv4: { excellent: ['Lv5', 30], normal: ['Lv4', 15], forgotten: ['Lv3', 7] },
  Lv5: { excellent: ['Lv5', 90], normal: ['Lv5', 30], forgotten: ['Lv4', 15] },
}
const LEVEL_COLORS = { Lv0: '#6B7A8F', Lv1: '#94A3B8', Lv2: '#60A5FA', Lv3: '#22D3EE', Lv4: '#C084FC', Lv5: '#FBBF24' }

function getReviewLimit(value) {
  const limit = Number(value)
  return Number.isInteger(limit) && limit >= 1 && limit <= 5 ? limit : 5
}

function formatDateTime(date) {
  if (!date) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(date))
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

function getDayOffset(startDate) {
  const start = Date.parse(`${startDate}T00:00:00+08:00`)
  const current = Date.parse(`${getChinaDate()}T00:00:00+08:00`)
  return Math.max(0, Math.floor((current - start) / 86400000))
}

function getRecallTier(recallResult, duration) {
  const score = RECALL_SCORES[recallResult] + DURATION_SCORES[duration]
  if (score >= 60) return { name: 'excellent', score }
  if (score >= 20) return { name: 'normal', score }
  return { name: 'forgotten', score }
}

function addChinaDays(days) {
  const base = new Date(`${getChinaDate()}T00:00:00+08:00`)
  base.setDate(base.getDate() + days)
  return base
}

function levelValue(level) {
  return Number(String(level || 'Lv0').replace('Lv', '')) || 0
}

async function updateUserProblem(user, problemId, planId, recallResult, duration, reviewLimit) {
  const today = getChinaDate()
  const result = await db.collection('user_problems').where({ userId: user._id, planId, problemId }).limit(1).get()
  const existing = result.data[0]
  const isDueReview = Boolean(existing && existing.nextReviewAt && new Date(existing.nextReviewAt).getTime() <= Date.now())
  const nextReviewCount = (existing && existing.reviewCount || 0) + (isDueReview ? 1 : 0)
  const reviewLimitReached = Boolean(existing && existing.reviewCount >= reviewLimit) || nextReviewCount >= reviewLimit
  const levelBefore = existing ? existing.level || 'Lv0' : 'Lv0'
  const tier = getRecallTier(recallResult, duration)
  const transition = TRANSITIONS[levelBefore][tier.name]
  const targetLevel = transition[0]
  const isUpgrade = levelValue(targetLevel) > levelValue(levelBefore)
  const upgradeBlocked = isUpgrade && existing && existing.lastLevelUpDate === today
  const levelAfter = upgradeBlocked ? levelBefore : targetLevel
  const updateData = {
    planId,
    level: levelAfter,
    lastPracticedAt: db.serverDate(),
    nextReviewAt: reviewLimitReached ? null : addChinaDays(transition[1]),
    practiceCount: (existing && existing.practiceCount || 0) + 1,
    reviewCount: nextReviewCount,
    forgetCount: (existing && existing.forgetCount || 0) + (tier.name === 'forgotten' ? 1 : 0),
    isSlashed: Boolean(existing && existing.isSlashed),
    version: (existing && existing.version || 0) + 1,
    updatedAt: db.serverDate(),
  }
  if (isUpgrade && !upgradeBlocked) updateData.lastLevelUpDate = today
  if (existing) await db.collection('user_problems').doc(existing._id).update({ data: updateData })
  else await db.collection('user_problems').add({ data: { userId: user._id, problemId, ...updateData, createdAt: db.serverDate() } })
  return {
    levelBefore,
    levelAfter,
    nextReviewDays: transition[1],
    recallTier: tier.name,
    score: tier.score,
    upgradeBlocked,
    isFirstPractice: !existing,
    isDueReview,
    reviewScheduledAt: existing && existing.nextReviewAt ? existing.nextReviewAt : null,
    reviewCount: nextReviewCount,
    reviewLimit,
    reviewLimitReached,
  }
}

async function getTodayTaskTargets(userId, plan) {
  if (!plan) return { expectedNewCount: 0, completedNewCount: 0, expectedReviewCount: 0 }
  const dailyNewCount = plan.estimatedDailyNewCount || 1
  const dayOffset = getDayOffset(plan.startDate || getChinaDate(new Date(plan.createdAt)))
  const start = dayOffset * dailyNewCount
  const [planProblems, dueUserProblems] = await Promise.all([
    db.collection('plan_problems').where({ planId: plan._id }).orderBy('planOrder', 'asc').skip(start).limit(dailyNewCount).get(),
    db.collection('user_problems').where({ userId, planId: plan._id, isSlashed: false, nextReviewAt: db.command.lte(new Date()) }).limit(100).get(),
  ])
  const selectedIds = planProblems.data.map((item) => item.problemId)
  const selectedUserProblems = selectedIds.length ? await db.collection('user_problems')
    .where({ userId, planId: plan._id, problemId: db.command.in(selectedIds) }).get() : { data: [] }
  const slashedIds = new Set(selectedUserProblems.data.filter((item) => item.isSlashed).map((item) => item.problemId))
  const completedNewCount = selectedUserProblems.data.filter((item) => (
    !item.isSlashed && item.lastPracticedAt && getChinaDate(new Date(item.lastPracticedAt)) === getChinaDate()
  )).length
  return {
    expectedNewCount: selectedIds.filter((id) => !slashedIds.has(id)).length,
    completedNewCount,
    expectedReviewCount: dueUserProblems.data.length,
  }
}

async function recordDailySituation(user, state, targets, planId) {
  const date = getChinaDate()
  const result = await db.collection('daily_situations').where({ userId: user._id, date }).limit(1).get()
  const existing = result.data[0]
  const samePlanExisting = existing && existing.planId === planId && existing.taskTargetsPlanId === planId ? existing : null
  const newSubmissionIncrement = state.isFirstPractice ? 1 : 0
  const reviewSubmissionIncrement = !state.isFirstPractice && state.isDueReview ? 1 : 0
  const newSubmissionCount = (samePlanExisting && samePlanExisting.newSubmissionCount || 0) + newSubmissionIncrement
  const reviewSubmissionCount = (samePlanExisting && samePlanExisting.reviewSubmissionCount || 0) + reviewSubmissionIncrement
  const totalSubmissionCount = (samePlanExisting && samePlanExisting.totalSubmissionCount || 0) + 1
  const expectedNewCount = samePlanExisting && Number.isInteger(samePlanExisting.expectedNewCount) ? samePlanExisting.expectedNewCount : targets.expectedNewCount
  const expectedReviewCount = samePlanExisting && Number.isInteger(samePlanExisting.expectedReviewCount) ? samePlanExisting.expectedReviewCount : targets.expectedReviewCount
  const isComplete = expectedNewCount + expectedReviewCount > 0
    && newSubmissionCount >= expectedNewCount && reviewSubmissionCount >= expectedReviewCount
  const data = {
    planId,
    taskTargetsPlanId: planId,
    newSubmissionCount,
    reviewSubmissionCount,
    totalSubmissionCount,
    expectedNewCount,
    expectedReviewCount,
    completionStatus: isComplete ? 'completed' : 'partial',
    updatedAt: db.serverDate(),
  }
  if (existing) await db.collection('daily_situations').doc(existing._id).update({ data })
  else await db.collection('daily_situations').add({ data: { userId: user._id, date, ...data, createdAt: db.serverDate() } })
}

async function slayProblem(event) {
  if (!event.problemId) throw new Error('缺少题目信息')
  const user = await getUser()
  const problem = await db.collection('problems').doc(event.problemId).get()
  if (!problem.data) throw new Error('题目不存在')
  const planResult = await db.collection('study_plans').where({ userId: user._id, status: 'active' }).limit(1).get()
  const plan = planResult.data[0]
  const planId = plan ? plan._id : ''
  const result = await db.collection('user_problems').where({ userId: user._id, planId, problemId: event.problemId }).limit(1).get()
  const existing = result.data[0]
  const data = {
    planId,
    level: 'Lv5',
    isSlashed: true,
    slashedAt: db.serverDate(),
    nextReviewAt: null,
    version: (existing && existing.version || 0) + 1,
    updatedAt: db.serverDate(),
  }
  if (existing) await db.collection('user_problems').doc(existing._id).update({ data })
  else await db.collection('user_problems').add({
    data: { userId: user._id, problemId: event.problemId, practiceCount: 0, forgetCount: 0, lastLevelUpDate: '', lastPracticedAt: null, createdAt: db.serverDate(), ...data },
  })
  return { success: true, level: 'Lv5' }
}

async function getAllUserProblems(userId, planId) {
  const items = []
  let offset = 0
  while (true) {
    const result = await db.collection('user_problems').where({ userId, planId }).skip(offset).limit(100).get()
    items.push(...result.data)
    if (result.data.length < 100) return items
    offset += result.data.length
  }
}

async function getAllPlanProblems(planId) {
  const items = []
  let offset = 0
  while (true) {
    const result = await db.collection('plan_problems').where({ planId }).skip(offset).limit(100).get()
    items.push(...result.data)
    if (result.data.length < 100) return items
    offset += result.data.length
  }
}

function getCurrentMonthCalendar() {
  const today = new Date(`${getChinaDate()}T00:00:00+08:00`)
  const [year, month] = getChinaDate(today).split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = (new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`).getDay() + 6) % 7
  const leading = Array.from({ length: firstWeekday }, (_, index) => ({ key: `blank-${index}`, blank: true }))
  const dates = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    return { key: `day-${day}`, date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, day }
  })
  return { title: `${year} 年 ${month} 月`, days: [...leading, ...dates] }
}

async function getStats() {
  const user = await getUser()
  const planResult = await db.collection('study_plans').where({ userId: user._id, status: 'active' }).limit(1).get()
  const plan = planResult.data[0]
  const monthCalendar = getCurrentMonthCalendar()
  const historyResult = await db.collection('daily_situations').where({ userId: user._id }).orderBy('date', 'desc').limit(100).get()
  const planHistory = plan ? historyResult.data.filter((item) => item.planId === plan._id) : []
  const checkedDates = new Set(planHistory.filter((item) => item.totalSubmissionCount > 0).map((item) => item.date))
  let streak = 0
  const cursor = new Date(`${getChinaDate()}T00:00:00+08:00`)
  if (!checkedDates.has(getChinaDate(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (checkedDates.has(getChinaDate(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  if (!plan) return {
    success: true,
    plan: null,
    // "累计数据" is scoped to the current active plan. When no plan is active,
    // there is no plan-level total to display.
    totalPracticeCount: 0,
    streak,
    slashedCount: 0,
    levelCounts: [], progressPercent: 0,
    monthTitle: monthCalendar.title,
    calendarDays: monthCalendar.days.map((item) => ({ ...item, checkinState: item.blank ? 'blank' : 'none' })),
  }

  const [planProblems, userProblems, totalPracticeResult] = await Promise.all([
    getAllPlanProblems(plan._id),
    getAllUserProblems(user._id, plan._id),
    db.collection('practice_records').where({ userId: user._id, planId: plan._id }).count(),
  ])
  const userProblemMap = userProblems.reduce((map, item) => { map[item.problemId] = item; return map }, {})
  const counts = { Lv0: 0, Lv1: 0, Lv2: 0, Lv3: 0, Lv4: 0, Lv5: 0 }
  planProblems.forEach((item) => { counts[userProblemMap[item.problemId] ? userProblemMap[item.problemId].level || 'Lv0' : 'Lv0'] += 1 })
  const levelCounts = Object.entries(counts).map(([level, count]) => ({
    level,
    count,
    percent: planProblems.length ? Math.round(count / planProblems.length * 100) : 0,
    color: LEVEL_COLORS[level],
  }))
  let ringCursor = 0
  const ringStops = levelCounts.map((item) => {
    const start = ringCursor
    ringCursor += planProblems.length ? item.count / planProblems.length * 100 : 0
    return `${item.color} ${start}% ${ringCursor}%`
  })
  const dailyMap = planHistory.reduce((map, item) => { map[item.date] = item; return map }, {})
  const calendarDays = monthCalendar.days.map((item) => {
    if (item.blank) return { ...item, checkinState: 'blank' }
    const daily = dailyMap[item.date]
    const hasTaskTargets = daily && daily.taskTargetsPlanId === plan._id
      && Number.isInteger(daily.expectedNewCount) && Number.isInteger(daily.expectedReviewCount)
    const isComplete = hasTaskTargets && daily.totalSubmissionCount > 0
      && daily.expectedNewCount + daily.expectedReviewCount > 0
      && daily.newSubmissionCount >= daily.expectedNewCount && daily.reviewSubmissionCount >= daily.expectedReviewCount
    const checkinState = isComplete ? 'full' : daily && daily.totalSubmissionCount > 0 ? 'partial' : 'none'
    return { ...item, checkinState }
  })
  const progressNumerator = levelCounts.reduce((total, item) => total + Number(item.level.replace('Lv', '')) * item.count, 0)
  return {
    success: true,
    plan: { id: plan._id, questionBankName: plan.questionBankName, totalProblems: planProblems.length },
    totalPracticeCount: totalPracticeResult.total,
    streak,
    slashedCount: userProblems.filter((item) => item.isSlashed).length,
    levelCounts,
    ringStyle: `background:conic-gradient(${ringStops.join(',')});`,
    progressPercent: planProblems.length ? Math.round(progressNumerator / (planProblems.length * 5) * 100) : 0,
    monthTitle: monthCalendar.title,
    calendarDays,
  }
}

async function getUser() {
  const { OPENID } = cloud.getWXContext()
  const result = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  if (!result.data[0]) throw new Error('未找到当前用户，请重新打开小程序后再试')
  return result.data[0]
}

async function createRecord(event) {
  if (!RECALL_RESULTS.includes(event.recallResult)) throw new Error('请选择回忆结果')
  if (!DURATIONS.includes(event.duration)) throw new Error('请选择耗时')
  if (!event.problemId) throw new Error('缺少题目信息')
  const user = await getUser()
  const problem = await db.collection('problems').doc(event.problemId).get()
  if (!problem.data) throw new Error('题目不存在')
  const planResult = await db.collection('study_plans').where({ userId: user._id, status: 'active' }).limit(1).get()
  const plan = planResult.data[0]
  const planId = plan ? plan._id : ''
  const targets = await getTodayTaskTargets(user._id, plan)
  const created = await db.collection('practice_records').add({
    data: {
      userId: user._id,
      problemId: event.problemId,
      planId,
      recallResult: event.recallResult,
      duration: event.duration,
      code: String(event.code || '').trim(),
      summary: String(event.summary || '').trim(),
      submittedAt: db.serverDate(),
      createdAt: db.serverDate(),
    },
  })
  if (event.aiAnalysis && String(event.aiAnalysis.summary || '').trim()) {
    await db.collection('ai_analyses').add({
      data: {
        recordId: created._id,
        userId: user._id,
        summary: String(event.aiAnalysis.summary || '').trim().slice(0, 200),
        suggestion: String(event.aiAnalysis.suggestion || '').trim().slice(0, 500),
        status: 'success',
        source: 'user_requested_draft',
        promptVersion: 1,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
  }
  const state = await updateUserProblem(user, event.problemId, planId, event.recallResult, event.duration, getReviewLimit(plan && plan.reviewLimit))
  await recordDailySituation(user, state, targets, planId)
  await db.collection('practice_records').doc(created._id).update({
    data: {
      recallTier: state.recallTier,
      levelBefore: state.levelBefore,
      levelAfter: state.levelAfter,
      upgradeBlocked: state.upgradeBlocked,
      taskType: state.isFirstPractice ? 'new' : state.isDueReview ? 'review' : 'extra',
      reviewScheduledAt: state.reviewScheduledAt,
    },
  })
  return { success: true, recordId: created._id, state }
}

async function listRecords(event) {
  if (!event.problemId) throw new Error('缺少题目信息')
  const user = await getUser()
  const planResult = await db.collection('study_plans').where({ userId: user._id, status: 'active' }).limit(1).get()
  const plan = planResult.data[0]
  if (!plan) return { success: true, records: [] }
  const result = await db.collection('practice_records')
    .where({ userId: user._id, problemId: event.problemId, planId: plan._id })
    .orderBy('submittedAt', 'desc')
    .limit(100)
    .get()
  const records = result.data.map((item) => ({
    id: item._id,
    recallType: item.recallResult,
    recallResult: RECALL_LABELS[item.recallResult] || item.recallResult,
    duration: DURATION_LABELS[item.duration] || item.duration,
    summary: item.summary,
    code: item.code || '',
    submittedAt: formatDateTime(item.submittedAt),
  }))
  return { success: true, records }
}

exports.main = async (event = {}) => {
  try {
    if (event.action === 'create') return await createRecord(event)
    if (event.action === 'list') return await listRecords(event)
    if (event.action === 'slay') return await slayProblem(event)
    if (event.action === 'getStats') return await getStats()
    return { success: false, message: '不支持的操作' }
  } catch (error) {
    console.error('刷题记录操作失败', error)
    return { success: false, message: '刷题记录操作失败', error: error.message }
  }
}
