const { problems } = require('../../services/mock-data')

Page({
  data: {
    newProblems: problems.slice(0, 2),
    reviewProblems: [],
  },
  onShow() {
    this.setData({ today: new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) })
  },
  openProblem(e) {
    wx.navigateTo({ url: `/pages/question-detail/index?id=${e.currentTarget.dataset.id}` })
  },
  createPlan() {
    wx.showToast({ title: '计划功能将在阶段 2 开放', icon: 'none' })
  },
})
