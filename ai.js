// ============================================
// AI 调用模块 - 调用 DeepSeek API 生成名字
// 支持流式生成 + 渐进渲染，大幅提升感知速度
// ============================================

const AI = {

  // ---- 从文本中提取已完成的名字 JSON 对象（用括号匹配，稳健） ----
  _extractCompleteNames(content) {
    const results = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let esc = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          try {
            const obj = JSON.parse(content.substring(start, i + 1));
            if (obj.name && obj.score != null) results.push(obj);
          } catch (_) { /* 尚未完整，忽略 */ }
          start = -1;
        }
      }
    }
    return results;
  },

  /**
   * 流式生成名字（支持 onProgress 回调）
   * 当提供 onProgress 时，名字随 AI 输出实时涌现，大幅提升感知速度
   */
  async _generateStream(surname, gender, onProgress) {
    const discarded = Storage.getDiscarded();
    const history = Storage.getHistory();
    const givenHistory = Storage.getGivenNameHistory();

    // ---- 构建 prompt（与 generateNames 相同） ----
    let prompt = `你是一位精通中文取名的大师。请生成 ${CONFIG.NAMES_COUNT} 个中文名字（不含姓氏），每个名字2个字。`;

    if (surname) {
      prompt += `\n姓氏为"${surname}"。`;
      prompt += `\n⚠️ 重要：给定名字（given name）中绝对不能包含"${surname}"中的任何字。例如姓"张"时，名字不能是"张澜"或"学张"等。`;
    }
    if (gender && gender !== '通用') prompt += `\n性别倾向：${gender}。`;

    const commonSurnamesForPrompt = Storage.getCommonSurnames
      ? [...Storage.getCommonSurnames()].filter(s => s.length === 1).slice(0, 80)
      : [];
    prompt += `\n⚠️ 名字首字不得是以下常见姓氏：${commonSurnamesForPrompt.join('、')}。`;

    if (discarded.names.length > 0)
      prompt += `\n以下名字已被用户排除：${discarded.names.join('、')}。`;
    if (history.length > 0)
      prompt += `\n以下完整姓名已出现过，勿重复其中 given name：${history.slice(-200).join('、')}。`;
    if (givenHistory.length > 0)
      prompt += `\n以下 given name 已用过：${givenHistory.slice(-200).join('、')}。`;

    prompt += `\n\n请严格按以下 JSON 格式返回（只返回 JSON）：\n{"names":[{"name":"安澜","charAnalysis":"安：平安；澜：波澜","meaning":"波澜不惊，安然自若","gender":"通用","style":"文雅","poem":"出自《岳阳楼记》","score":92}]}\n\n要求：寓意美好不分风格，评分 60-99，风格标签可从：文雅/大气/现代/古典/自然/简约/诗意/温婉/豪迈/清新 中任选，性别：男孩/女孩/通用。${surname ? `名字中绝对不能出现"${surname}"。` : ''}名字首字不能是常见姓氏字。`;

    // ---- 发送流式请求 ----
    const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: '你是一位精通中文取名的大师。请始终以 JSON 格式返回数据。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!response.ok)
      throw new Error(`API 请求失败: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    const streamedNames = new Set();   // 已经推送给前端的名字（given name）
    let finalResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';       // 保留不完整行

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;

            // 从当前累积内容中提取已完成的名字对象
            const complete = this._extractCompleteNames(fullContent);
            const newNames = complete.filter(n => !streamedNames.has(n.name));

            if (newNames.length > 0 && onProgress) {
              newNames.forEach(n => streamedNames.add(n.name));
              onProgress(newNames, streamedNames.size);
            }
          }
        } catch (_) { /* 跳过无法解析的行 */ }
      }
    }

    // ---- 流结束后做完整提取 & 多层过滤 ----
    if (!finalResult) {
      const allNames = this._extractCompleteNames(fullContent);

      // 过滤
      let filtered = allNames.filter(n => {
        const full = surname ? surname + n.name : n.name;
        return !Storage.isDiscarded(full) && !Storage.isInHistory(full);
      });

      // 姓氏字过滤
      if (surname) {
        filtered = filtered.filter(n => {
          for (const ch of surname) if (n.name.includes(ch)) return false;
          return true;
        });
      }

      // 强姓氏首字过滤
      filtered = filtered.filter(n => !Storage.isStrongSurname(n.name[0]));

      // given-name 历史过滤
      filtered = filtered.filter(n => !Storage.isInGivenNameHistory(n.name));

      // 自身去重
      const seen = new Set();
      const unique = [];
      for (const n of filtered) {
        if (!seen.has(n.name)) { seen.add(n.name); unique.push(n); }
      }

      // 记录历史
      Storage.addToHistory(unique.map(n => surname ? surname + n.name : n.name));
      Storage.addToGivenNameHistory(unique.map(n => n.name));

      finalResult = unique.slice(0, CONFIG.NAMES_COUNT);
    }

    return finalResult;
  },

  /**
   * 生成名字（主入口）
   * 优先使用流式生成；失败时回退到非流式
   * @param {string} surname - 姓氏
   * @param {string} gender - 性别：男孩/女孩/通用
   * @param {number} retryCount - 递归重试次数
   * @param {function} onProgress - 流式进度回调 (newNames, totalCount)
   */
  async generateNames(surname = '', gender = '通用', retryCount = 0, onProgress = null) {
    // 有回调 → 流式
    if (onProgress) {
      try {
        return await this._generateStream(surname, gender, onProgress);
      } catch (err) {
        console.warn('流式生成失败，回退常规模式:', err);
      }
    }

    // ---- 常规非流式模式（回退 + 递归重试） ----
    const discarded = Storage.getDiscarded();
    const history = Storage.getHistory();
    const givenHistory = Storage.getGivenNameHistory();

    let prompt = `你是一位精通中文取名的大师。请生成 ${CONFIG.NAMES_COUNT} 个中文名字（不含姓氏），每个名字2个字。`;

    if (surname) {
      prompt += `\n姓氏为"${surname}"。`;
      prompt += `\n⚠️ 重要：给定名字中绝对不能包含"${surname}"中的任何字。`;
    }
    if (gender && gender !== '通用') prompt += `\n性别倾向：${gender}。`;

    const commonList = Storage.getCommonSurnames
      ? [...Storage.getCommonSurnames()].filter(s => s.length === 1).slice(0, 80)
      : [];
    prompt += `\n⚠️ 名字首字不得是以下常见姓氏：${commonList.join('、')}。`;

    if (discarded.names.length > 0)
      prompt += `\n已排除名字：${discarded.names.join('、')}。`;
    if (discarded.styles.length > 0)
      prompt += `\n已排除风格：${discarded.styles.join('、')}。`;
    if (history.length > 0)
      prompt += `\n已出现完整姓名：${history.slice(-200).join('、')}。`;
    if (givenHistory.length > 0)
      prompt += `\n已用过 given name：${givenHistory.slice(-200).join('、')}。`;

    prompt += `\n\n请严格按 JSON 返回：\n{"names":[{"name":"安澜","charAnalysis":"安：平安；澜：波澜","meaning":"波澜不惊，安然自若","gender":"通用","style":"文雅","poem":"出自《岳阳楼记》","score":92}]}\n\n要求：寓意美好不分风格，评分 60-99，风格标签可从：文雅/大气/现代/古典/自然/简约/诗意/温婉/豪迈/清新 中任选，性别：男孩/女孩/通用。${surname ? `名字中不能出现"${surname}"。` : ''}名字首字不能是常见姓氏字。`;

    const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: '你是一位精通中文取名的大师。请始终以 JSON 格式返回数据。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 4096,
      }),
    });

    if (!response.ok)
      throw new Error(`API 请求失败: ${response.status}`);

    const data = await response.json();
    const content = data.choices[0].message.content;

    let result;
    try {
      const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      result = JSON.parse(m ? m[1] : content);
    } catch (e) {
      console.error('JSON 解析失败:', content);
      throw new Error('AI 返回格式异常，请重试');
    }

    if (!result.names || !Array.isArray(result.names))
      throw new Error('AI 返回数据格式不正确');

    // 多层过滤
    let filtered = result.names.filter(n => {
      const full = surname ? surname + n.name : n.name;
      return !Storage.isDiscarded(full) && !Storage.isInHistory(full);
    });
    if (surname)
      filtered = filtered.filter(n => { for (const ch of surname) if (n.name.includes(ch)) return false; return true; });
    filtered = filtered.filter(n => !Storage.isStrongSurname(n.name[0]));
    filtered = filtered.filter(n => !Storage.isInGivenNameHistory(n.name));

    const seen = new Set();
    const unique = [];
    for (const n of filtered) {
      if (!seen.has(n.name)) { seen.add(n.name); unique.push(n); }
    }

    if (unique.length < CONFIG.NAMES_COUNT && retryCount < 3) {
      console.warn(`仅 ${unique.length} 个新名字，补充中...`);
      const extra = await AI.generateNames(surname, gender, retryCount + 1, null);
      for (const n of extra) {
        if (!seen.has(n.name)) { seen.add(n.name); unique.push(n); }
        if (unique.length >= CONFIG.NAMES_COUNT) break;
      }
    }

    Storage.addToHistory(unique.map(n => surname ? surname + n.name : n.name));
    Storage.addToGivenNameHistory(unique.map(n => n.name));

    return unique.slice(0, CONFIG.NAMES_COUNT);
  },
};
