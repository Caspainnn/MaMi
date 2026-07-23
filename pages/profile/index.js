const app = getApp()

Page({
  data: {
    user: app.globalData.user,
    activePlan: null,
    feedbackExpanded: false,
    feedbackCategory: '',
    feedbackCategories: [
      { key: 'feature', label: '新功能建议' },
      { key: 'bug', label: '问题反馈' },
      { key: 'experience', label: '体验优化' },
      { key: 'praise', label: '夸一下码秘👍' },
      { key: 'other', label: '其他' },
    ],
    feedback: '',
    feedbackSubmitting: false,
  },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 4 })
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
  toggleFeedback() { this.setData({ feedbackExpanded: !this.data.feedbackExpanded }) },
  selectFeedbackCategory(event) { this.setData({ feedbackCategory: event.currentTarget.dataset.category }) },
  onFeedbackInput(event) { this.setData({ feedback: event.detail.value }) },
  submitFeedback() {
    const content = String(this.data.feedback || '').trim()
    if (!content) {
      wx.showToast({ title: '写点想对码秘说的话吧', icon: 'none' })
      return
    }
    if (!this.data.feedbackCategory) {
      wx.showToast({ title: '先选一个反馈分类吧', icon: 'none' })
      return
    }
    if (this.data.feedbackSubmitting) return
    this.setData({ feedbackSubmitting: true })
    wx.cloud.callFunction({ name: 'submitFeedback', data: { content, category: this.data.feedbackCategory } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error(result && result.message || '提交失败')
        this.setData({ feedback: '', feedbackCategory: '', feedbackExpanded: false })
        wx.showToast({ title: '收到，码秘会认真看', icon: 'success' })
      })
      .catch((error) => wx.showToast({ title: error.message || '提交失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ feedbackSubmitting: false }))
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
