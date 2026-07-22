const questionBanks = [
  { id: 0, name: 'LeetCode Hot 100', count: 100, description: '高频算法面试题精选' },
  { id: 1, name: '代码随想录', count: 142, description: '系统化算法训练题单' },
]

const problems = [
  { id: 1, bankId: 0, number: 1, title: '两数之和', difficulty: '简单', category: '哈希', tags: ['数组', '哈希表'], summary: '在数组中找出和为目标值的两个元素下标。', link: 'https://leetcode.cn/problems/two-sum/' },
  { id: 49, bankId: 0, number: 49, title: '字母异位词分组', difficulty: '中等', category: '哈希', tags: ['数组', '哈希表', '字符串'], summary: '将字母异位词组合成列表。', link: 'https://leetcode.cn/problems/group-anagrams/' },
  { id: 128, bankId: 0, number: 128, title: '最长连续序列', difficulty: '中等', category: '哈希', tags: ['并查集', '数组', '哈希表'], summary: '找出无序数组中的最长连续数字序列长度。', link: 'https://leetcode.cn/problems/longest-consecutive-sequence/' },
  { id: 283, bankId: 0, number: 283, title: '移动零', difficulty: '简单', category: '双指针', tags: ['数组', '双指针'], summary: '将所有零移至数组末尾，并保持非零元素相对顺序。', link: 'https://leetcode.cn/problems/move-zeroes/' },
  { id: 704, bankId: 1, number: 704, title: '二分查找', difficulty: '简单', category: '数组', tags: ['数组', '二分查找'], summary: '在有序数组中查找目标值的位置。', link: 'https://leetcode.cn/problems/binary-search/' },
  { id: 27, bankId: 1, number: 27, title: '移除元素', difficulty: '简单', category: '数组', tags: ['数组', '双指针'], summary: '原地移除指定元素并返回新长度。', link: 'https://leetcode.cn/problems/remove-element/' },
]

module.exports = { questionBanks, problems }
