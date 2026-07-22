const app = getApp()

Page({
  data: { user: app.globalData.user },
  onShow() {
    const loginPromise = app.globalData.loginPromise || Promise.resolve(app.globalData.user)
    loginPromise.then((user) => this.setData({ user }))
  },
  createPlan() { wx.showToast({ title: '计划功能将在阶段 2 开放', icon: 'none' }) },
})
