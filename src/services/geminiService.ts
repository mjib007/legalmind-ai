import { GoogleGenerativeAI } from "@google/generative-ai";
import { VerdictAnalysis, DocType } from "../types";

// 初始化 Gemini AI
const getGeminiInstance = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('未設定 VITE_GEMINI_API_KEY 環境變數');
  }
  
  return new GoogleGenerativeAI(apiKey);
};

// 使用 gemini-1.5-flash 進行分析
const ANALYSIS_MODEL = "gemini-1.5-flash";
// 使用 gemini-1.5-pro 進行文書生成  
const WRITING_MODEL = "gemini-1.5-pro";

export const analyzeVerdict = async (pdfText: string): Promise<VerdictAnalysis> => {
  const prompt = `
    你是一位台灣資深律師。請分析以下判決書內容，並提取關鍵資訊。
    請用繁體中文回答，並以JSON格式回應。
    
    判決書內容開始：
    ${pdfText}
    判決書內容結束。

    請針對以上內容進行結構化分析，回應格式必須是有效的JSON：

    {
      "caseNumber": "判決字號 (例如: 112年度訴字第123號)",
      "parties": {
        "plaintiff": "原告/上訴人/告訴人姓名",
        "defendant": "被告/被上訴人姓名"
      },
      "summary": "判決主文與結果摘要 (150字內)",
      "keyFacts": [
        "本案關鍵事實1",
        "本案關鍵事實2",
        "本案關鍵事實3"
      ],
      "legalIssues": [
        "本案主要法律爭點1",
        "本案主要法律爭點2",
        "本案主要法律爭點3"
      ],
      "judgeReasoning": "法官判決理由的核心邏輯摘要",
      "strengths": [
        "對我方(若要上訴)有利的觀點1",
        "對我方有利的觀點2",
        "原審判決瑕疵1"
      ],
      "weaknesses": [
        "對我方不利的事實1",
        "對我方不利的法律見解1",
        "需要補強的論點1"
      ],
      "suggestedStrategy": "建議的上訴或攻防策略"
    }

    重要：請確保回應是完整且有效的JSON格式，不要包含任何其他文字。
  `;

  try {
    const genAI = getGeminiInstance();
    const model = genAI.getGenerativeModel({ model: ANALYSIS_MODEL });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text) {
      throw new Error("Gemini 未返回分析結果");
    }

    // 提取JSON部分
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("回應中未找到有效的JSON格式");
    }

    const analysisResult = JSON.parse(jsonMatch[0]);
    
    // 驗證必要字段
    const requiredFields = ['caseNumber', 'parties', 'summary', 'keyFacts', 'legalIssues', 'judgeReasoning', 'strengths', 'weaknesses', 'suggestedStrategy'];
    for (const field of requiredFields) {
      if (!analysisResult[field]) {
        throw new Error(`分析結果缺少必要字段: ${field}`);
      }
    }

    return analysisResult as VerdictAnalysis;
    
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error("API 金鑰錯誤，請檢查 VITE_GEMINI_API_KEY 設定");
      } else if (error.message.includes('quota')) {
        throw new Error("API 配額已用完，請稍後再試");
      } else if (error.message.includes('JSON')) {
        throw new Error("AI 回應格式錯誤，請重新嘗試");
      }
      throw new Error(`分析判決書失敗: ${error.message}`);
    }
    
    throw new Error("分析判決書時發生未知錯誤，請稍後再試");
  }
};

export const generateAppealDraft = async (
  pdfText: string, 
  analysis: VerdictAnalysis, 
  docType: DocType
): Promise<string> => {
  
  let typePrompt = "";
  switch(docType) {
    case DocType.APPEAL_CIVIL:
      typePrompt = "民事上訴狀";
      break;
    case DocType.APPEAL_CRIMINAL:
      typePrompt = "刑事上訴狀";
      break;
    case DocType.DEFENSE:
      typePrompt = "民事/刑事答辯狀";
      break;
    case DocType.COMPLAINT:
      typePrompt = "起訴狀";
      break;
    default:
      typePrompt = "法律書狀";
  }

  const prompt = `
    你是一位台灣資深律師。請根據以下判決書原文以及先前的分析結果，撰寫一份專業的「${typePrompt}」。
    
    **重要要求：**
    1. 格式必須符合台灣法院書狀慣例（包含案號、當事人欄位、為上訴聲明事等）。
    2. 引用法條必須精確。
    3. 針對原審判決的違法或不當之處（若是上訴狀）進行強有力的駁斥。
    4. 語氣需莊重、專業、有說服力。
    5. 使用繁體中文。
    6. 請直接提供書狀內容，不要包含任何前言說明。

    **分析摘要參考：**
    案號：${analysis.caseNumber}
    當事人：${analysis.parties.plaintiff} vs ${analysis.parties.defendant}
    摘要：${analysis.summary}
    法律爭點：${analysis.legalIssues.join('、')}
    有利觀點：${analysis.strengths.join('、')}
    不利因素：${analysis.weaknesses.join('、')}
    建議策略：${analysis.suggestedStrategy}

    **原始判決書內容參考：**
    ${pdfText.substring(0, 15000)}... (內容過長，已截取前段)
    
    請撰寫完整的${typePrompt}：
  `;

  try {
    const genAI = getGeminiInstance();
    const model = genAI.getGenerativeModel({ model: WRITING_MODEL });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text) {
      throw new Error("Gemini 未返回生成結果");
    }

    return text.trim();
    
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        throw new Error("API 金鑰錯誤，請檢查 VITE_GEMINI_API_KEY 設定");
      } else if (error.message.includes('quota')) {
        throw new Error("API 配額已用完，請稍後再試");
      }
      throw new Error(`撰寫書狀失敗: ${error.message}`);
    }
    
    throw new Error("撰寫書狀時發生未知錯誤，請稍後再試");
  }
};
