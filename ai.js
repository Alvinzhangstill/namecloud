// ============================================
// AI 调用模块 - DeepSeek 名字生成
// 支持流式增量展示，失败时回退普通请求
// ============================================

const AI = {
  async generateNames(surname = '', gender = '通用', options = {}) {
    const normalized = typeof options === 'number'
      ? { retryCount: options }
      : { retryCount: 0, onProgress: null, ...options };

    if (normalized.onProgress && this.canStream()) {
      try {
        return await this.generateStream(surname, gender, normalized);
      } catch (err) {
        console.warn('流式生成失败，回退普通模式:', err);
      }
    }

    return this.generateRegular(surname, gender, normalized);
  },

  canStream() {
    return typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined';
  },

  async generateStream(surname, gender, { onProgress }) {
    const response = await this.requestNames(surname, gender, { stream: true });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const progressed = new Set();
    let fullContent = '';
    let lineBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      lines.forEach((line) => {
        const delta = this.readStreamDelta(line);
        if (!delta) return;

        fullContent += delta;
        const parsed = NameEngine.extractCompleteNameObjects(fullContent);
        const filtered = this.filterNames(parsed, surname, CONFIG.NAMES_COUNT);
        const fresh = NameEngine.takeFreshNames(filtered, progressed);

        if (fresh.length > 0) {
          onProgress(fresh, Math.min(progressed.size, CONFIG.NAMES_COUNT));
        }
      });
    }

    let names = this.filterNames(
      NameEngine.extractCompleteNameObjects(fullContent),
      surname,
      CONFIG.NAMES_COUNT
    );

    if (names.length < CONFIG.NAMES_COUNT) {
      const extra = await this.generateRegular(surname, gender, {
        retryCount: 0,
        skipHistoryWrite: true,
      });
      names = this.mergeNames(names, extra, CONFIG.NAMES_COUNT);
      const fresh = NameEngine.takeFreshNames(names, progressed);
      if (fresh.length > 0) onProgress(fresh, names.length);
    }

    this.rememberNames(names, surname);
    return names.slice(0, CONFIG.NAMES_COUNT);
  },

  async generateRegular(surname, gender, options = {}) {
    const response = await this.requestNames(surname, gender, { stream: false });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const result = this.parseRegularContent(content);
    let names = this.filterNames(result.names || [], surname, CONFIG.NAMES_COUNT);

    if (names.length < CONFIG.NAMES_COUNT && (options.retryCount || 0) < 1) {
      console.warn(`仅 ${names.length} 个新名字，补充一次...`);
      const extra = await this.generateRegular(surname, gender, {
        ...options,
        retryCount: (options.retryCount || 0) + 1,
        skipHistoryWrite: true,
      });
      names = this.mergeNames(names, extra, CONFIG.NAMES_COUNT);
    }

    if (!options.skipHistoryWrite) this.rememberNames(names, surname);
    return names.slice(0, CONFIG.NAMES_COUNT);
  },

  async requestNames(surname, gender, { stream }) {
    const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: '你是中文取名大师，始终返回严格 JSON。' },
          { role: 'user', content: this.buildPrompt(surname, gender) },
        ],
        temperature: 0.78,
        max_tokens: 3072,
        stream,
      }),
    });

    if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
    return response;
  },

  buildPrompt(surname, gender) {
    const discarded = Storage.getDiscarded();
    const history = Storage.getHistory();
    const givenHistory = Storage.getGivenNameHistory();
    const commonSurnames = Storage.getCommonSurnames
      ? [...Storage.getCommonSurnames()].filter((item) => item.length === 1).slice(0, 80)
      : [];

    const lines = [
      `请生成 ${CONFIG.NAMES_COUNT} 个中文名字，不含姓氏，每个名字2个字。`,
      '返回严格 JSON，不要 Markdown，不要解释。',
      '格式：{"names":[{"name":"安澜","charAnalysis":"安：平安；澜：波澜","meaning":"波澜不惊，安然自若","gender":"通用","style":"文雅","poem":"出自《岳阳楼记》","score":92}]}',
      '要求：寓意好，评分 60-99，风格从文雅/大气/现代/古典/自然/简约/诗意/温婉/豪迈/清新中选，性别为男孩/女孩/通用。',
      `名字首字尽量避免这些常见姓氏：${commonSurnames.join('、')}。`,
    ];

    if (surname) {
      lines.push(`姓氏为"${surname}"，名字中不能出现"${surname}"中的任何字。`);
    }
    if (gender && gender !== '通用') {
      lines.push(`性别倾向：${gender}。`);
    }
    if (history.length > 0) {
      lines.push(`以下完整姓名已出现过，勿重复：${history.slice(-120).join('、')}。`);
    }
    if (givenHistory.length > 0) {
      lines.push(`以下名字已用过，勿重复：${givenHistory.slice(-120).join('、')}。`);
    }
    if (discarded.names.length > 0) {
      lines.push(`已排除名字：${discarded.names.join('、')}。`);
    }
    if (discarded.styles.length > 0) {
      lines.push(`已排除风格：${discarded.styles.join('、')}。`);
    }

    return lines.join('\n');
  },

  readStreamDelta(line) {
    if (!line.startsWith('data: ')) return '';
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return '';

    try {
      return JSON.parse(payload).choices?.[0]?.delta?.content || '';
    } catch (_) {
      return '';
    }
  },

  parseRegularContent(content) {
    try {
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      return JSON.parse(fenced ? fenced[1] : content);
    } catch (e) {
      console.error('JSON 解析失败:', content);
      throw new Error('AI 返回格式异常，请重试');
    }
  },

  filterNames(names, surname, limit) {
    return NameEngine.filterUniqueNames(names, {
      surname,
      storage: Storage,
      limit,
    });
  },

  mergeNames(primary, extra, limit) {
    const seen = new Set();
    const merged = [];

    [...primary, ...extra].forEach((item) => {
      if (!item?.name || seen.has(item.name)) return;
      seen.add(item.name);
      merged.push(item);
    });

    return merged.slice(0, limit);
  },

  rememberNames(names, surname) {
    Storage.addToHistory(names.map((item) => surname ? surname + item.name : item.name));
    Storage.addToGivenNameHistory(names.map((item) => item.name));
  },
};

if (typeof window !== 'undefined') {
  window.AI = AI;
}
