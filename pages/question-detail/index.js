const { problems } = require('../../services/mock-data')

Page({
  data: { problem: null, bankName: '', loading: true, loadError: false, activeTab: 'description', canPrev: false, canNext: true, previousProblemId: '', nextProblemId: '', bankCode: 'leetcode-hot-100', taskProblemIds: [], records: [], recordsLoading: false, expandedRecordId: '' },
  onLoad(options) {
    this.setData({ bankCode: options.bankCode || 'leetcode-hot-100' })
    this.openRecordsAfterLoad = options.tab === 'records'
    const taskNavigation = getApp().globalData.taskNavigation
    if (options.context && taskNavigation && taskNavigation.bankCode === this.data.bankCode) this.setData({ taskProblemIds: taskNavigation.problemIds || [] })
    this.loadCloudProblem(options.id || String(problems[0].id))
  },
  onShow() {
    if (this.data.activeTab === 'records' && this.data.problem && this.data.problem.id) this.loadPracticeRecords()
  },
  loadCloudProblem(problemId) {
    this.currentProblemId = problemId
    this.setData({ loading: true, loadError: false })
    wx.cloud.callFunction({ name: 'getQuestionBank', data: { action: 'detail', bankCode: this.data.bankCode, problemId } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error('云端题目不可用')
        const taskIndex = this.data.taskProblemIds.indexOf(result.problem.id)
        const hasTaskContext = taskIndex >= 0
        const activeTab = this.openRecordsAfterLoad ? 'records' : 'description'
        this.openRecordsAfterLoad = false
        this.setData({ problem: result.problem, bankName: result.bank.name, loading: false, previousProblemId: hasTaskContext ? this.data.taskProblemIds[taskIndex - 1] || '' : result.previousProblemId, nextProblemId: hasTaskContext ? this.data.taskProblemIds[taskIndex + 1] || '' : result.nextProblemId, canPrev: hasTaskContext ? taskIndex > 0 : Boolean(result.previousProblemId), canNext: hasTaskContext ? taskIndex < this.data.taskProblemIds.length - 1 : Boolean(result.nextProblemId), activeTab, records: [], expandedRecordId: '' })
        if (activeTab === 'records') this.loadPracticeRecords()
      })
      .catch(() => this.setData({ loading: false, loadError: true, problem: null }))
  },
  retryLoad() { this.loadCloudProblem(this.currentProblemId) },
  previousProblem() { if (this.data.previousProblemId) this.loadCloudProblem(this.data.previousProblemId) },
  nextProblem() { if (this.data.nextProblemId) this.loadCloudProblem(this.data.nextProblemId) },
  selectTab(e) { const tab = e.currentTarget.dataset.tab; this.setData({ activeTab: tab, expandedRecordId: '' }); if (tab === 'records') this.loadPracticeRecords() },
  loadPracticeRecords() {
    if (!this.data.problem || !this.data.problem.id) return
    this.setData({ recordsLoading: true })
    wx.cloud.callFunction({ name: 'managePractice', data: { action: 'list', problemId: this.data.problem.id } })
      .then(({ result }) => this.setData({ records: result && result.success ? result.records : [], expandedRecordId: '' }))
      .catch(() => this.setData({ records: [] }))
      .finally(() => this.setData({ recordsLoading: false }))
  },
  expandRecord(e) { this.setData({ expandedRecordId: e.currentTarget.dataset.id }) },
  collapseRecords() { this.setData({ expandedRecordId: '' }) },
  slayProblem() {
    wx.showModal({
      title: '确认斩杀？',
      content: '斩杀后该题将直接升至 Lv5，并从后续新刷和复刷任务中移除；不会新增提交记录或打卡。',
      confirmText: '确认斩杀',
      confirmColor: '#d45b3f',
      success: ({ confirm }) => {
        if (!confirm) return
        wx.showLoading({ title: '正在斩杀' })
        wx.cloud.callFunction({ name: 'managePractice', data: { action: 'slay', problemId: this.data.problem.id } })
          .then(({ result }) => {
            if (!result || !result.success) throw new Error((result && result.error) || '斩杀失败')
            wx.showToast({ title: '已斩杀，Lv5', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 600)
          })
          .catch((error) => wx.showToast({ title: error.message || '斩杀失败，请重试', icon: 'none' }))
          .finally(() => wx.hideLoading())
      },
    })
  },
  copyLink() { wx.setClipboardData({ data: this.data.problem.link, success: () => wx.showToast({ title: '链接已复制', icon: 'success' }) }) },
  startPractice() { wx.navigateTo({ url: `/pages/practice-submit/index?id=${this.data.problem.id}&bankCode=${this.data.bankCode}` }) },
})
