Page({
  data: { activePlan: null, newProblems: [], reviewProblems: [], today: '', loadingTasks: true, showLoginSheet: false, loginLoading: false },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 0 })
    const app = getApp()
    this.setData({ today: new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }), loadingTasks: true })
    const loginPromise = app.globalData.loginPromise || Promise.resolve()
    loginPromise.then(() => this.setData({ showLoginSheet: Boolean(app.globalData.loginStatus.available && !app.globalData.loginStatus.loggedIn) }))
    this.loadTasks()
  },
  loadTasks() {
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
  deferLogin() { this.setData({ showLoginSheet: false }) },
  confirmLogin() {
    if (this.data.loginLoading) return
    if (!wx.getUserProfile) {
      wx.showToast({ title: '当前微信版本不支持昵称授权', icon: 'none' })
      return
    }
    this.setData({ loginLoading: true })
    new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善码秘账户昵称',
        success: ({ userInfo }) => resolve(userInfo && userInfo.nickName),
        fail: () => reject(new Error('未获得昵称授权')),
      })
    }).then((nickname) => wx.cloud.callFunction({ name: 'login', data: { action: 'authorize', nickname } }))
      .then(({ result }) => {
      if (!result || !result.success || !result.user) throw new Error(result && result.message || '登录失败')
      const app = getApp()
      app.globalData.user = result.user
      app.globalData.loginStatus = { available: true, loggedIn: true }
      this.setData({ showLoginSheet: false })
      this.loadTasks()
      wx.showToast({ title: `你好，${result.user.nickname}`, icon: 'success' })
    }).catch((error) => {
      if (error && error.message === '未获得昵称授权') wx.showToast({ title: '允许昵称授权后才能登录', icon: 'none' })
      else wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' })
    }).finally(() => this.setData({ loginLoading: false }))
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
