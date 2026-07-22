const { questionBanks, problems } = require('../../services/mock-data')

Page({
  data: {
    currentBank: questionBanks[0],
    activeBankId: 0,
    keyword: '',
    categories: ['全部'],
    activeCategory: '全部',
    displayedProblems: [],
    isCloudData: false,
  },
  onLoad() {
    this.loadCloudProblems()
  },
  chooseCategory(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.name })
    this.loadCloudProblems()
  },
  search(e) {
    this.setData({ keyword: e.detail.value })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.loadCloudProblems(), 300)
  },
  onUnload() { clearTimeout(this.searchTimer) },
  loadCloudProblems() {
    const { keyword, activeCategory } = this.data
    wx.cloud.callFunction({
      name: 'getQuestionBank',
      data: {
        action: 'list',
        bankCode: 'leetcode-hot-100',
        keyword,
        category: activeCategory === '全部' ? '' : activeCategory,
      },
    }).then(({ result }) => {
      if (!result || !result.success) throw new Error((result && result.message) || '云端题库不可用')
      const displayedProblems = result.problems.map((item) => ({
        ...item,
        difficultyClass: this.getDifficultyClass(item.difficulty),
      }))
      const app = getApp()
      app.globalData.questionCache = app.globalData.questionCache || {}
      app.globalData.questionCache[result.bank.code] = result.problems
      this.setData({
        currentBank: result.bank,
        categories: ['全部', ...result.categories],
        displayedProblems,
        isCloudData: true,
      })
    }).catch((error) => {
      console.warn('读取云端题库失败，已使用演示数据', error)
      this.refreshMockProblems()
    })
  },
  refreshMockProblems() {
    const selected = problems.filter((item) => item.bankId === this.data.activeBankId)
    const categories = ['全部', ...new Set(selected.map((item) => item.category))]
    const displayedProblems = selected
      .filter((item) => (
        (this.data.activeCategory === '全部' || item.category === this.data.activeCategory)
        && item.title.includes(this.data.keyword)
      ))
      .map((item) => ({ ...item, difficultyClass: this.getDifficultyClass(item.difficulty) }))
    this.setData({ categories, displayedProblems, isCloudData: false })
  },
  getDifficultyClass(difficulty) {
    return ({ 简单: 'easy', 中等: 'medium', 困难: 'hard' })[difficulty] || 'medium'
  },
  openProblem(e) {
    wx.navigateTo({ url: `/pages/question-detail/index?id=${e.currentTarget.dataset.id}&bankCode=leetcode-hot-100` })
  },
})
