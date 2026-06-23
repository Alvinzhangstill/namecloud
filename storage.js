// ============================================
// 存储管理 - localStorage 封装
// ============================================

// 常见中文姓氏「全量版」（用于 AI prompt 提醒）
const COMMON_SURNAMES = new Set([
  '王','李','张','刘','陈','杨','赵','黄','周','吴','徐','孙','马','胡','朱','郭','何','林','罗','高',
  '梁','郑','谢','宋','唐','韩','曹','许','邓','冯','萧','程','蔡','彭','潘','袁','于','董','余','苏',
  '叶','吕','魏','蒋','田','杜','丁','沈','姜','范','江','傅','钟','卢','汪','戴','崔','任','陆','廖',
  '姚','方','金','邱','夏','谭','韦','贾','邹','石','熊','孟','秦','阎','薛','侯','雷','白','龙','段',
  '郝','孔','邵','史','毛','常','万','顾','赖','武','康','贺','严','尹','钱','施','牛','洪','龚','汤',
  '陶','黎','温','莫','易','樊','乔','文','安','殷','颜','庄','章','鲁','倪','庞','邢','俞','翟','蓝',
  '聂','齐','向','关','焦','柳','欧','尚','管','游','涂','兰','芦','季','童','梅','盛','葛','连','申',
  '欧阳','司马','上官','诸葛','东方','皇甫','尉迟','令狐','慕容','公孙',
]);

// 强姓氏列表（几乎只用作姓氏，极少用于名字的字符，用于后处理过滤）
// 排除"安、文、方、林、金、石、白、叶、江、田、钟、孔、毛、常、顾、康、严、尹、施、牛、洪、陶、温、莫、易、樊、乔、殷、颜、庄、章、鲁、倪、庞、邢、俞、翟、蓝、聂、齐、向、关、焦、柳、欧、尚、管、游、涂、兰、芦、季、童、梅、盛、葛、连、申"等容易在名字中出现的字
const STRONG_SURNAMES = new Set([
  '张','李','王','刘','陈','杨','赵','黄','周','吴','徐','孙','马','胡','朱','郭','何','罗','郑',
  '谢','韩','曹','许','邓','冯','程','蔡','彭','潘','董','苏','吕','魏','蒋','沈','范','傅','戴',
  '崔','任','陆','廖','姚','邱','贾','邹','熊','孟','阎','薛','侯','郝','邵','万','赖','武','贺',
  '龚','于','袁','余','杜','丁','姜','卢','汪','谭','韦','龙','段',
]);

const Storage = {
  // ---------- 历史记录（完整姓名，用于 AI prompt 去重） ----------
  getHistory() {
    return JSON.parse(localStorage.getItem('name_history') || '[]');
  },
  addToHistory(names) {
    const history = this.getHistory();
    names.forEach(n => {
      if (!history.includes(n)) history.push(n);
    });
    // 只保留最近 500 条，防止 localStorage 膨胀
    if (history.length > 500) {
      localStorage.setItem('name_history', JSON.stringify(history.slice(-500)));
    } else {
      localStorage.setItem('name_history', JSON.stringify(history));
    }
  },
  isInHistory(name) {
    return this.getHistory().includes(name);
  },

  // ---------- Given-name 历史（不含姓氏，用于跨姓氏去重） ----------
  getGivenNameHistory() {
    return JSON.parse(localStorage.getItem('name_given_history') || '[]');
  },
  addToGivenNameHistory(givenNames) {
    const h = this.getGivenNameHistory();
    givenNames.forEach(n => {
      if (!h.includes(n)) h.push(n);
    });
    if (h.length > 500) {
      localStorage.setItem('name_given_history', JSON.stringify(h.slice(-500)));
    } else {
      localStorage.setItem('name_given_history', JSON.stringify(h));
    }
  },
  isInGivenNameHistory(givenName) {
    return this.getGivenNameHistory().includes(givenName);
  },

  // ---------- 姓氏相关工具 ----------
  // 后处理过滤用：强姓氏（几乎只用作姓氏的字）
  isStrongSurname(char) {
    return STRONG_SURNAMES.has(char);
  },
  // AI prompt 用：全量常见姓氏（含"安、文、林"等可做名字的字）
  getCommonSurnames() {
    return COMMON_SURNAMES;
  },

  // ---------- 我的仓库（收藏） ----------
  getFavorites() {
    return JSON.parse(localStorage.getItem('name_favorites') || '[]');
  },
  addFavorite(nameData) {
    const favorites = this.getFavorites();
    // 避免重复收藏
    if (favorites.some(f => f.name === nameData.name)) return false;
    favorites.push({
      ...nameData,
      collectedAt: new Date().toISOString(),
      personalScore: 0, // 用户自行打分，0 表示未打分
    });
    localStorage.setItem('name_favorites', JSON.stringify(favorites));
    return true;
  },
  removeFavorite(name) {
    let favorites = this.getFavorites();
    favorites = favorites.filter(f => f.name !== name);
    localStorage.setItem('name_favorites', JSON.stringify(favorites));
  },
  updateScore(name, score) {
    const favorites = this.getFavorites();
    const item = favorites.find(f => f.name === name);
    if (item) {
      item.personalScore = score;
      localStorage.setItem('name_favorites', JSON.stringify(favorites));
    }
  },
  isFavorite(name) {
    return this.getFavorites().some(f => f.name === name);
  },

  // ---------- 抛弃池 ----------
  getDiscarded() {
    return JSON.parse(localStorage.getItem('name_discarded') || '{"names":[],"styles":[]}');
  },
  discardName(name) {
    const data = this.getDiscarded();
    if (!data.names.includes(name)) {
      data.names.push(name);
      localStorage.setItem('name_discarded', JSON.stringify(data));
    }
  },
  discardStyle(style) {
    const data = this.getDiscarded();
    if (!data.styles.includes(style)) {
      data.styles.push(style);
      localStorage.setItem('name_discarded', JSON.stringify(data));
    }
  },
  restoreName(name) {
    const data = this.getDiscarded();
    data.names = data.names.filter(n => n !== name);
    localStorage.setItem('name_discarded', JSON.stringify(data));
  },
  restoreStyle(style) {
    const data = this.getDiscarded();
    data.styles = data.styles.filter(s => s !== style);
    localStorage.setItem('name_discarded', JSON.stringify(data));
  },
  isDiscarded(name) {
    return this.getDiscarded().names.includes(name);
  },
};
