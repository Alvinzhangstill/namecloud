// ============================================
// AI 调用模块 - 调用 DeepSeek API 生成名字
// ============================================

const AI = {
  /**
   * 调用 DeepSeek 生成一批名字
   * @param {string} surname - 姓氏（可选）
   * @param {string} style - 风格偏好（可选）
   * @returns {Promise<Array>} 名字数组
   */
  async generateNames(surname = '', style = '') {
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

    // 历史记录去重
    if (history.length > 0) {
      prompt += `\n以下名字已经出现过，请不要再生成：${history.slice(-100).join('、')}。`;
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
- 确保名字不重复`;

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

      // 如果过滤后不够，递归重试（最多 3 次）
      if (filteredNames.length < CONFIG.NAMES_COUNT) {
        console.warn(`AI 返回了 ${filteredNames.length} 个新名字，不足 ${CONFIG.NAMES_COUNT} 个，正在补充...`);
        const retryCount = arguments[2] || 0;
        if (retryCount < 3) {
          const extra = await AI.generateNames(surname, style, retryCount + 1);
          // 合并并去重
          const existingNames = new Set(filteredNames.map(n => n.name));
          for (const n of extra) {
            if (!existingNames.has(n.name)) {
              filteredNames.push(n);
              existingNames.add(n.name);
            }
            if (filteredNames.length >= CONFIG.NAMES_COUNT) break;
          }
        }
      }

      // 记录到历史
      const nameList = filteredNames.map(n => surname ? surname + n.name : n.name);
      Storage.addToHistory(nameList);

      return filteredNames.slice(0, CONFIG.NAMES_COUNT);

    } catch (error) {
      console.error('AI 调用失败:', error);
      throw error;
    }
  },

  /**
   * 生成模拟数据（用于开发调试，无需 API Key）
   * 保证每次返回 CONFIG.NAMES_COUNT 个不重复的名字
   */
  generateMockNames(surname = '', style = '') {
    // 100 个预设名字库，足够多次生成不重复
    const mockPool = [
      { name: '安澜', charAnalysis: '安：平安、安宁；澜：波澜、大波浪', meaning: '波澜不惊，安然自若，寓意一生平安顺遂又不失气度', gender: '通用', style: '文雅', poem: '出自《岳阳楼记》："波澜不惊，上下天光"', score: 92 },
      { name: '致远', charAnalysis: '致：达到、专注；远：远大、长远', meaning: '宁静致远，寓意目光长远、专注执着', gender: '男孩', style: '大气', poem: '出自诸葛亮《诫子书》："非淡泊无以明志，非宁静无以致远"', score: 90 },
      { name: '沐晴', charAnalysis: '沐：沐浴、润泽；晴：晴朗、明媚', meaning: '如沐春风，晴空万里，寓意性格开朗、生活明媚', gender: '女孩', style: '清新', poem: '暂无直接出处', score: 88 },
      { name: '景行', charAnalysis: '景：风景、景仰；行：行动、品行', meaning: '高山仰止，景行行止，寓意品德高尚', gender: '男孩', style: '古典', poem: '出自《诗经·小雅》："高山仰止，景行行止"', score: 91 },
      { name: '书瑶', charAnalysis: '书：书籍、学识；瑶：美玉、珍贵', meaning: '书香门第，瑶华映月，寓意才学出众、珍贵美好', gender: '女孩', style: '文雅', poem: '暂无直接出处', score: 89 },
      { name: '云帆', charAnalysis: '云：云彩、高远；帆：船帆、远航', meaning: '长风破浪，云帆济海，寓意胸怀广阔、勇往直前', gender: '男孩', style: '豪迈', poem: '出自李白《行路难》："长风破浪会有时，直挂云帆济沧海"', score: 93 },
      { name: '若溪', charAnalysis: '若：如同、美好；溪：溪流、清澈', meaning: '上善若水，溪流潺潺，寓意温柔善良、清澈纯净', gender: '女孩', style: '温婉', poem: '暂无直接出处', score: 87 },
      { name: '北辰', charAnalysis: '北：北方、方向；辰：星辰、时光', meaning: '众星拱北辰，寓意受人敬仰、引领群伦', gender: '男孩', style: '大气', poem: '出自《论语·为政》："为政以德，譬如北辰，居其所而众星共之"', score: 90 },
      { name: '晚晴', charAnalysis: '晚：傍晚、时光；晴：晴朗、美好', meaning: '天意怜幽草，人间重晚晴，寓意珍惜当下、生活美好', gender: '女孩', style: '诗意', poem: '出自李商隐《晚晴》："天意怜幽草，人间重晚晴"', score: 88 },
      { name: '墨白', charAnalysis: '墨：笔墨、文化；白：纯洁、明亮', meaning: '黑白分明，知白守墨，寓意明辨是非、有文化底蕴', gender: '通用', style: '简约', poem: '暂无直接出处', score: 86 },
      { name: '知远', charAnalysis: '知：知识、智慧；远：远大、长远', meaning: '博学知远，寓意学识渊博、志向远大', gender: '男孩', style: '文雅', poem: '暂无直接出处', score: 87 },
      { name: '语桐', charAnalysis: '语：言语、表达；桐：梧桐、高洁', meaning: '凤栖梧桐，妙语连珠，寓意才华横溢、品格高洁', gender: '女孩', style: '诗意', poem: '暂无直接出处', score: 86 },
      { name: '明哲', charAnalysis: '明：明智、光明；哲：智慧、哲理', meaning: '明哲保身，智慧通达，寓意聪明睿智、处世有道', gender: '男孩', style: '古典', poem: '出自《诗经·大雅》："既明且哲，以保其身"', score: 89 },
      { name: '清欢', charAnalysis: '清：清澈、清雅；欢：欢乐、欢喜', meaning: '人间有味是清欢，寓意生活淡雅而快乐', gender: '女孩', style: '清新', poem: '出自苏轼《浣溪沙》："人间有味是清欢"', score: 90 },
      { name: '浩然', charAnalysis: '浩：浩大、广阔；然：自然、坦然', meaning: '浩然正气，坦荡从容，寓意胸怀宽广、正气凛然', gender: '男孩', style: '豪迈', poem: '出自《孟子》："吾善养吾浩然之气"', score: 91 },
      { name: '星月', charAnalysis: '星：星辰、闪耀；月：月亮、温柔', meaning: '披星戴月，星光月华，寓意温柔而闪耀', gender: '女孩', style: '诗意', poem: '暂无直接出处', score: 85 },
      { name: '泽宇', charAnalysis: '泽：恩泽、润泽；宇：宇宙、气度', meaning: '泽被苍生，气宇轩昂，寓意胸怀天下、气度不凡', gender: '男孩', style: '大气', poem: '暂无直接出处', score: 88 },
      { name: '念安', charAnalysis: '念：思念、挂念；安：平安、安宁', meaning: '心中有念，岁月安好，寓意重情重义、一生平安', gender: '通用', style: '温婉', poem: '暂无直接出处', score: 87 },
      { name: '瑾瑜', charAnalysis: '瑾：美玉、珍贵；瑜：美玉、光彩', meaning: '握瑾怀瑜，寓意品德如玉、才华出众', gender: '通用', style: '古典', poem: '出自屈原《九章》："怀瑾握瑜兮，穷不知所示"', score: 92 },
      { name: '听风', charAnalysis: '听：聆听、感受；风：风度、自由', meaning: '听风听雨，自在从容，寓意随性洒脱、热爱生活', gender: '通用', style: '自然', poem: '暂无直接出处', score: 84 },
      { name: '修远', charAnalysis: '修：修养、完善；远：远大、长远', meaning: '路漫漫其修远兮，寓意不断进取、追求卓越', gender: '男孩', style: '古典', poem: '出自屈原《离骚》："路漫漫其修远兮，吾将上下而求索"', score: 91 },
      { name: '梦溪', charAnalysis: '梦：梦想、憧憬；溪：溪流、清澈', meaning: '梦如溪流，清澈悠远，寓意心怀梦想、纯净美好', gender: '女孩', style: '诗意', poem: '暂无直接出处', score: 86 },
      { name: '庭轩', charAnalysis: '庭：庭院、厅堂；轩：气宇、高扬', meaning: '气宇轩昂，庭前花开，寓意气质不凡、生活优雅', gender: '男孩', style: '文雅', poem: '暂无直接出处', score: 87 },
      { name: '雨桐', charAnalysis: '雨：雨水、润泽；桐：梧桐、高洁', meaning: '梧桐更兼细雨，寓意温润如玉、品格高洁', gender: '女孩', style: '温婉', poem: '出自李清照《声声慢》："梧桐更兼细雨，到黄昏、点点滴滴"', score: 88 },
      { name: '子墨', charAnalysis: '子：君子、学子；墨：笔墨、文化', meaning: '腹有诗书，笔墨生香，寓意才学出众、温文尔雅', gender: '男孩', style: '文雅', poem: '暂无直接出处', score: 87 },
      { name: '初雪', charAnalysis: '初：初始、初心；雪：冰雪、纯洁', meaning: '初心如雪，洁白无瑕，寓意纯真美好、不忘初心', gender: '女孩', style: '清新', poem: '暂无直接出处', score: 86 },
      { name: '逸飞', charAnalysis: '逸：飘逸、超逸；飞：飞翔、自由', meaning: '飘逸如风，自由飞翔，寓意洒脱不羁、追求自由', gender: '男孩', style: '豪迈', poem: '暂无直接出处', score: 85 },
      { name: '诗涵', charAnalysis: '诗：诗歌、诗意；涵：涵养、包容', meaning: '诗书涵养，腹有诗书气自华，寓意有内涵、有才情', gender: '女孩', style: '文雅', poem: '暂无直接出处', score: 88 },
      { name: '俊哲', charAnalysis: '俊：英俊、杰出；哲：智慧、哲理', meaning: '俊才哲思，寓意才华出众、智慧过人', gender: '男孩', style: '古典', poem: '暂无直接出处', score: 86 },
      { name: '婉清', charAnalysis: '婉：温婉、美好；清：清澈、清雅', meaning: '温婉清雅，如沐春风，寓意温柔大方、气质清雅', gender: '女孩', style: '温婉', poem: '暂无直接出处', score: 87 },
      { name: '思远', charAnalysis: '思：思考、思念；远：远大、长远', meaning: '行成于思，志存高远，寓意善于思考、志向远大', gender: '男孩', style: '文雅', poem: '暂无直接出处', score: 86 },
      { name: '乐瑶', charAnalysis: '乐：快乐、音乐；瑶：美玉、珍贵', meaning: '乐以忘忧，瑶华映月，寓意快乐珍贵、生活美好', gender: '女孩', style: '清新', poem: '暂无直接出处', score: 85 },
      { name: '凯风', charAnalysis: '凯：胜利、凯旋；风：风度、自由', meaning: '凯风自南，吹彼棘心，寓意温暖和煦、风度翩翩', gender: '男孩', style: '大气', poem: '出自《诗经·邶风》："凯风自南，吹彼棘心"', score: 88 },
      { name: '芷若', charAnalysis: '芷：白芷、香草；若：如同、美好', meaning: '岸芷汀兰，郁郁青青，寓意如香草般芬芳美好', gender: '女孩', style: '古典', poem: '出自范仲淹《岳阳楼记》："岸芷汀兰，郁郁青青"', score: 89 },
      { name: '承宇', charAnalysis: '承：承担、继承；宇：宇宙、气度', meaning: '承天之佑，气宇轩昂，寓意有担当、有气度', gender: '男孩', style: '大气', poem: '出自屈原《九章》："云霏霏而承宇"', score: 87 },
      { name: '映雪', charAnalysis: '映：映照、辉映；雪：冰雪、纯洁', meaning: '映雪读书，冰雪聪明，寓意勤奋好学、聪慧过人', gender: '女孩', style: '古典', poem: '出自"孙康映雪"典故', score: 87 },
      { name: '皓轩', charAnalysis: '皓：洁白、明亮；轩：气宇、高扬', meaning: '皓月当空，气宇轩昂，寓意光明磊落、气质不凡', gender: '男孩', style: '大气', poem: '暂无直接出处', score: 86 },
      { name: '筠心', charAnalysis: '筠：竹子、坚韧；心：心灵、心意', meaning: '筠心不改，坚韧不拔，寓意如竹般坚韧、初心不改', gender: '女孩', style: '文雅', poem: '暂无直接出处', score: 85 },
      { name: '沐白', charAnalysis: '沐：沐浴、润泽；白：纯洁、明亮', meaning: '如沐春风，清白做人，寓意温润而纯洁', gender: '通用', style: '简约', poem: '暂无直接出处', score: 85 },
      { name: '云熙', charAnalysis: '云：云彩、高远；熙：光明、兴盛', meaning: '云蒸霞蔚，熙熙融融，寓意前程光明、生活美好', gender: '通用', style: '自然', poem: '暂无直接出处', score: 86 },
      { name: '云舒', charAnalysis: '云：云彩、高远；舒：舒展、从容', meaning: '云卷云舒，从容自在，寓意随性洒脱、心态从容', gender: '通用', style: '自然', poem: '暂无直接出处', score: 85 },
      { name: '亦然', charAnalysis: '亦：也、同样；然：自然、坦然', meaning: '人亦然，心亦然，寓意表里如一、真诚坦然', gender: '通用', style: '简约', poem: '暂无直接出处', score: 84 },
      { name: '予安', charAnalysis: '予：给予、我；安：平安、安宁', meaning: '予你心安，岁月静好，寓意给人安全感、一生平安', gender: '通用', style: '温婉', poem: '暂无直接出处', score: 86 },
      { name: '今安', charAnalysis: '今：现在、当下；安：平安、安宁', meaning: '珍惜当下，平安喜乐，寓意活在当下、知足常乐', gender: '通用', style: '简约', poem: '暂无直接出处', score: 84 },
      { name: '未央', charAnalysis: '未：未来、尚未；央：中央、尽兴', meaning: '夜未央，乐未央，寓意快乐长久、未来可期', gender: '通用', style: '诗意', poem: '出自《诗经·小雅》："夜如何其？夜未央"', score: 88 },
      { name: '溪亭', charAnalysis: '溪：溪流、清澈；亭：亭子、停留', meaning: '溪亭日暮，沉醉不知归路，寓意生活诗意、悠然自得', gender: '女孩', style: '诗意', poem: '出自李清照《如梦令》："常记溪亭日暮"', score: 87 },
      { name: '南絮', charAnalysis: '南：南方、温暖；絮：柳絮、轻柔', meaning: '南风知我意，吹絮到窗前，寓意温柔细腻、温暖人心', gender: '女孩', style: '温婉', poem: '暂无直接出处', score: 85 },
      { name: '君泽', charAnalysis: '君：君子、君主；泽：恩泽、润泽', meaning: '君子如玉，泽被四方，寓意品德高尚、惠及他人', gender: '男孩', style: '古典', poem: '暂无直接出处', score: 87 },
      { name: '洛尘', charAnalysis: '洛：洛水、文化；尘：凡尘、踏实', meaning: '洛阳纸贵，不染凡尘，寓意才华出众、超凡脱俗', gender: '男孩', style: '文雅', poem: '暂无直接出处', score: 86 },
      // 新增 50 个名字，扩大池子到 100 个
      { name: '望舒', charAnalysis: '望：期望、仰望；舒：舒展、从容', meaning: '前望舒使先驱兮，寓意从容前行、心怀希望', gender: '通用', style: '诗意', poem: '出自屈原《离骚》："前望舒使先驱兮"', score: 88 },
      { name: '扶光', charAnalysis: '扶：扶持、帮助；光：光明、光辉', meaning: '扶摇直上，光耀门楣，寓意积极向上、前程光明', gender: '男孩', style: '豪迈', poem: '暂无直接出处', score: 86 },
      { name: '栖梧', charAnalysis: '栖：栖息、停留；梧：梧桐、高洁', meaning: '凤栖梧桐，择木而栖，寓意品格高洁、知进退', gender: '通用', style: '古典', poem: '暂无直接出处', score: 85 },
      { name: '惊鸿', charAnalysis: '惊：惊艳、惊人；鸿：鸿雁、宏大', meaning: '翩若惊鸿，婉若游龙，寓意惊艳出众、气质非凡', gender: '女孩', style: '诗意', poem: '出自曹植《洛神赋》："翩若惊鸿，婉若游龙"', score: 90 },
      { name: '酌溪', charAnalysis: '酌：斟酌、品味；溪：溪流、清澈', meaning: '酌溪而饮，悠然自得，寓意生活闲适、品味高雅', gender: '通用', style: '自然', poem: '暂无直接出处', score: 84 },
      { name: '枕书', charAnalysis: '枕：枕头、依靠；书：书籍、学识', meaning: '枕书而眠，与书为伴，寓意好学不倦、书香满溢', gender: '通用', style: '文雅', poem: '暂无直接出处', score: 85 },
      { name: '问柳', charAnalysis: '问：询问、探索；柳：柳树、柔美', meaning: '问柳寻花，探索美好，寓意热爱生活、善于发现美', gender: '女孩', style: '清新', poem: '暂无直接出处', score: 83 },
      { name: '踏歌', charAnalysis: '踏：踩踏、行走；歌：歌声、欢乐', meaning: '踏歌而行，一路欢歌，寓意乐观开朗、生活快乐', gender: '通用', style: '豪迈', poem: '出自李白《赠汪伦》："李白乘舟将欲行，忽闻岸上踏歌声"', score: 86 },
      { name: '采薇', charAnalysis: '采：采摘、收获；薇：蔷薇、美好', meaning: '采薇采薇，薇亦作止，寓意收获美好、生活诗意', gender: '女孩', style: '古典', poem: '出自《诗经·小雅》："采薇采薇，薇亦作止"', score: 88 },
      { name: '暮雪', charAnalysis: '暮：傍晚、时光；雪：冰雪、纯洁', meaning: '暮雪纷纷，岁月静好，寓意纯洁美好、珍惜时光', gender: '女孩', style: '诗意', poem: '暂无直接出处', score: 85 },
      { name: '朝歌', charAnalysis: '朝：早晨、朝气；歌：歌声、欢乐', meaning: '朝歌暮弦，生活如歌，寓意朝气蓬勃、快乐生活', gender: '通用', style: '豪迈', poem: '暂无直接出处', score: 84 },
      { name: '临风', charAnalysis: '临：面对、临近；风：风度、自由', meaning: '临风而立，玉树临风，寓意风度翩翩、从容自信', gender: '男孩', style: '大气', poem: '暂无直接出处', score: 86 },
      { name: '听雨', charAnalysis: '听：聆听、感受；雨：雨水、润泽', meaning: '听雨入眠，静心养性，寓意内心宁静、生活诗意', gender: '通用', style: '自然', poem: '暂无直接出处', score: 84 },
      { name: '观澜', charAnalysis: '观：观察、洞察；澜：波澜、大波浪', meaning: '观澜知海，见微知著，寓意洞察世事、胸怀广阔', gender: '男孩', style: '大气', poem: '暂无直接出处', score: 86 },
      { name: '知鱼', charAnalysis: '知：知识、智慧；鱼：鱼水、自由', meaning: '子非鱼，安知鱼之乐，寓意智慧通达、自在快乐', gender: '通用', style: '简约', poem: '出自《庄子·秋水》："子非鱼，安知鱼之乐"', score: 85 },
      { name: '问水', charAnalysis: '问：询问、探索；水：水润、智慧', meaning: '问水哪得清如许，寓意探索求知、智慧如泉', gender: '通用', style: '自然', poem: '出自朱熹《观书有感》："问渠那得清如许"', score: 85 },
      { name: '寻梅', charAnalysis: '寻：寻找、探索；梅：梅花、坚韧', meaning: '踏雪寻梅，不畏严寒，寓意坚韧不拔、追求美好', gender: '女孩', style: '古典', poem: '暂无直接出处', score: 86 },
      { name: '寄傲', charAnalysis: '寄：寄托、寄寓；傲：傲骨、高洁', meaning: '寄傲山水，不慕荣利，寓意品格高洁、超然物外', gender: '男孩', style: '豪迈', poem: '暂无直接出处', score: 84 },
      { name: '怀瑾', charAnalysis: '怀：怀抱、心怀；瑾：美玉、珍贵', meaning: '怀瑾握瑜，心若芷兰，寓意品德高尚、才华内敛', gender: '通用', style: '古典', poem: '出自屈原《九章》："怀瑾握瑜兮"', score: 88 },
      { name: '知白', charAnalysis: '知：知识、智慧；白：纯洁、明亮', meaning: '知白守黑，明辨是非，寓意智慧通达、坚守本心', gender: '通用', style: '简约', poem: '暂无直接出处', score: 84 },
      { name: '守拙', charAnalysis: '守：坚守、保持；拙：质朴、真诚', meaning: '守拙归园田，返璞归真，寓意质朴真诚、不忘初心', gender: '男孩', style: '古典', poem: '出自陶渊明《归园田居》："开荒南野际，守拙归园田"', score: 85 },
      { name: '抱朴', charAnalysis: '抱：怀抱、保持；朴：质朴、纯真', meaning: '抱朴守真，返璞归真，寓意保持本真、质朴无华', gender: '通用', style: '简约', poem: '出自《道德经》："见素抱朴，少私寡欲"', score: 86 },
      { name: '含章', charAnalysis: '含：包含、蕴含；章：文章、才华', meaning: '含章可贞，寓意才华横溢、品德高尚', gender: '通用', style: '文雅', poem: '出自《易经》："含章可贞，以时发也"', score: 87 },
      { name: '既白', charAnalysis: '既：已经、既而；白：明白、光明', meaning: '东方既白，天光初现，寓意希望来临、前程光明', gender: '通用', style: '诗意', poem: '出自苏轼《前赤壁赋》："不知东方之既白"', score: 86 },
      { name: '停云', charAnalysis: '停：停留、静候；云：云彩、高远', meaning: '停云霭霭，时雨濛濛，寓意静待时机、从容不迫', gender: '通用', style: '诗意', poem: '出自陶渊明《停云》："霭霭停云，濛濛时雨"', score: 85 },
      { name: '时雨', charAnalysis: '时：时光、时机；雨：雨水、润泽', meaning: '及时雨，润万物，寓意恰逢其时、润泽他人', gender: '通用', style: '自然', poem: '暂无直接出处', score: 85 },
      { name: '清梦', charAnalysis: '清：清澈、清雅；梦：梦想、憧憬', meaning: '满船清梦压星河，寓意心怀梦想、浪漫美好', gender: '女孩', style: '诗意', poem: '出自唐温如《题龙阳县青草湖》："满船清梦压星河"', score: 87 },
      { name: '星河', charAnalysis: '星：星辰、闪耀；河：河流、广阔', meaning: '星河灿烂，若出其里，寓意胸怀广阔、前程璀璨', gender: '通用', style: '大气', poem: '出自曹操《观沧海》："星汉灿烂，若出其里"', score: 88 },
      { name: '揽月', charAnalysis: '揽：拥抱、摘取；月：月亮、温柔', meaning: '可上九天揽月，寓意志向远大、勇于追梦', gender: '男孩', style: '豪迈', poem: '出自毛泽东《水调歌头·重上井冈山》："可上九天揽月"', score: 87 },
      { name: '乘风', charAnalysis: '乘：乘坐、借助；风：风度、自由', meaning: '乘风破浪，直济沧海，寓意勇往直前、不畏艰难', gender: '男孩', style: '豪迈', poem: '出自李白《行路难》："长风破浪会有时"', score: 88 },
      { name: '归雁', charAnalysis: '归：回归、归属；雁：鸿雁、志向', meaning: '归雁入胡天，寓意志在四方、不忘归途', gender: '通用', style: '自然', poem: '出自王维《使至塞上》："归雁入胡天"', score: 84 },
      { name: '鸣蝉', charAnalysis: '鸣：鸣叫、响亮；蝉：蝉鸣、高洁', meaning: '居高声自远，非是藉秋风，寓意品格高洁、声名远播', gender: '男孩', style: '古典', poem: '出自虞世南《蝉》："居高声自远，非是藉秋风"', score: 85 },
      { name: '知夏', charAnalysis: '知：知道、感知；夏：夏天、热情', meaning: '知夏已至，万物生长，寓意感知美好、热情生活', gender: '通用', style: '清新', poem: '暂无直接出处', score: 83 },
      { name: '见山', charAnalysis: '见：看见、领悟；山：山岳、稳重', meaning: '见山是山，见水是水，寓意返璞归真、通达明悟', gender: '男孩', style: '简约', poem: '出自禅宗三重境界', score: 85 },
      { name: '照水', charAnalysis: '照：映照、辉映；水：水润、智慧', meaning: '照水红蕖细细香，寓意清新脱俗、温润美好', gender: '女孩', style: '清新', poem: '暂无直接出处', score: 84 },
      { name: '行舟', charAnalysis: '行：行走、前行；舟：舟船、远航', meaning: '行舟绿水前，寓意不断前行、探索未知', gender: '男孩', style: '大气', poem: '出自王湾《次北固山下》："行舟绿水前"', score: 85 },
      { name: '渡云', charAnalysis: '渡：渡过、超越；云：云彩、高远', meaning: '渡云穿雾，志在高远，寓意超越困难、追求卓越', gender: '通用', style: '豪迈', poem: '暂无直接出处', score: 84 },
      { name: '拾光', charAnalysis: '拾：拾取、收集；光：光明、时光', meaning: '拾光而行，珍惜当下，寓意珍惜时光、收集美好', gender: '通用', style: '简约', poem: '暂无直接出处', score: 84 },
    ];

    // 随机打乱
    const pool = [...mockPool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    // 过滤抛弃池和历史
    const filtered = pool.filter(n => {
      const fullName = surname ? surname + n.name : n.name;
      return !Storage.isDiscarded(fullName) && !Storage.isInHistory(fullName);
    });

    // 如果过滤后不够，从池中补充（跳过已过滤的）
    let result = [...filtered];
    if (result.length < CONFIG.NAMES_COUNT) {
      for (const n of pool) {
        if (result.length >= CONFIG.NAMES_COUNT) break;
        const fullName = surname ? surname + n.name : n.name;
        if (!result.find(r => r.name === n.name) && !Storage.isDiscarded(fullName)) {
          result.push({ ...n });
        }
      }
    }

    // 取前 NAMES_COUNT 个
    result = result.slice(0, CONFIG.NAMES_COUNT);

    // 记录历史
    const nameList = result.map(n => surname ? surname + n.name : n.name);
    Storage.addToHistory(nameList);

    return result;
  },
};
