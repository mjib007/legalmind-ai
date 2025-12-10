/**
 * PDF Service for LegalMind AI
 * Using the working configuration from another AI
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker with the working solution
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs`;

export interface PDFExtractionResult {
  text: string;
  pageCount: number;
  metadata: {
    fileSize: number;
    pageCount: number;
    extractionTime: number;
  };
}

export interface TextQualityAssessment {
  quality: 'high' | 'medium' | 'low';
  wordCount: number;
  issues: string[];
}

class PDFService {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  
  /**
   * Validate PDF file
   */
  static validateFile(file: File): void {
    if (!file) {
      throw new Error('請選擇一個檔案');
    }
    
    if (file.type !== 'application/pdf') {
      throw new Error('請選擇 PDF 檔案');
    }
    
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`檔案大小超過限制（最大 ${this.MAX_FILE_SIZE / 1024 / 1024}MB）`);
    }
  }

  /**
   * Extract text from PDF using the working configuration
   */
  static async extractTextFromPDF(file: File): Promise<PDFExtractionResult> {
    const startTime = Date.now();
    
    try {
      // Validate file first
      this.validateFile(file);
      
      const arrayBuffer = await file.arrayBuffer();
      
      // Load the PDF document with the working configuration
      const loadingTask = pdfjsLib.getDocument({ 
        data: arrayBuffer,
        cMapUrl: `https://esm.sh/pdfjs-dist@5.4.449/cmaps/`,
        cMapPacked: true,
      });
      
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      let fullText = '';

      // Loop through each page to extract text
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map((item: any) => item.str || '') // Safely handle items without string content
          .join(' ');
        
        fullText += pageText + '\n\n';
      }

      // Clean up the text
      const cleanText = this.cleanExtractedText(fullText);
      const extractionTime = Date.now() - startTime;

      if (cleanText.trim().length < 50) {
        throw new Error("PDF text extraction resulted in insufficient data. The PDF might be an image scan.");
      }

      return {
        text: cleanText,
        pageCount: totalPages,
        metadata: {
          fileSize: file.size,
          pageCount: totalPages,
          extractionTime
        }
      };
      
    } catch (error: any) {
      console.error("Error parsing PDF:", error);
      throw new Error(`無法讀取 PDF 檔案 (${error.message || 'Unknown error'})。請確保檔案未加密且包含可選取的文字（非純圖片掃描）。`);
    }
  }

  /**
   * Clean extracted text
   */
  private static cleanExtractedText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove empty lines
      .replace(/\n\s*\n/g, '\n')
      // Trim
      .trim();
  }

  /**
   * Assess text quality
   */
  static assessTextQuality(text: string): TextQualityAssessment {
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    const issues: string[] = [];
    
    let quality: 'high' | 'medium' | 'low' = 'high';
    
    if (wordCount < 100) {
      issues.push('文字內容過少');
      quality = 'low';
    }
    
    const singleChars = text.split('').filter(char => /[\u4e00-\u9fa5a-zA-Z]/.test(char)).length;
    const totalChars = text.length;
    if (singleChars / totalChars < 0.5) {
      issues.push('可能包含亂碼或格式化問題');
      quality = quality === 'high' ? 'medium' : 'low';
    }
    
    if (/(.)\1{10,}/.test(text)) {
      issues.push('包含過多重複字符');
      quality = quality === 'high' ? 'medium' : 'low';
    }
    
    return {
      quality,
      wordCount,
      issues
    };
  }

  /**
   * Extract basic case information using regex patterns
   */
  static extractBasicInfo(text: string) {
    const caseNumberMatch = text.match(/案號[：:\s]*([^\n\s]+)/);
    const courtMatch = text.match(/(臺灣|台灣)?(.{2,8})(地方法院|高等法院|最高法院)/);
    
    return {
      caseNumber: caseNumberMatch ? caseNumberMatch[1].trim() : '未找到案號',
      court: courtMatch ? courtMatch[0].trim() : '未找到法院資訊'
    };
  }
}

export default PDFService;
