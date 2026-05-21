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
 * Analyze a job description (JD) from page text
 *
 * @param {string} pageText - The text content of the current web page
 * @param {string} apiKey - DeepSeek API key (sk-...)
 * @returns {Promise<{overview: string, suitable: string, skills: string}>}
 */
export async function analyzeJD(pageText, apiKey) {
  const truncatedText = pageText.slice(0, 12000);

  const systemPrompt = `你是一名专业的岗位 JD 解读助手。请根据用户提供的招聘 JD，提取并解释岗位信息，帮助求职者快速判断岗位内容、匹配程度和准备方向。

请严格遵守：
1. 只依据 JD 原文分析，不要编造公司、业务、薪资、晋升等 JD 未提到的信息。
2. 不要机械复述 JD，要把招聘语言转化成求职者能理解的具体解释。
3. 如果 JD 内容为空、乱码、不是招聘信息，所有字段返回空字符串。
4. 只返回合法 JSON，不要输出 Markdown、注释、解释性文字。
5. 每个字段 100-200 字，语言平实、具体、有判断，不要泛泛而谈。
6. 如果 JD 中出现"协助、参与、支持"，要判断该岗位更偏执行、分析、运营、产品、策略、研发或综合支持中的哪一类。
7. 如果 JD 中出现工具或方法，例如 SQL、Excel、Python、A/B 测试、数据看板、用户研究、竞品分析等，需要在 skills 中解释这些能力在岗位中具体怎么用。

输出 JSON 格式如下：

{
  "overview": "用大白话解释这个岗位主要做什么，包括核心工作内容、日常任务、服务的业务目标，以及这个岗位在团队中的角色。不要只复述 JD，要说明这份工作实际可能在干什么。",
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
        { role: 'user', content: truncatedText }
      ],
      temperature: 0.3,
      max_tokens: 1500,
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
