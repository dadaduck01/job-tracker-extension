// DeepSeek API client for structured job info extraction
// Uses OpenAI-compatible chat completions endpoint

const DEEPSEEK_API_BASE = 'https://api.deepseek.com';

/**
 * Extract job application info from page text using DeepSeek LLM
 *
 * @param {string} pageText - The text content of the current web page
 * @param {string} apiKey - DeepSeek API key (sk-...)
 * @returns {Promise<{company: string, position: string, status: string, location: string, apply_date: string}>}
 */
export async function extractJobInfo(pageText, apiKey) {
  // Truncate page text to avoid token limits
  const truncatedText = pageText.slice(0, 8000);

  const systemPrompt = `你是一个求职投递信息提取助手。从以下网页文本中提取招聘/投递相关的结构化信息。
返回一个纯JSON对象，格式如下：

{
  "company": "公司/企业名称",
  "position": "岗位/职位名称",
  "status": "投递状态",
  "location": "工作地点/城市",
  "apply_date": "投递日期"
}

规则：
1. status 尽量匹配以下选项之一：简历初筛、部门评估、笔试中、面试中、挂、offer。如果无法确定，根据上下文推断最接近的状态描述。
2. apply_date 格式为 YYYY-MM-DD。如果页面明确显示投递日期则提取，否则用今天的日期。
3. 如果某个字段确实无法从页面中提取，值设为空字符串 ""。
4. 只返回JSON对象，不要markdown代码块，不要任何其他文字。`;

  const resp = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: truncatedText }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DeepSeek API 错误 (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('DeepSeek 返回内容为空');
  }

  try {
    // Try direct parse first (json_object mode should return valid JSON)
    return JSON.parse(content);
  } catch {
    // Fallback: try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM 返回格式异常，无法解析JSON');
    return JSON.parse(jsonMatch[0]);
  }
}

/**
 * Analyze a job description (JD) from page text.
 * Two-step process: first extracts clean JD from raw page, then analyzes it.
 *
 * @param {string} pageText - The text content of the current web page
 * @param {string} apiKey - DeepSeek API key (sk-...)
 * @param {function} [onProgress] - Optional callback(stepMsg: string) for UI updates
 * @returns {Promise<{overview: string, suitable: string, skills: string}>}
 */
export async function analyzeJD(pageText, apiKey, onProgress) {
  const truncatedText = pageText.slice(0, 12000);

  // Step 1: Extract clean JD text from raw page content
  if (onProgress) onProgress('正在从页面提取职位信息…');

  const extractPrompt = `你是一个网页文本清洗助手。从以下网页内容中，只提取出招聘岗位描述(JD)相关的文本，排除掉导航栏、广告、推荐职位、页脚、侧边栏等无关内容。

要求：
1. 只返回提取后的纯文本岗位描述，不要添加任何解释或格式标记
2. 如果网页中不包含招聘信息，返回空字符串
3. 保持原文的完整表述，不要总结或改写`;

  const extractResp = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: extractPrompt },
        { role: 'user', content: truncatedText }
      ],
      temperature: 0.1,
      max_tokens: 1000
    })
  });

  if (!extractResp.ok) {
    const err = await extractResp.text();
    throw new Error(`DeepSeek API 错误 (${extractResp.status}): ${err}`);
  }

  const extractData = await extractResp.json();
  const cleanJD = (extractData.choices?.[0]?.message?.content || '').trim();

  if (!cleanJD) {
    return { overview: '', suitable: '', skills: '' };
  }

  // Step 2: Analyze the clean JD
  if (onProgress) onProgress('AI 正在解读职位描述…');

  const systemPrompt = `你是一名专业的岗位 JD 解读助手。你的任务不是复述 JD，而是把 JD 翻译成求职者能理解的真实工作图景。

请严格遵守：
1. 只依据 JD 原文分析，不要编造公司、业务、薪资、晋升等 JD 未提到的信息。
2. 不要照抄或近义改写 JD 原句，尤其不要把"负责/协助/参与/推动/支持"等职责条目重新排列一遍。
3. 输出时要先判断岗位的"工作本质"：这个岗位到底是在解决什么业务问题，而不是简单列举它要做哪些事。
4. 如果 JD 内容为空、乱码、不是招聘信息，所有字段返回空字符串。
5. 只返回合法 JSON，不要输出 Markdown、注释、解释性文字。
6. 除了overview以外每个字段 100-200 字，overview字段可以适当更长，语言平实、具体、有判断，不要泛泛而谈。
7. 如果 JD 中出现"协助、参与、支持"，要判断该岗位更偏执行、分析、运营、产品、策略、研发或综合支持中的哪一类。
8. 如果 JD 中出现 SQL、Excel、Python、A/B 测试、数据看板、用户研究、竞品分析等工具或方法，需要在 skills 中解释这些能力在岗位中具体怎么用。
9. overview 字段不能写成 JD 职责摘要，而要回答："入职后每天大概率在围绕什么问题工作？需要和谁协作？最终产出什么？这个岗位对业务有什么用？"

输出 JSON 格式如下：

{
  "overview": "不要复述 JD。请用大白话解释这个岗位的工作本质：它主要帮团队解决什么问题，日常大概率围绕哪些业务场景展开，最终要产出什么结果。请把招聘语言翻译成真实工作画面，避免使用'负责……、协助……、参与……'开头的句式。",
  "suitable": "分析什么样的人适合这个岗位，包括专业背景、实习/项目经历、能力基础、职业阶段和性格特质。要具体说明适合的原因，例如适合做过数据分析、内容运营、产品策略、用户研究或跨部门沟通的人。",
  "skills": "拆解岗位所需能力，包括硬技能和软技能。硬技能要说明工具和方法如何服务岗位工作；软技能要说明为什么需要这些能力。请突出最关键的 3-5 类能力，不要堆砌关键词。"
}`;

  const resp = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: cleanJD }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DeepSeek API 错误 (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('DeepSeek 返回内容为空');
  }

  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM 返回格式异常，无法解析JSON');
    return JSON.parse(jsonMatch[0]);
  }
}
