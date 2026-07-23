function defaultLibrary() { return { thinkingMarkdown: '', syntaxMarkdown: '', lastRefinementLogId: '' } }
function appendMarkdown(existing, addition) { return addition ? (existing ? `${existing}\n\n${addition}` : addition) : existing }

function renderMarkdown(markdown) {
  const nodes = []; const lines = String(markdown || '').split('\n'); let code = []; let inCode = false
  const pushCode = () => { nodes.push({ name: 'pre', attrs: { style: 'margin:14rpx 0;padding:18rpx;border-radius:12rpx;color:#4e5266;background:#f3f4f8;font-family:monospace;font-size:23rpx;line-height:1.55;white-space:pre-wrap;' }, children: [{ type: 'text', text: code.join('\n') }] }); code = [] }
  lines.forEach((line) => {
    if (/^```\s*/.test(line)) { if (inCode) pushCode(); inCode = !inCode; return }
    if (inCode) { code.push(line); return }
    if (!line.trim()) return
    const style = /^\d+\.\s/.test(line) ? 'margin:12rpx 0;color:#34364b;font-size:27rpx;line-height:1.65;' : 'margin:10rpx 0;color:#4e5266;font-size:26rpx;line-height:1.6;'
    nodes.push({ name: 'div', attrs: { style }, children: [{ type: 'text', text: line }] })
  })
  if (inCode) pushCode()
  return nodes
}

Page({
  data: { plan: null, library: defaultLibrary(), thinkingNodes: [], syntaxNodes: [], editing: '', saving: false, dirty: false, cloudSaved: false, pendingLogId: '', pendingBeforeLibrary: null, actionText: '经验++', actionBusy: false, notice: null },
  onShow() {
    const tabBar = this.getTabBar && this.getTabBar()
    if (tabBar) tabBar.setData({ selected: 3 })
    wx.cloud.callFunction({ name: 'manageExperience', data: { action: 'get' } })
      .then(({ result }) => { this.setData({ pendingLogId: '', pendingBeforeLibrary: null, actionText: '经验++', actionBusy: false }); this.applyLibrary(result && result.success ? result.library : defaultLibrary(), result && result.success ? result.plan : null) })
      .catch(() => this.applyLibrary(defaultLibrary(), null))
  },
  onHide() { this.autoSave(false) },
  onUnload() { this.autoSave(false); clearTimeout(this.actionTimer) },
  applyLibrary(library, plan = this.data.plan) {
    const next = { ...defaultLibrary(), ...library }
    this.setData({ plan, library: next, thinkingNodes: renderMarkdown(next.thinkingMarkdown), syntaxNodes: renderMarkdown(next.syntaxMarkdown), dirty: false })
  },
  setSavedThenIdle() {
    clearTimeout(this.actionTimer)
    this.setData({ actionText: '保存成功', actionBusy: true, cloudSaved: true })
    this.actionTimer = setTimeout(() => this.setData({ actionText: '经验++', actionBusy: false }), 1000)
  },
  showRefineModal(title, content, confirmText) {
    this.setData({ actionText: '经验++', actionBusy: false })
    this.setData({ notice: { title, content, confirmText, isLetter: title === '给码农的一封信' } })
  },
  dismissNotice() { this.setData({ notice: null }) },
  async beginEdit(event) {
    const mode = event.currentTarget.dataset.mode
    if (this.data.editing && this.data.editing !== mode) await this.autoSave(false)
    this.setData({ editing: mode })
  },
  stopTap() {},
  inputMarkdown(event) {
    const field = event.currentTarget.dataset.mode === 'thinking' ? 'thinkingMarkdown' : 'syntaxMarkdown'
    this.setData({ [`library.${field}`]: event.detail.value.slice(0, 12000), dirty: true, cloudSaved: false })
  },
  async endEdit() { if (!this.data.editing) return; this.setData({ editing: '' }); await this.autoSave(false) },
  async autoSave(showToast = false) {
    if (this.data.pendingLogId) return this.commitRefinement(true)
    if (!this.data.dirty) return true
    if (this.savePromise) return this.savePromise
    const payload = { thinkingMarkdown: this.data.library.thinkingMarkdown, syntaxMarkdown: this.data.library.syntaxMarkdown }
    this.setData({ saving: true, actionText: '保存中', actionBusy: true })
    this.savePromise = wx.cloud.callFunction({ name: 'manageExperience', data: { action: 'saveMarkdown', ...payload } })
      .then(({ result }) => {
        if (!result || !result.success) throw new Error(result && result.message || '自动保存失败')
        const changedWhileSaving = this.data.library.thinkingMarkdown !== payload.thinkingMarkdown || this.data.library.syntaxMarkdown !== payload.syntaxMarkdown
        if (changedWhileSaving) this.setData({ dirty: true, actionText: '经验++', actionBusy: false })
        else { this.applyLibrary({ ...result.library, ...payload }); this.setSavedThenIdle() }
        if (showToast) wx.showToast({ title: '已自动保存', icon: 'success' })
        return true
      }).catch((error) => { this.setData({ actionText: '经验++', actionBusy: false }); wx.showToast({ title: error.message || '自动保存失败', icon: 'none' }); return false })
      .finally(() => { this.savePromise = null; this.setData({ saving: false }) })
    return this.savePromise
  },
  async handleAction() {
    if (this.data.actionBusy) return
    if (this.data.pendingLogId) return
    return this.refine()
  },
  async refine() {
    if (!await this.autoSave(false)) return
    const before = { ...this.data.library }
    this.setData({ actionText: '生成中', actionBusy: true })
    try {
      const { result } = await wx.cloud.callFunction({ name: 'manageExperience', data: { action: 'refine' } })
      if (result && result.code === 'NO_CONTENT') { this.showRefineModal('给码农的一封信', '这段时间还没有留下可新的复用的刷题总结。每次刷完题，在总结里面记下一步思路、一个坑或一条语法，码秘才好替你把经验沉淀下来哦~', '好的码秘，我也爱你😚'); return }
      if (result && result.code === 'NO_NEW_EXPERIENCE') { this.showRefineModal('暂无可追加经验', '这次总结里暂时没有足够明确、可复用的思路或语法。下次可以具体记录卡住的地方、关键判断或常用写法。', '知道了'); return }
      if (result && result.code === 'EXPERIENCE_DAILY_LIMIT') { this.showRefineModal('今日额度已用完', '“一键追加经验”每天最多使用 1 次。明天再来，让今天的总结继续沉淀吧。', '知道了'); return }
      if (!result || !result.success) throw new Error(result && result.message || '生成失败')
      const next = { ...before, thinkingMarkdown: appendMarkdown(before.thinkingMarkdown, result.addition.thinkingMarkdown), syntaxMarkdown: appendMarkdown(before.syntaxMarkdown, result.addition.syntaxMarkdown) }
      this.applyLibrary(next)
      this.setData({ pendingLogId: result.pendingLogId, pendingBeforeLibrary: before, editing: 'thinking', actionText: '已生成', actionBusy: false })
    } catch (error) { wx.showToast({ title: error.message || '生成失败，请重试', icon: 'none' }); this.setData({ actionText: '经验++', actionBusy: false }) }
  },
  async commitRefinement(isAuto = false) {
    this.setData({ saving: true, actionBusy: true, actionText: isAuto ? '已生成' : '保存中' })
    try {
      const { result } = await wx.cloud.callFunction({ name: 'manageExperience', data: { action: 'commitRefinement', logId: this.data.pendingLogId, thinkingMarkdown: this.data.library.thinkingMarkdown, syntaxMarkdown: this.data.library.syntaxMarkdown } })
      if (!result || !result.success) throw new Error(result && result.message || '保存失败')
      this.applyLibrary(result.library)
      this.setData({ pendingLogId: '', pendingBeforeLibrary: null })
      if (isAuto) this.setData({ actionText: '经验++', actionBusy: false, cloudSaved: true })
      else this.setSavedThenIdle()
    } catch (error) { wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' }); this.setData({ actionText: isAuto ? '已生成' : '保存', actionBusy: false }) } finally { this.setData({ saving: false }) }
  },
  undoRefinement() {
    const isPending = Boolean(this.data.pendingLogId); const logId = this.data.pendingLogId
    wx.showModal({ title: isPending ? '撤回本次生成？' : '撤销本次 AI 追加？', content: isPending ? '生成内容尚未保存，将直接丢弃。' : '将恢复到追加前的思路、语法文档和同步时间。', confirmText: isPending ? '确认撤回' : '确认撤销', success: async ({ confirm }) => {
      if (!confirm) return
      try {
        const { result } = await wx.cloud.callFunction({ name: 'manageExperience', data: { action: 'undo', logId } })
        if (!result || !result.success) throw new Error(result && result.message || '撤回失败')
        if (isPending) { this.applyLibrary(this.data.pendingBeforeLibrary); this.setData({ pendingLogId: '', pendingBeforeLibrary: null, actionText: '经验++', actionBusy: false }) } else this.applyLibrary(result.library)
        wx.showToast({ title: isPending ? '已撤回本次生成' : '已撤销本次追加', icon: 'success' })
      } catch (error) { wx.showToast({ title: error.message || '撤回失败，请重试', icon: 'none' }) }
    } })
  },
})
