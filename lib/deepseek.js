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
