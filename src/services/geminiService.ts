/**
 * LegalMind AI - Gemini AI 分析服務
 * 專門處理法律判決分析和訴狀生成
 */

export interface JudgmentAnalysis {
  summary: string;
  caseInfo: {
    caseNumber: string;
    court: string;
    parties: {
      plaintiff: string;
      defendant: string;
    };
  };
  favorablePoints: string[];
  unfavorablePoints: string[];
  legalGrounds: string[];
  appealableIssues: string[];
  recommendedStrategy: string;
}

export interface DocumentGenerationRequest {
  documentType: '民事上訴狀' | '刑事上訴狀' | '答辯狀' | '起訴狀';
  analysis: JudgmentAnalysis;
  customInstructions?: string;
}

export class GeminiService {
  private static readonly API_ENDPOINT = "https://api.anthropic.com/v1/messages";
  private static readonly MODEL = "claude-sonnet-4-20250514";
  
  /**
   * 分析判決書內容
   */
  static async analyzeJudgment(judgmentText: string): Promise<JudgmentAnalysis> {
    const prompt = `
作為專業的台灣法律AI助手，請仔細分析以下法院判決書內容。

判決書內容：
${judgmentText}

請以JSON格式提供完整的結構化分析，確保所有字段都有意義的內容：

{
  "summary": "案件核心摘要（100-150字，包含案件性質、主要爭點、判決結果）",
  "caseInfo": {
    "caseNumber": "案件編號（從判決書擷取完整案號）",
    "court": "審理法院（完整法院名稱）",
    "parties": {
      "plaintiff": "原告姓名或名稱（多人時用頓號分隔）",
      "defendant": "被告姓名或名稱（多人時用頓號分隔）"
    }
  },
  "favorablePoints": [
    "對被告/上訴人有利的判決認定（至少3點，每點50-80字）"
  ],
  "unfavorablePoints": [
    "對被告/上訴人不利的判決認定（至少3點，每點50-80字）"
  ],
  "legalGrounds": [
    "判決引用的相關法條（包含完整條號和法律名稱）"
  ],
  "appealableIssues": [
    "具體可行的上訴理由（至少3點，每點30-60字）"
  ],
  "recommendedStrategy": "綜合法律建議和策略方向（100-200字）"
}

分析要求：
1. 確保所有內容基於判決書實際內容
2. 法律分析要客觀專業
3. 上訴理由要具體可行
4. 回應必須是有效的JSON格式，不要包含其他文字
5. 如果某些資訊在判決書中不明確，請明確說明「判決書中未明確記載」
    `;

    try {
      const response = await this.callAPI(prompt, 3000);
      return this.parseJudgmentAnalysis(response);
    } catch (error) {
      console.error('判決分析失敗:', error);
      throw new Error(`AI分析服務錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  }

  /**
   * 生成法律文書
   */
  static async generateDocument(request: DocumentGenerationRequest): Promise<string> {
    const { documentType, analysis, customInstructions } = request;
    
    const prompt = `
作為專業的台灣法律文書撰寫助手，請根據以下判決分析結果撰寫${documentType}。

案件分析資料：
${JSON.stringify(analysis, null, 2)}

${customInstructions ? `\n特殊要求：${customInstructions}\n` : ''}

請依照台灣法院${documentType}的標準格式撰寫，包含：

1. 文書標頭（當事人資訊）
2. 案件基本資料
3. 事實陳述
4. 理由闡述
5. 法律依據
6. 聲明事項

格式要求：
- 嚴格遵循台灣法院書狀格式
- 使用正確的法律術語
- 條理清晰，論述有力
- 引用的法條要精確
- 文字要正式且專業

請直接提供完整的${documentType}內容，不要包含任何前言或後語。
    `;

    try {
      const response = await this.callAPI(prompt, 4000);
      return this.formatLegalDocument(response, documentType);
    } catch (error) {
      console.error('文書生成失敗:', error);
      throw new Error(`文書生成錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  }

  /**
   * 調用 AI API
   */
  private static async callAPI(prompt: string, maxTokens: number = 2000): Promise<string> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('未設定 API 金鑰，請在環境變數中設定 VITE_GEMINI_API_KEY');
    }

    const response = await fetch(this.API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.MODEL,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3, // 較低的溫度以確保準確性
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(
        `API 請求失敗 (${response.status}): ${
          errorData?.error?.message || response.statusText
        }`
      );
    }

    const data = await response.json();
    
    if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('API 回應格式錯誤');
    }

    return data.content[0].text || '';
  }

  /**
   * 解析判決分析結果
   */
  private static parseJudgmentAnalysis(responseText: string): JudgmentAnalysis {
    try {
      // 嘗試提取 JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('回應中未找到有效的 JSON 格式');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // 驗證必要字段
      this.validateAnalysisResult(parsed);
      
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('AI 回應的 JSON 格式有誤');
      }
      throw error;
    }
  }

  /**
   * 驗證分析結果
   */
  private static validateAnalysisResult(result: any): void {
    const requiredFields = {
      'summary': 'string',
      'caseInfo': 'object',
      'favorablePoints': 'array',
      'unfavorablePoints': 'array',
      'legalGrounds': 'array',
      'appealableIssues': 'array',
      'recommendedStrategy': 'string'
    };

    for (const [field, type] of Object.entries(requiredFields)) {
      if (!(field in result)) {
        throw new Error(`分析結果缺少必要字段: ${field}`);
      }
      
      if (type === 'array' && (!Array.isArray(result[field]) || result[field].length === 0)) {
        throw new Error(`字段 ${field} 必須是非空陣列`);
      }
      
      if (type === 'string' && typeof result[field] !== 'string') {
        throw new Error(`字段 ${field} 必須是字符串`);
      }
      
      if (type === 'object' && typeof result[field] !== 'object') {
        throw new Error(`字段 ${field} 必須是物件`);
      }
    }

    // 驗證 caseInfo 子字段
    const caseInfo = result.caseInfo;
    if (!caseInfo.caseNumber || !caseInfo.court || !caseInfo.parties) {
      throw new Error('案件資訊不完整');
    }
    
    if (!caseInfo.parties.plaintiff || !caseInfo.parties.defendant) {
      throw new Error('當事人資訊不完整');
    }
  }

  /**
   * 格式化法律文書
   */
  private static formatLegalDocument(content: string, documentType: string): string {
    // 移除可能的前後綴文字
    let formatted = content.trim();
    
    // 確保文書有適當的標頭
    if (!formatted.includes(documentType)) {
      formatted = `${documentType}\n\n${formatted}`;
    }
    
    // 標準化格式
    formatted = formatted
      // 統一標點符號
      .replace(/，\s+/g, '，')
      .replace(/。\s+/g, '。\n')
      // 確保段落間距
      .replace(/\n{3,}/g, '\n\n')
      // 修正法條格式
      .replace(/第\s*(\d+)\s*條/g, '第$1條')
      .trim();

    return formatted;
  }

  /**
   * 測試 API 連接
   */
  static async testConnection(): Promise<boolean> {
    try {
      await this.callAPI('請回應「連接成功」', 100);
      return true;
    } catch (error) {
      console.error('API 連接測試失敗:', error);
      return false;
    }
  }
}

export default GeminiService;
