Component({
  data: { selected: 0, items: [
    { path: '/pages/home/index', text: '首页', icon: '⌂' },
    { path: '/pages/question-bank/index', text: '题库', icon: '▦' },
    { path: '/pages/stats/index', text: '统计', icon: '◕' },
    { path: '/pages/experience/index', text: '经验', icon: '✦' },
    { path: '/pages/profile/index', text: '我的', icon: '☺' },
  ] },
  lifetimes: { attached() { this.updateSelected() } },
  pageLifetimes: { show() { this.updateSelected() } },
  methods: {
    updateSelected() {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      const route = current ? `/${current.route}` : ''
      const selected = this.data.items.findIndex((item) => item.path === route)
      this.setData({ selected: selected < 0 ? 0 : selected })
    },
    switchTab(event) {
      const path = event.currentTarget.dataset.path
      wx.switchTab({ url: path })
    },
  },
})
