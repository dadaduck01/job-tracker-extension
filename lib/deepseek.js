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
 * @returns {Promise<{overview: string, suitable: string, skills: string, cleanJD: string}>}
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
      max_tokens: 2000
    })
  });

  if (!extractResp.ok) {
    const err = await extractResp.text();
    throw new Error(`DeepSeek API 错误 (${extractResp.status}): ${err}`);
  }

  const extractData = await extractResp.json();
  const cleanJD = (extractData.choices?.[0]?.message?.content || '').trim();

  if (!cleanJD) {
    return { overview: '', suitable: '', skills: '', cleanJD: '' };
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
    return { ...JSON.parse(content), cleanJD };
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('LLM 返回格式异常，无法解析JSON');
    return { ...JSON.parse(jsonMatch[0]), cleanJD };
  }
}

/**
 * Build a human-readable text summary from structured user profile data.
 * @param {object} profile - { education: [], experience: [], skills: string, description: string }
 * @returns {string}
 */
function buildProfileText(profile) {
  const parts = [];

  const eduItems = profile.education?.filter(e => e.school || e.major || e.period) || [];
  if (eduItems.length) {
    parts.push('## 教育经历');
    eduItems.forEach((edu, i) => {
      const fields = [edu.school, edu.major, edu.period].filter(Boolean);
      parts.push(`${i + 1}. ${fields.join(' | ')}`);
    });
  }

  const expItems = profile.experience?.filter(e => e.company || e.position || e.period || e.description) || [];
  if (expItems.length) {
    parts.push('## 实习/工作经历');
    expItems.forEach((exp, i) => {
      const header = [exp.company, exp.position, exp.period].filter(Boolean).join(' | ');
      parts.push(`${i + 1}. ${header}`);
      if (exp.description) parts.push(`   ${exp.description}`);
    });
  }

  if (profile.skills?.trim()) {
    parts.push(`## 技能\n${profile.skills.trim()}`);
  }

  if (profile.description?.trim()) {
    parts.push(`## 补充信息\n${profile.description.trim()}`);
  }

  return parts.join('\n\n');
}

/**
 * Check if the user profile has any meaningful content filled in.
 * @param {object} profile
 * @returns {boolean}
 */
export function hasProfileContent(profile) {
  if (!profile) return false;
  const edu = profile.education?.some(e => e.school || e.major || e.period);
  const exp = profile.experience?.some(e => e.company || e.position || e.period || e.description);
  const skills = !!profile.skills?.trim();
  const desc = !!profile.description?.trim();
  return edu || exp || skills || desc;
}

/**
 * Generate personalized application advice by comparing JD analysis with user profile.
 * This is a separate API call, independent of analyzeJD().
 *
 * @param {object} jdAnalysis - Result from analyzeJD(): {overview, suitable, skills}
 * @param {object} userProfile - User's structured profile from settings
 * @param {string} apiKey - DeepSeek API key
 * @param {function} [onProgress] - Optional callback(stepMsg: string) for UI updates
 * @returns {Promise<object>} - Structured advice with fields: job_value_recommendation, value_score, dirty_work_risk, overall_judgement, etc.
 */
