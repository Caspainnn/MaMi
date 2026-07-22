Page({
  data: { activePlan: null, newProblems: [], reviewProblems: [], today: '', loadingTasks: true },
  onShow() {
    this.setData({ today: new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }), loadingTasks: true })
    wx.cloud.callFunction({ name: 'managePlan', data: { action: 'getTodayTasks' } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error('读取今日任务失败')
        this.setData({
          activePlan: result.plan,
          newProblems: result.newTasks || [],
          reviewProblems: result.reviewTasks || [],
          loadingTasks: false,
        })
      })
      .catch(() => this.setData({ activePlan: null, newProblems: [], reviewProblems: [], loadingTasks: false }))
  },
  openProblem(e) {
    const { id, bankCode, taskType } = e.currentTarget.dataset
    const tasks = taskType === 'review' ? this.data.reviewProblems : this.data.newProblems
    getApp().globalData.taskNavigation = {
      taskType,
      bankCode,
      problemIds: tasks.map((item) => item.id),
    }
    wx.navigateTo({ url: `/pages/question-detail/index?id=${id}&bankCode=${bankCode}&context=today-${taskType}` })
  },
  createPlan() { wx.navigateTo({ url: '/pages/plan-select-bank/index' }) },
})
