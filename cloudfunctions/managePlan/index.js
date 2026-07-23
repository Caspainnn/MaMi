const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const PAGE_SIZE = 100

function getChinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((map, part) => {
    map[part.type] = part.value
    return map
  }, {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

function getDayOffset(startDate, currentDate = getChinaDate()) {
  const start = Date.parse(`${startDate}T00:00:00+08:00`)
  const current = Date.parse(`${currentDate}T00:00:00+08:00`)
  return Math.max(0, Math.floor((current - start) / 86400000))
}

function buildEstimate(totalCount, planType, value) {
  if (!Number.isInteger(value) || value < 1) throw new Error('计划参数必须是大于 0 的整数')
  if (planType === 'by_days' && value < 15) throw new Error('目标天数不能少于 15 天')
  if (!['by_days', 'by_daily_new_count'].includes(planType)) throw new Error('不支持的计划方式')

  const newLearningDays = planType === 'by_days' ? value - 14 : Math.ceil(totalCount / value)
  const dailyNewCount = Math.ceil(totalCount / newLearningDays)
  const targetDays = newLearningDays + 14
  const finishDate = new Date(`${getChinaDate()}T00:00:00+08:00`)
  finishDate.setDate(finishDate.getDate() + targetDays)
  return {
    targetDays: planType === 'by_days' ? value : null,
    dailyNewCount: planType === 'by_daily_new_count' ? value : null,
    estimatedDailyNewCount: dailyNewCount,
    estimatedDailyReviewCount: Math.ceil((totalCount * 4) / targetDays),
    estimatedFinishDate: getChinaDate(finishDate),
      newLearningDays,
      startDate: getChinaDate(),
  }
}

async function getRelations(questionBankId) {
  const relations = []
  let offset = 0
  while (true) {
    const result = await db.collection('question_bank_problems')
      .where({ questionBankId })
      .orderBy('sortOrder', 'asc')
      .skip(offset)
      .limit(PAGE_SIZE)
      .get()
    relations.push(...result.data)
    if (result.data.length < PAGE_SIZE) return relations
    offset += PAGE_SIZE
  }
}

async function createPlan(event) {
  const { OPENID } = cloud.getWXContext()
  const userResult = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  const user = userResult.data[0]
  if (!user) throw new Error('未找到当前用户，请重新打开小程序后再试')

  const bankResult = await db.collection('question_banks').where({ code: event.bankCode }).limit(1).get()
  const bank = bankResult.data[0]
  if (!bank) throw new Error('题库不存在')

  const relations = await getRelations(bank._id)
  if (!relations.length) throw new Error('题库中暂无题目，无法创建计划')
  const estimate = buildEstimate(relations.length, event.planType, Number(event.value))
  const activePlansResult = await db.collection('study_plans')
    .where({ userId: user._id, status: 'active' })
    .get()
  const previousActivePlanIds = activePlansResult.data.map((plan) => plan._id)
  const now = db.serverDate()
  const created = await db.collection('study_plans').add({
    data: {
      userId: user._id,
      questionBankId: bank._id,
      questionBankCode: bank.code,
      questionBankName: bank.name,
      planType: event.planType,
      ...estimate,
      status: 'creating',
      createdAt: now,
      updatedAt: now,
    },
  })

  try {
    for (let start = 0; start < relations.length; start += PAGE_SIZE) {
      const batch = relations.slice(start, start + PAGE_SIZE)
      await Promise.all(batch.map((relation) => db.collection('plan_problems').doc(`${created._id}_${relation.problemId}`).set({
        data: {
          planId: created._id,
          problemId: relation.problemId,
          planOrder: relation.sortOrder,
          initialStatus: 'Lv0',
          createdAt: db.serverDate(),
        },
      })))
    }
    // 题目初始化完成后才覆盖旧计划，避免初始化失败时影响原计划。
    await Promise.all(previousActivePlanIds.map((planId) => db.collection('study_plans').doc(planId).update({
      data: { status: 'covered', coveredAt: db.serverDate(), updatedAt: db.serverDate() },
    })))
    await db.collection('study_plans').doc(created._id).update({
      data: { status: 'active', updatedAt: db.serverDate() },
    })
  } catch (error) {
    // 若覆盖切换中断，尽力恢复旧计划，保证用户不会因一次失败丢失当前计划。
    await Promise.all(previousActivePlanIds.map((planId) => db.collection('study_plans').doc(planId).update({
      data: { status: 'active', updatedAt: db.serverDate() },
    }).catch(() => null)))
    await db.collection('study_plans').doc(created._id).update({
      data: { status: 'failed', failureReason: error.message, updatedAt: db.serverDate() },
    })
    throw error
  }

  return {
    success: true,
    plan: {
      id: created._id,
      bankName: bank.name,
      status: 'active',
      totalProblems: relations.length,
      coveredPlanCount: previousActivePlanIds.length,
      ...estimate,
    },
  }
}

async function getUser() {
  const { OPENID } = cloud.getWXContext()
  const result = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  if (!result.data[0]) throw new Error('未找到当前用户，请重新打开小程序后再试')
  return result.data[0]
}

async function getActivePlan() {
  const user = await getUser()
  const result = await db.collection('study_plans')
    .where({ userId: user._id, status: 'active' })
    .limit(1)
    .get()
  const plan = result.data[0]
  return {
    success: true,
    plan: plan ? {
      id: plan._id,
      questionBankName: plan.questionBankName,
      questionBankCode: plan.questionBankCode,
      estimatedFinishDate: plan.estimatedFinishDate,
      estimatedDailyNewCount: plan.estimatedDailyNewCount,
    } : null,
  }
}

async function resetActivePlan() {
  const user = await getUser()
  const result = await db.collection('study_plans').where({ userId: user._id, status: 'active' }).get()
  if (!result.data.length) return { success: true, resetCount: 0 }
  await Promise.all(result.data.map((plan) => db.collection('study_plans').doc(plan._id).update({
    data: { status: 'reset', resetAt: db.serverDate(), updatedAt: db.serverDate() },
  })))
  return { success: true, resetCount: result.data.length }
}

async function getProblems(problemIds) {
  const problems = []
  for (let start = 0; start < problemIds.length; start += PAGE_SIZE) {
    const ids = problemIds.slice(start, start + PAGE_SIZE)
    const result = await db.collection('problems').where({ _id: db.command.in(ids) }).get()
    problems.push(...result.data)
  }
  return problems
}

async function getPlanProblems(planId, start, count) {
  const relations = []
  let offset = start
  while (relations.length < count) {
    const pageSize = Math.min(PAGE_SIZE, count - relations.length)
    const result = await db.collection('plan_problems')
      .where({ planId })
      .orderBy('planOrder', 'asc')
      .skip(offset)
      .limit(pageSize)
      .get()
    relations.push(...result.data)
    if (result.data.length < pageSize) return relations
    offset += result.data.length
  }
  return relations
}

async function getAllPlanProblems(planId) {
  const relations = []
  let offset = 0
  while (true) {
    const result = await db.collection('plan_problems').where({ planId }).orderBy('planOrder', 'asc').skip(offset).limit(PAGE_SIZE).get()
    relations.push(...result.data)
    if (result.data.length < PAGE_SIZE) return relations
    offset += result.data.length
  }
}

async function getDueUserProblems(userId, planId) {
  const due = []
  let offset = 0
  while (true) {
    const result = await db.collection('user_problems').where({
      userId, planId, isSlashed: false, nextReviewAt: db.command.lte(new Date()),
    }).skip(offset).limit(PAGE_SIZE).get()
    due.push(...result.data)
    if (result.data.length < PAGE_SIZE) return due
    offset += result.data.length
  }
}

async function getCheckinStreak(userId, planId) {
  const result = await db.collection('daily_situations').where({ userId }).orderBy('date', 'desc').limit(100).get()
  const checkedDates = new Set(result.data.filter((item) => item.planId === planId && item.totalSubmissionCount > 0).map((item) => item.date))
  let streak = 0
  const cursor = new Date(`${getChinaDate()}T00:00:00+08:00`)
  const checkedInToday = checkedDates.has(getChinaDate(cursor))
  if (!checkedInToday) cursor.setDate(cursor.getDate() - 1)
  while (checkedDates.has(getChinaDate(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return { streak, checkedInToday }
}

async function getTodayTasks() {
  const user = await getUser()
  const planResult = await db.collection('study_plans').where({ userId: user._id, status: 'active' }).limit(1).get()
  const plan = planResult.data[0]
  if (!plan) return { success: true, plan: null, newTasks: [], reviewTasks: [] }

  const startDate = plan.startDate || getChinaDate(new Date(plan.createdAt))
  const dayOffset = getDayOffset(startDate)
  const dailyNewCount = plan.estimatedDailyNewCount || 1
  const start = dayOffset * dailyNewCount
  const relations = await getPlanProblems(plan._id, start, dailyNewCount)
  const userProblemResult = relations.length ? await db.collection('user_problems')
    .where({ userId: user._id, planId: plan._id, problemId: db.command.in(relations.map((item) => item.problemId)) })
    .get() : { data: [] }
  const userProblemMap = userProblemResult.data.reduce((map, item) => { map[item.problemId] = item; return map }, {})
  const slashedProblemIds = new Set(userProblemResult.data.filter((item) => item.isSlashed).map((item) => item.problemId))
  const availableRelations = relations.filter((item) => !slashedProblemIds.has(item.problemId))
  const [records, allPlanRelations, dueUserProblems, checkin] = await Promise.all([
    getProblems(availableRelations.map((item) => item.problemId)),
    getAllPlanProblems(plan._id),
    getDueUserProblems(user._id, plan._id),
    getCheckinStreak(user._id, plan._id),
  ])
  const recordMap = records.reduce((map, item) => {
    map[item._id] = item
    return map
  }, {})
  const newTasks = availableRelations.map((relation) => recordMap[relation.problemId]).filter(Boolean).map((problem) => ({
    id: problem._id,
    title: problem.title,
    category: problem.category,
    difficulty: problem.difficulty,
    isCompletedToday: Boolean(userProblemMap[problem._id] && userProblemMap[problem._id].lastPracticedAt && getChinaDate(new Date(userProblemMap[problem._id].lastPracticedAt)) === getChinaDate()),
  }))
  const planOrderMap = allPlanRelations.reduce((map, item) => { map[item.problemId] = item.planOrder; return map }, {})
  const todayStart = new Date(`${getChinaDate()}T00:00:00+08:00`).getTime()
  const dueProblemIds = dueUserProblems.map((item) => item.problemId)
  const dueProblems = await getProblems(dueProblemIds)
  const dueProblemMap = dueProblems.reduce((map, item) => { map[item._id] = item; return map }, {})
  const reviewTasks = dueUserProblems
    .map((userProblem) => ({ userProblem, problem: dueProblemMap[userProblem.problemId] }))
    .filter((item) => item.problem)
    .sort((a, b) => {
      const aTime = new Date(a.userProblem.nextReviewAt).getTime()
      const bTime = new Date(b.userProblem.nextReviewAt).getTime()
      const aOverdue = aTime < todayStart ? 0 : 1
      const bOverdue = bTime < todayStart ? 0 : 1
      if (aOverdue !== bOverdue) return aOverdue - bOverdue
      if (aTime !== bTime) return aTime - bTime
      return (planOrderMap[a.problem._id] || 0) - (planOrderMap[b.problem._id] || 0)
    })
    .map(({ userProblem, problem }) => ({
      id: problem._id,
      title: problem.title,
      category: problem.category,
      difficulty: problem.difficulty,
      level: userProblem.level || 'Lv0',
      isOverdue: new Date(userProblem.nextReviewAt).getTime() < todayStart,
    }))

  return {
    success: true,
    plan: {
      id: plan._id,
      questionBankName: plan.questionBankName,
      questionBankCode: plan.questionBankCode,
      estimatedFinishDate: plan.estimatedFinishDate,
      dayOffset,
      streak: checkin.streak,
      checkedInToday: checkin.checkedInToday,
    },
    newTasks,
    reviewTasks,
  }
}

exports.main = async (event = {}) => {
  try {
    if (event.action === 'create') return await createPlan(event)
    if (event.action === 'getActive') return await getActivePlan()
    if (event.action === 'reset') return await resetActivePlan()
    if (event.action === 'getTodayTasks') return await getTodayTasks()
    return { success: false, message: '不支持的操作' }
  } catch (error) {
    console.error('创建计划失败', error)
    return { success: false, message: '创建计划失败', error: error.message }
  }
}
