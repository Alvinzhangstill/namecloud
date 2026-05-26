// ============================================
// 存储管理 - localStorage 封装
// ============================================
const Storage = {
  // ---------- 历史记录（已生成过的名字） ----------
  getHistory() {
    return JSON.parse(localStorage.getItem('name_history') || '[]');
  },
  addToHistory(names) {
    const history = this.getHistory();
    names.forEach(n => {
      if (!history.includes(n)) history.push(n);
    });
    localStorage.setItem('name_history', JSON.stringify(history));
  },
  isInHistory(name) {
    return this.getHistory().includes(name);
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
