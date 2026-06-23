// ============================================
// AI 调用模块 - 调用 DeepSeek API 生成名字
// ============================================

const AI = {
  async generateNames(surname = '', gender = '通用', retryCount = 0) {
    const discarded = Storage.getDiscarded();
    const history = Storage.getHistory();

    // ---- 构建 prompt ----
    let prompt = `你是一位精通中文取名的大师。请生成 ${CONFIG.NAMES_COUNT} 个中文名字（不含姓氏），每个名字2个字。`;

    if (surname) {
      prompt += `\n姓氏为"${surname}"。⚠️ 名字中不能出现"${surname}"中的任何字。`;
    }
    if (gender && gender !== '通用') {
      prompt += `\n性别倾向：${gender}。`;
    }

    // 历史去重
    const givenHistory = Storage.getGivenNameHistory();
    if (history.length > 0) {
      prompt += `\n以下名字已出现过，勿重复：${history.slice(-200).join('、')}。`;
    }
    if (givenHistory.length > 0) {
      prompt += `\n以下 given name 已用过：${givenHistory.slice(-200).join('、')}。`;
    }
    if (discarded.names.length > 0) {
      prompt += `\n已排除：${discarded.names.join('、')}。`;
    }

    prompt += `\n\n返回 JSON：\n{"names":[{"name":"安澜","charAnalysis":"安：平安；澜：波澜","meaning":"波澜不惊","gender":"通用","style":"文雅","poem":"出自《岳阳楼记》","score":92}]}\n要求：寓意好，评分 60-99，风格选：文雅/大气/现代/古典/自然/简约/诗意/温婉/豪迈/清新，性别：男孩/女孩/通用。${surname ? `名字不能含"${surname}"。` : ''}首字避免常见姓氏。`;

    // ---- 调用 API ----
    const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: '你是中文取名大师，始终返回 JSON。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);

    const data = await response.json();
    const content = data.choices[0].message.content;

    // ---- 解析 JSON ----
    let result;
    try {
      const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      result = JSON.parse(m ? m[1] : content);
    } catch (e) {
      console.error('JSON 解析失败:', content);
      throw new Error('AI 返回格式异常，请重试');
    }

    if (!result.names || !Array.isArray(result.names)) {
      throw new Error('AI 返回数据格式不正确');
    }

    // ---- 过滤 ----
    let filtered = result.names.filter(n => {
      const full = surname ? surname + n.name : n.name;
      return !Storage.isDiscarded(full) && !Storage.isInHistory(full);
    });

    // 名字含姓氏字 → 过滤
    if (surname) {
      filtered = filtered.filter(n => {
        for (const ch of surname) if (n.name.includes(ch)) return false;
        return true;
      });
    }

    // 首字是强姓氏 → 过滤
    filtered = filtered.filter(n => !Storage.isStrongSurname(n.name[0]));

    // given-name 历史去重
    filtered = filtered.filter(n => !Storage.isInGivenNameHistory(n.name));

    // 自身去重
    const seen = new Set();
    const unique = [];
    for (const n of filtered) {
      if (!seen.has(n.name)) { seen.add(n.name); unique.push(n); }
    }

    // ---- 不够则递归补充 ----
    if (unique.length < CONFIG.NAMES_COUNT && retryCount < 3) {
      console.warn(`仅 ${unique.length} 个，补充中...`);
      const extra = await AI.generateNames(surname, gender, retryCount + 1);
      for (const n of extra) {
        if (!seen.has(n.name)) { seen.add(n.name); unique.push(n); }
        if (unique.length >= CONFIG.NAMES_COUNT) break;
      }
    }

    // ---- 记录历史 ----
    Storage.addToHistory(unique.map(n => surname ? surname + n.name : n.name));
    Storage.addToGivenNameHistory(unique.map(n => n.name));

    return unique.slice(0, CONFIG.NAMES_COUNT);
  },
};
