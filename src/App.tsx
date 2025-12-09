import React, { useState, useCallback } from 'react';
import { FileText, Scale, Brain, Download, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import './App.css';

// Types
interface JudgmentAnalysis {
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

interface UploadedFile {
  file: File;
  text: string;
  analysis?: JudgmentAnalysis;
}

const App: React.FC = () => {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('');
  const [generatedDocument, setGeneratedDocument] = useState<string>('');

  // PDF Text Extraction using your existing pdfService
  const extractTextFromPdf = async (file: File): Promise<string> => {
    try {
      // 使用你現有的 PDF 服務邏輯
      const arrayBuffer = await file.arrayBuffer();
      
      // 動態導入 pdfjs-dist (確保支援中文字符)
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';
      
      // 載入 PDF 文檔，設定 cMapUrl 以支援中文字符
      const loadingTask = pdfjs.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://esm.sh/pdfjs-dist@5.4.449/cmaps/',
        cMapPacked: true,
      });
      
      const pdf = await loadingTask.promise;
      let fullText = '';
      const totalPages = pdf.numPages;
      
      // 逐頁提取文字
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      if (!fullText.trim()) {
        throw new Error('PDF 文件中未找到可擷取的文字內容。請確認 PDF 檔案包含文字而非僅為掃描圖片。');
      }
      
      return fullText;
    } catch (error) {
      console.error('PDF 解析錯誤:', error);
      throw new Error(`PDF 處理失敗: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // AI Analysis using Gemini API
  const analyzeJudgment = async (text: string): Promise<JudgmentAnalysis> => {
    const prompt = `
    作為專業法律AI助手，請分析以下台灣法院判決書內容並以JSON格式回應：

    ${text}

    請提供以下結構化分析，務必確保回應為有效的JSON格式：
    {
      "summary": "案件摘要（2-3句話概述）",
      "caseInfo": {
        "caseNumber": "案件編號（從判決書中擷取）",
        "court": "法院名稱（完整名稱）",
        "parties": {
          "plaintiff": "原告姓名（多人時用頓號分隔）",
          "defendant": "被告姓名（多人時用頓號分隔）"
        }
      },
      "favorablePoints": ["對被告/當事人有利的判決要點（每項30-50字）"],
      "unfavorablePoints": ["對被告/當事人不利的判決要點（每項30-50字）"],
      "legalGrounds": ["相關法條（含條號）"],
      "appealableIssues": ["可能的上訴理由（每項30-50字）"],
      "recommendedStrategy": "建議的法律策略（50-100字）"
    }

    請確保：
    1. 所有字段都必須填寫
    2. 陣列至少包含1項內容
    3. 回應僅包含JSON，不要其他文字
    4. 分析要客觀專業
    `;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [
            { role: "user", content: prompt }
          ],
        })
      });

      if (!response.ok) {
        throw new Error(`API 請求失敗: ${response.status}`);
      }

      const data = await response.json();
      const analysisText = data.content?.[0]?.text || '';
      
      // 嘗試解析 JSON 回應
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        
        // 驗證必要字段
        if (!parsedResult.summary || !parsedResult.caseInfo) {
          throw new Error('AI 分析回應格式不完整');
        }
        
        return parsedResult;
      } else {
        throw new Error('AI 回應中未找到有效的 JSON 格式');
      }
    } catch (error) {
      console.error('判決分析失敗:', error);
      
      // 如果 API 失敗，提供基本的文字分析結果
      const basicAnalysis = extractBasicInfo(text);
      throw new Error(`AI 分析服務暫時無法使用: ${error instanceof Error ? error.message : '未知錯誤'}`);
    }
  };

  // 基本的文字分析功能（備用）
  const extractBasicInfo = (text: string) => {
    const caseNumberMatch = text.match(/(\d+年度\w+字第\d+號)/);
    const courtMatch = text.match(/(臺灣\w+地方法院|臺灣高等法院|最高法院)/);
    
    return {
      summary: "已完成 PDF 文字擷取，請手動檢視內容進行分析",
      caseInfo: {
        caseNumber: caseNumberMatch?.[0] || "未找到案號",
        court: courtMatch?.[0] || "未找到法院",
        parties: {
          plaintiff: "請從判決書中確認",
          defendant: "請從判決書中確認"
        }
      },
      favorablePoints: ["請手動分析判決內容"],
      unfavorablePoints: ["請手動分析判決內容"],
      legalGrounds: ["請查閱判決書相關法條"],
      appealableIssues: ["請諮詢專業律師"],
      recommendedStrategy: "建議詳細閱讀判決書全文並諮詢法律專業人士"
    };
  };

  // Generate legal document
  const generateDocument = async (documentType: string, analysis: JudgmentAnalysis): Promise<string> => {
    const prompt = `
    基於以下判決分析結果，請撰寫${documentType}：

    案件資訊：${JSON.stringify(analysis.caseInfo)}
    分析結果：${JSON.stringify(analysis)}

    請依照台灣法院格式撰寫，包含：
    1. 當事人資訊
    2. 案件事實
    3. 上訴理由
    4. 法律依據  
    5. 聲明事項

    請直接提供完整的法律文書內容。
    `;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [
            { role: "user", content: prompt }
          ],
        })
      });

      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('Document generation failed:', error);
      return "文件生成失敗，請稍後再試。";
    }
  };

  // Handle file upload with proper error handling
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) {
      alert('請選擇一個檔案');
      return;
    }
    
    if (file.type !== 'application/pdf') {
      alert('請上傳 PDF 格式的判決書');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      alert('檔案大小不能超過 10MB');
      return;
    }

    setIsAnalyzing(true);
    try {
      const text = await extractTextFromPdf(file);
      setUploadedFile({ file, text });
      
      // 自動開始分析
      setTimeout(() => {
        setIsAnalyzing(false);
      }, 500);
    } catch (error) {
      console.error('檔案處理錯誤:', error);
      alert(error instanceof Error ? error.message : '檔案處理失敗，請稍後再試');
      setIsAnalyzing(false);
    }
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  // Start analysis
  const startAnalysis = async () => {
    if (!uploadedFile) return;

    setIsAnalyzing(true);
    try {
      const analysis = await analyzeJudgment(uploadedFile.text);
      setUploadedFile(prev => prev ? { ...prev, analysis } : null);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate document
  const handleGenerateDocument = async () => {
    if (!uploadedFile?.analysis || !selectedDocumentType) return;

    setIsGenerating(true);
    try {
      const document = await generateDocument(selectedDocumentType, uploadedFile.analysis);
      setGeneratedDocument(document);
    } catch (error) {
      console.error('Document generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <Scale className="logo-icon" />
          <h1>LegalMind AI</h1>
        </div>
        <p className="subtitle">判決分析與訴狀生成助手</p>
      </header>

      <main className="app-main">
        {/* File Upload Section */}
        {!uploadedFile && (
          <section className="upload-section">
            <div 
              className="drop-zone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => e.preventDefault()}
            >
              <Upload className="upload-icon" />
              <h3>上傳判決書 PDF</h3>
              <p>點擊或將檔案拖放至此</p>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className="file-input"
              />
              <div className="format-info">
                支援格式: PDF (可擷取文字) | 最大 10MB
              </div>
            </div>
          </section>
        )}

        {/* PDF Content Preview and Analysis Section */}
        {uploadedFile && !uploadedFile.analysis && (
          <section className="content-preview-section">
            <div className="file-info">
              <FileText className="file-icon" />
              <div>
                <h3>{uploadedFile.file.name}</h3>
                <p>檔案大小: {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            
            {/* PDF Content Preview */}
            <div className="content-preview">
              <h4>PDF 內容預覽</h4>
              <div className="text-preview">
                <pre>{uploadedFile.text.substring(0, 1000)}{uploadedFile.text.length > 1000 ? '...\n\n[顯示前1000字符]' : ''}</pre>
              </div>
            </div>
            
            <button 
              className="analyze-btn"
              onClick={startAnalysis}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Brain className="btn-icon spinning" />
                  AI 分析中...
                </>
              ) : (
                <>
                  <Brain className="btn-icon" />
                  開始 AI 分析
                </>
              )}
            </button>
          </section>
        )}

        {/* Results Section */}
        {uploadedFile?.analysis && (
          <section className="results-section">
            <div className="analysis-results">
              <h2>判決分析結果</h2>
              
              {/* Case Info */}
              <div className="result-card">
                <h3>案件資訊</h3>
                <div className="case-info">
                  <p><strong>案號：</strong>{uploadedFile.analysis.caseInfo.caseNumber}</p>
                  <p><strong>法院：</strong>{uploadedFile.analysis.caseInfo.court}</p>
                  <p><strong>當事人：</strong>{uploadedFile.analysis.caseInfo.parties.plaintiff} 訴 {uploadedFile.analysis.caseInfo.parties.defendant}</p>
                </div>
              </div>

              {/* Summary */}
              <div className="result-card">
                <h3>案件摘要</h3>
                <p>{uploadedFile.analysis.summary}</p>
              </div>

              {/* Favorable vs Unfavorable */}
              <div className="pros-cons-grid">
                <div className="result-card favorable">
                  <div className="card-header">
                    <CheckCircle className="header-icon" />
                    <h3>對我有利</h3>
                  </div>
                  <ul>
                    {uploadedFile.analysis.favorablePoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>

                <div className="result-card unfavorable">
                  <div className="card-header">
                    <AlertCircle className="header-icon" />
                    <h3>判決調點 / 對我不利</h3>
                  </div>
                  <ul>
                    {uploadedFile.analysis.unfavorablePoints.map((point, index) => (
                      <li key={index}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Document Generation */}
              <div className="result-card">
                <h3>選擇生成文書類型</h3>
                <div className="document-type-selector">
                  {['民事上訴狀', '刑事上訴狀', '答辯狀', '起訴狀'].map((type) => (
                    <button
                      key={type}
                      className={`doc-type-btn ${selectedDocumentType === type ? 'active' : ''}`}
                      onClick={() => setSelectedDocumentType(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                {selectedDocumentType && (
                  <button 
                    className="generate-btn"
                    onClick={handleGenerateDocument}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Brain className="btn-icon spinning" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <FileText className="btn-icon" />
                        開始撰寫書狀
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Generated Document */}
              {generatedDocument && (
                <div className="result-card">
                  <div className="card-header">
                    <FileText className="header-icon" />
                    <h3>{selectedDocumentType}</h3>
                    <button className="download-btn">
                      <Download className="btn-icon" />
                      下載
                    </button>
                  </div>
                  <div className="generated-document">
                    <pre>{generatedDocument}</pre>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>Powered by Gemini 2.5 Flash & Claude Sonnet 4 | 專為法律教育設計</p>
      </footer>
    </div>
  );
};

export default App;
