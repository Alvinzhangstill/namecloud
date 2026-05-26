// ============================================
// AI 调用模块 - 调用 DeepSeek API 生成名字
// ============================================

const AI = {
  /**
   * 调用 DeepSeek 生成一批名字
   * @param {string} surname - 姓氏（可选）
   * @param {string} style - 风格偏好（可选）
   * @param {number} retryCount - 递归重试次数（内部使用）
   * @returns {Promise<Array>} 名字数组
   */
  async generateNames(surname = '', style = '', retryCount = 0) {
    const discarded = Storage.getDiscarded();
    const history = Storage.getHistory();

    // 构建 prompt
    let prompt = `你是一位精通中文取名的大师。请生成 ${CONFIG.NAMES_COUNT} 个中文名字（不含姓氏），每个名字2个字。`;

    if (surname) {
      prompt += `\n姓氏为"${surname}"，请结合姓氏生成完整的姓名。`;
    }

    if (style) {
      prompt += `\n风格偏好：${style}。`;
    }

    // 抛弃池信息
    if (discarded.names.length > 0) {
      prompt += `\n以下名字已被用户排除，请不要再生成：${discarded.names.join('、')}。`;
    }
    if (discarded.styles.length > 0) {
      prompt += `\n以下风格已被用户排除，请避免这些风格：${discarded.styles.join('、')}。`;
    }

    // 历史记录去重（传入最近 200 个已生成的名字，让 AI 避免重复）
    if (history.length > 0) {
      prompt += `\n以下名字已经出现过，请不要再生成：${history.slice(-200).join('、')}。`;
    }

    prompt += `\n
请严格按照以下 JSON 格式返回结果（只返回 JSON，不要有其他文字）：
{
  "names": [
    {
      "name": "安澜",
      "charAnalysis": "安：平安、安宁；澜：波澜、大波浪",
      "meaning": "波澜不惊，安然自若，寓意一生平安顺遂又不失气度",
      "gender": "通用",
      "style": "文雅",
      "poem": "出自《岳阳楼记》：'波澜不惊，上下天光'",
      "score": 92
    }
  ]
}

要求：
- 每个名字必须寓意美好，有文化底蕴
- 评分范围 60-99 分
- 风格标签从以下选择：文雅、大气、现代、古典、自然、简约、诗意、温婉、豪迈、清新
- 适合性别：男孩、女孩、通用
- 诗词出处尽量真实，如果不确定可以写"暂无直接出处"
- 确保名字不重复，且与上面列出的已存在名字不重复`;

    try {
      const response = await fetch(CONFIG.DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: CONFIG.DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: '你是一位精通中文取名的大师，擅长根据音韵、字义、文化典故为新生儿取寓意美好的名字。请始终以 JSON 格式返回数据。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // 尝试解析 JSON
      let result;
      try {
        // 如果返回内容包含 markdown 代码块，提取 JSON
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[1]);
        } else {
          result = JSON.parse(content);
        }
      } catch (e) {
        console.error('JSON 解析失败，原始内容:', content);
        throw new Error('AI 返回格式异常，请重试');
      }

      if (!result.names || !Array.isArray(result.names)) {
        throw new Error('AI 返回数据格式不正确');
      }

      // 过滤掉抛弃池和历史中的名字（二次保障）
      const filteredNames = result.names.filter(n => {
        const fullName = surname ? surname + n.name : n.name;
        return !Storage.isDiscarded(fullName) && !Storage.isInHistory(fullName);
      });

      // 自身去重（同一批返回中可能有重复）
      const uniqueNames = [];
      const seen = new Set();
      for (const n of filteredNames) {
        if (!seen.has(n.name)) {
          seen.add(n.name);
          uniqueNames.push(n);
        }
      }

      // 如果过滤后不够，递归重试补充（最多 3 次）
      if (uniqueNames.length < CONFIG.NAMES_COUNT && retryCount < 3) {
        console.warn(`AI 返回了 ${uniqueNames.length} 个新名字，不足 ${CONFIG.NAMES_COUNT} 个，正在补充...`);
        const extra = await AI.generateNames(surname, style, retryCount + 1);
        // 合并并去重
        for (const n of extra) {
          if (!seen.has(n.name)) {
            seen.add(n.name);
            uniqueNames.push(n);
          }
          if (uniqueNames.length >= CONFIG.NAMES_COUNT) break;
        }
      }

      // 记录到历史
      const nameList = uniqueNames.map(n => surname ? surname + n.name : n.name);
      Storage.addToHistory(nameList);

      return uniqueNames.slice(0, CONFIG.NAMES_COUNT);

    } catch (error) {
      console.error('AI 调用失败:', error);
      throw error;
    }
  },
};