export async function generateAdvice(jdAnalysis, userProfile, apiKey, onProgress) {
  if (onProgress) onProgress('正在生成投递建议…');

  const profileText = buildProfileText(userProfile);
  const cleanJD = jdAnalysis.cleanJD || '';

  const systemPrompt = `你是一名专业的岗位质量分析助手，擅长从招聘 JD 中判断一个岗位是否真的有成长价值，还是只是包装得很高大上但实际偏低价值执行、杂活或重复性支持工作。

你会收到两部分输入：
1. 岗位 JD
2. 用户个人信息

用户可能并没有非常明确的求职方向，正在广泛投递不同类型岗位。因此，你的任务不是判断用户是否完全匹配某个方向，也不是围绕固定职业目标做分析，而是判断这份岗位本身是否值得用户投入时间投递。

请重点分析：
- 这份岗位是否能沉淀可迁移能力，例如数据分析、业务理解、沟通协作、项目推进、产品思维、内容判断、运营方法、研究分析、工具使用等；
- 这份经历未来是否容易写进简历，能不能形成具体项目、成果、指标或面试故事；
- JD 中是否存在"听起来高级，但实际可能是 dirty work"的信号；
- 岗位是否有明确业务目标、分析过程、判断空间、协作对象、产出闭环或成长路径；
- 岗位是否可能主要是配置、整理、监控、审核、客服、对接、填表、日报周报、机械执行；
- 对一个还在探索职业方向的求职者来说，这份岗位是值得认真投、顺手投、保底投，还是不值得浪费时间。

判断原则：
1. 不要重点判断用户"能不能胜任"，而要判断岗位"值不值得投"。
2. 只依据 JD 和用户信息分析，不要编造岗位实际情况。
3. 用户没有明确求职方向时，请从通用职业价值判断：平台价值、业务含金量、能力沉淀、简历可写性、未来跳转空间。
4. 可以基于 JD 用词进行合理推断，但必须区分"明确价值"和"风险信号"。
5. 不要因为岗位名称中出现"战略、产品、数据、AI、增长、商业分析、管培、项目管理"等高级词汇，就默认岗位有成长价值。岗位名称可能被包装，真正重要的是工作内容。
6. 重点识别包装性表达。例如"参与优化"可能只是整理材料；"支持业务"可能只是跑流程；"协助分析"可能只是拉数做表；"运营支持"可能是客服、社群、审核或后台配置。
7. 如果 JD 中有明确的指标拆解、数据分析、实验设计、用户研究、方案设计、业务复盘、跨团队推动、独立负责模块、结果追踪等内容，通常说明岗位更有沉淀价值。
8. 如果 JD 中大量出现"协助、支持、跟进、整理、监控、配置、审核、收集、维护、日常运营、完成领导安排"等词，但缺少独立分析、判断空间或结果闭环，要提高 dirty work 风险判断。
9. 如果岗位有一定 dirty work，但平台较好、业务核心、能接触关键流程或有机会沉淀成果，也要客观说明，不要一刀切否定。
10. 输出必须是合法 JSON，不要输出 Markdown、标题、注释或多余文字。
11. 语言要直接、务实，像有经验的求职顾问在帮用户避坑。

请按照以下 JSON 格式输出：

{
  "job_value_recommendation": "岗位价值建议，用简短中文判断，例如：优先投递、可以投递、低优先级投递、不建议投递",
  "value_score": "岗位价值评分，0-100 的整数。评分关注岗位本身的成长价值、简历价值和能力沉淀，而不是用户能不能胜任。",
  "dirty_work_risk": "dirty work 风险等级，用简短中文判断，例如：低、中、高、很高",
  "overall_judgement": "100-180字，直接判断这份岗位是否值得投递。重点说明它是真正有成长价值，还是更像执行型、支持型、杂活型岗位。",
  "valuable_signals": "100-200字，提取 JD 中体现岗位价值的信号，例如是否涉及分析、判断、方案设计、业务复盘、跨团队协作、独立负责模块、可量化结果等。必须结合 JD 具体内容，不要空泛。",
  "risk_signals": "100-220字，指出 JD 中可能暗示低成长、dirty work 或包装过度的信号。例如大量协助支持、后台配置、数据整理、内容审核、客服对接、日报周报、机械运营等。如果风险不明显，也要说明为什么风险较低。",
  "resume_value": "100-200字，判断这份经历未来是否容易写进简历。重点说明它能否沉淀成项目经历、能否量化成果、能否在面试中讲出完整故事。",
  "learning_value": "100-180字，判断这份岗位能让用户学到什么。要区分真正有价值的学习，例如业务分析、工具方法、项目推进，与低价值熟练工式学习，例如重复配置、机械整理、跑流程。",
  "apply_priority_reason": "100-180字，说明这份岗位在海投场景下的优先级。要给出实际投递建议，例如认真投、顺手投、作为保底、除非公司平台很好否则不建议。",
  "questions_to_verify": [
    "面试时应该追问的问题1，用来判断岗位是否真有价值",
    "面试时应该追问的问题2，用来判断是否存在 dirty work",
    "面试时应该追问的问题3，用来判断能否沉淀简历成果"
  ],
  "final_advice": "一句话结论，直接告诉用户这份 JD 值不值得认真投。"
}`;

  const userPrompt = `
请根据以下岗位 JD 和用户个人信息，判断这份岗位本身是否值得用户投递。

注意：
- 用户可能没有明确求职方向，正在广泛投递岗位；
- 重点不是判断用户能不能胜任；
- 重点是判断岗位有没有成长价值、简历价值和能力沉淀；
- 请识别 JD 是否存在"听起来高级，实际可能是杂活、执行、支持、配置、填表、审核、客服、跑流程"的风险；
- 如果岗位看起来主要是 dirty work，要直接指出，不要委婉包装；
- 如果岗位虽然有 dirty work，但平台、业务、能力沉淀仍然值得投，也要说明原因；
- 请给出务实的投递优先级建议。

【岗位 JD】
${cleanJD}

【用户个人信息】
${profileText}
`;

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
        { role: 'user', content: userPrompt }
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
