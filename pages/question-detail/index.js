const { problems, questionBanks } = require('../../services/mock-data')

Page({
  data: {
    problem: problems[0],
    bankName: questionBanks[0].name,
    activeTab: 'description',
    canPrev: false,
    canNext: true,
    previousProblemId: '',
    nextProblemId: '',
    bankCode: 'leetcode-hot-100',
    taskProblemIds: [],
  },
  onLoad(options) {
    this.setData({ bankCode: options.bankCode || 'leetcode-hot-100' })
    const taskNavigation = getApp().globalData.taskNavigation
    if (options.context && taskNavigation && taskNavigation.bankCode === this.data.bankCode) {
      this.setData({ taskProblemIds: taskNavigation.problemIds || [] })
    }
    this.loadCloudProblem(options.id || String(problems[0].id))
  },
  loadCloudProblem(problemId) {
    wx.cloud.callFunction({
      name: 'getQuestionBank',
      data: { action: 'detail', bankCode: this.data.bankCode, problemId },
    }).then(({ result }) => {
      if (!result || !result.success) throw new Error((result && result.message) || '云端题目不可用')
      const taskIndex = this.data.taskProblemIds.indexOf(result.problem.id)
      const hasTaskContext = taskIndex >= 0
      this.setData({
        problem: result.problem,
        bankName: result.bank.name,
        previousProblemId: hasTaskContext ? this.data.taskProblemIds[taskIndex - 1] || '' : result.previousProblemId,
        nextProblemId: hasTaskContext ? this.data.taskProblemIds[taskIndex + 1] || '' : result.nextProblemId,
        canPrev: hasTaskContext ? taskIndex > 0 : Boolean(result.previousProblemId),
        canNext: hasTaskContext ? taskIndex < this.data.taskProblemIds.length - 1 : Boolean(result.nextProblemId),
        activeTab: 'description',
      })
    }).catch((error) => {
      console.warn('读取云端题目失败，已使用演示数据', error)
      this.setMockProblem(Number(problemId))
    })
  },
  setMockProblem(problemId) {
    const problem = problems.find((item) => item.id === problemId) || problems[0]
    const bank = questionBanks.find((item) => item.id === problem.bankId) || questionBanks[0]
    const bankProblems = problems.filter((item) => item.bankId === problem.bankId)
    const index = bankProblems.findIndex((item) => item.id === problem.id)
    this.setData({
      problem,
      bankName: bank.name,
      canPrev: index > 0,
      canNext: index < bankProblems.length - 1,
      previousProblemId: index > 0 ? bankProblems[index - 1].id : '',
      nextProblemId: index < bankProblems.length - 1 ? bankProblems[index + 1].id : '',
      activeTab: 'description',
    })
  },
  previousProblem() {
    if (this.data.previousProblemId) this.loadCloudProblem(this.data.previousProblemId)
  },
  nextProblem() {
    if (this.data.nextProblemId) this.loadCloudProblem(this.data.nextProblemId)
  },
  selectTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }) },
  slayProblem() { wx.showToast({ title: '斩杀功能将在阶段 3 开放', icon: 'none' }) },
  copyLink() { wx.setClipboardData({ data: this.data.problem.link, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) }) },
  startPractice() { wx.showToast({ title: '提交功能将在阶段 3 开放', icon: 'none' }) },
})
