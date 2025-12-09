/**
 * LegalMind AI - PDF 處理服務
 * 專門處理台灣法院判決書 PDF 檔案的文字擷取
 */

import * as pdfjsLib from 'pdfjs-dist';

// 配置 PDF.js Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

export interface PDFExtractionResult {
  text: string;
  metadata: {
    pageCount: number;
    fileSize: number;
    fileName: string;
    extractionTime: number;
  };
}

export interface PDFAnalysisData {
  caseNumber?: string;
  court?: string;
  plaintiff?: string;
  defendant?: string;
  rawText: string;
}

export class PDFService {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly SUPPORTED_TYPES = ['application/pdf'];

  /**
   * 驗證 PDF 檔案
   */
  static validateFile(file: File): { isValid: boolean; error?: string } {
    if (!this.SUPPORTED_TYPES.includes(file.type)) {
      return { isValid: false, error: '請上傳 PDF 格式的檔案' };
    }

    if (file.size > this.MAX_FILE_SIZE) {
      return { isValid: false, error: '檔案大小不能超過 10MB' };
    }

    if (file.size === 0) {
      return { isValid: false, error: '檔案內容為空' };
    }

    return { isValid: true };
  }

  /**
   * 從 PDF 檔案擷取文字內容
   */
  static async extractTextFromPDF(file: File): Promise<PDFExtractionResult> {
    const startTime = performance.now();
    
    try {
      // 驗證檔案
      const validation = this.validateFile(file);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // 讀取檔案為 ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // 載入 PDF 文檔，配置中文字符支援
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://esm.sh/pdfjs-dist@5.4.449/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://esm.sh/pdfjs-dist@5.4.449/standard_fonts/',
      });
      
      const pdf = await loadingTask.promise;
      let fullText = '';
      const totalPages = pdf.numPages;
      
      // 逐頁擷取文字內容
      for (let i = 1; i <= totalPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // 提取並組合文字項目
          const pageText = textContent.items
            .filter((item: any) => item.str && item.str.trim())
            .map((item: any) => item.str.trim())
            .join(' ');
          
          if (pageText.trim()) {
            fullText += `\n=== 第 ${i} 頁 ===\n${pageText}\n`;
          }
        } catch (pageError) {
          console.warn(`第 ${i} 頁處理失敗:`, pageError);
          continue;
        }
      }
      
      // 清理和格式化文字
      const cleanedText = this.cleanExtractedText(fullText);
      
      if (!cleanedText.trim()) {
        throw new Error('PDF 檔案中未找到可擷取的文字內容。請確認檔案包含文字而非僅為掃描圖片。');
      }
      
      const extractionTime = performance.now() - startTime;
      
      return {
        text: cleanedText,
        metadata: {
          pageCount: totalPages,
          fileSize: file.size,
          fileName: file.name,
          extractionTime: Math.round(extractionTime)
        }
      };
      
    } catch (error) {
      console.error('PDF 處理錯誤:', error);
      throw new Error(
        error instanceof Error 
          ? error.message 
          : 'PDF 處理失敗，請確認檔案完整且未損壞'
      );
    }
  }

  /**
   * 清理和格式化擷取的文字
   */
  private static cleanExtractedText(rawText: string): string {
    return rawText
      // 移除多餘的空白字符
      .replace(/\s+/g, ' ')
      // 修復斷行
      .replace(/([。！？])\s+/g, '$1\n')
      // 修復法條編號格式
      .replace(/第\s*(\d+)\s*條/g, '第$1條')
      // 移除頁碼標記
      .replace(/=== 第 \d+ 頁 ===/g, '')
      // 修復案號格式
      .replace(/(\d+)\s*年度\s*(\w+)\s*字第\s*(\d+)\s*號/g, '$1年度$2字第$3號')
      // 統一標點符號
      .replace(/，\s+/g, '，')
      .replace(/。\s+/g, '。\n')
      // 移除開頭結尾的空白
      .trim();
  }

  /**
   * 從文字中提取基本案件資訊
   */
  static extractBasicInfo(text: string): PDFAnalysisData {
    const result: PDFAnalysisData = { rawText: text };

    try {
      // 擷取案件編號
      const caseNumberMatch = text.match(/(\d+年度\w+字第\d+號)/);
      if (caseNumberMatch) {
        result.caseNumber = caseNumberMatch[1];
      }

      // 擷取法院名稱
      const courtMatches = [
        /臺灣(\w+)地方法院/,
        /臺灣高等法院(\w+分院)?/,
        /最高法院/,
        /最高行政法院/,
        /智慧財產法院/
      ];
      
      for (const pattern of courtMatches) {
        const match = text.match(pattern);
        if (match) {
          result.court = match[0];
          break;
        }
      }

      // 擷取當事人資訊
      const plaintiffMatch = text.match(/原\s*告[：:](.+?)(?=被|上)/);
      if (plaintiffMatch) {
        result.plaintiff = plaintiffMatch[1].trim();
      }

      const defendantMatch = text.match(/被\s*告[：:](.+?)(?=\n|。)/);
      if (defendantMatch) {
        result.defendant = defendantMatch[1].trim();
      }

    } catch (error) {
      console.warn('基本資訊擷取失敗:', error);
    }

    return result;
  }

  /**
   * 檢查文字內容品質
   */
  static assessTextQuality(text: string): {
    quality: 'high' | 'medium' | 'low';
    issues: string[];
    wordCount: number;
  } {
    const issues: string[] = [];
    const wordCount = text.trim().split(/\s+/).length;
    
    // 檢查文字長度
    if (wordCount < 100) {
      issues.push('文字內容過少，可能為掃描檔案');
    }
    
    // 檢查是否包含判決書關鍵字
    const legalKeywords = ['判決', '原告', '被告', '法院', '案件', '事實', '理由'];
    const foundKeywords = legalKeywords.filter(keyword => text.includes(keyword));
    
    if (foundKeywords.length < 3) {
      issues.push('未找到足夠的法律文件關鍵字');
    }
    
    // 檢查字符品質
    const nonChineseRatio = (text.match(/[^\u4e00-\u9fa5\w\s，。！？；：「」]/g) || []).length / text.length;
    if (nonChineseRatio > 0.3) {
      issues.push('可能包含大量無法識別的字符');
    }
    
    let quality: 'high' | 'medium' | 'low';
    if (issues.length === 0 && wordCount > 500) {
      quality = 'high';
    } else if (issues.length <= 1 && wordCount > 200) {
      quality = 'medium';
    } else {
      quality = 'low';
    }
    
    return { quality, issues, wordCount };
  }
}

export default PDFService;
