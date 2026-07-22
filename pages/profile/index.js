const app = getApp()

Page({
  data: { user: app.globalData.user, activePlan: null },
  onShow() {
    const loginPromise = app.globalData.loginPromise || Promise.resolve(app.globalData.user)
    loginPromise.then((user) => {
      this.setData({ user })
      this.refreshPlan()
    })
  },
  refreshPlan() {
    wx.cloud.callFunction({ name: 'managePlan', data: { action: 'getActive' } })
      .then(({ result }) => this.setData({ activePlan: result && result.success ? result.plan : null }))
      .catch(() => this.setData({ activePlan: null }))
  },
  createPlan() { wx.navigateTo({ url: '/pages/plan-select-bank/index' }) },
  resetPlan() {
    wx.showModal({
      title: '重置当前计划？',
      content: '重置后首页不再展示该计划任务，历史计划与提交记录不会删除。',
      confirmText: '确认重置',
      confirmColor: '#d45b3f',
      success: ({ confirm }) => {
        if (!confirm) return
        wx.cloud.callFunction({ name: 'managePlan', data: { action: 'reset' } })
          .then(({ result }) => {
            if (!result || !result.success) throw new Error('重置失败')
            wx.showToast({ title: '计划已重置', icon: 'success' })
            this.setData({ activePlan: null })
          })
          .catch(() => wx.showToast({ title: '重置失败，请重试', icon: 'none' }))
      },
    })
  },
})
