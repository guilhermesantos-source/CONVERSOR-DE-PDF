import React, { useState, useRef } from 'react';
import { FileUp, FileText, Loader2, CheckCircle2, AlertCircle, Copy, Trash2, Download, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { NFeResult } from './types/nfe';
import { processFile } from './lib/gemini';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<NFeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files as FileList);
      const validFiles = selectedFiles.filter(f => 
        f.type === 'application/pdf' || 
        f.type.startsWith('image/') ||
        f.type === 'application/zip' || 
        f.name.endsWith('.zip')
      );

      const directFiles = validFiles.filter(f => f.type !== 'application/zip' && !f.name.endsWith('.zip'));
      const zipFiles = validFiles.filter(f => f.type === 'application/zip' || f.name.endsWith('.zip'));

      setFiles(prev => [...prev, ...directFiles]);

      if (zipFiles.length > 0) {
        setIsExtractingZip(true);
        for (const zipFile of zipFiles) {
          try {
            const zip = new JSZip();
            const contents = await zip.loadAsync(zipFile);
            const extractedFiles: File[] = [];

            for (const [path, file] of Object.entries(contents.files)) {
              const lowerPath = path.toLowerCase();
              const isPdf = lowerPath.endsWith('.pdf');
              const isImg = lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') || lowerPath.endsWith('.png') || lowerPath.endsWith('.webp');
              
              if (!file.dir && (isPdf || isImg)) {
                const blob = await file.async('blob');
                let mimeType = 'application/pdf';
                if (isImg) {
                  if (lowerPath.endsWith('.png')) mimeType = 'image/png';
                  else if (lowerPath.endsWith('.webp')) mimeType = 'image/webp';
                  else mimeType = 'image/jpeg';
                }
                const newFile = new File([blob], path.split('/').pop() || path, { type: mimeType });
                extractedFiles.push(newFile);
              }
            }
            setFiles(prev => [...prev, ...extractedFiles]);
          } catch (error) {
            console.error("Erro ao extrair ZIP:", error);
          }
        }
        setIsExtractingZip(false);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setResults([]);
  };

  const startProcessing = async () => {
    if (files.length === 0) return;
    setIsLoading(true);
    setResults([]);

    try {
      const nestedResults = await Promise.all(files.map(file => processFile(file)));
      setResults(nestedResults.flat());
    } catch (error) {
      console.error("Erro no processamento:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = () => {
    const data = results.map(res => ({ 
      'Arquivo': res.sourceFileName, 
      'Razão Social': res.razaoSocial || 'N/A',
      'Natureza da Operação': res.natureza || 'N/A',
      'Chave NF-e': res.key 
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Chaves NF-e");
    XLSX.writeFile(workbook, "Chaves_NFe_Extraidas.xlsx");
  };

  const generateHTML = () => {
    return results.map(res => {
      let content = "";
      const infoText = `
        <p style="color:black; font-weight:bold; margin-bottom: 2px;">Razão Social: ${res.razaoSocial || 'Não identificada'}</p>
        <p style="color:black; font-weight:bold; margin-bottom: 5px;">Natureza: ${res.natureza || 'Não identificada'}</p>
      `;
      
      if (res.error) {
        content = `<p style="color:red; background:white; font-weight:bold;">${res.error}</p>`;
      } else if (res.key === 'Nenhuma chave encontrada') {
        content = infoText + `<p style="color:red; background:white; font-weight:bold;">Nenhuma chave encontrada</p>`;
      } else {
        content = infoText + `<p style="color:red; background:white; font-weight:bold;">${res.key}</p>`;
      }
      return `<h3>${res.sourceFileName}</h3>\n${content}`;
    }).join('\n\n');
  };

  const copyToClipboard = () => {
    const html = generateHTML();
    navigator.clipboard.writeText(html);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-red-600 selection:text-white">
      <div className="h-2 bg-red-600 w-full sticky top-0 z-50" />

      <div className="max-w-5xl mx-auto px-4 py-12 md:py-20">
        <header className="mb-16 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="w-12 h-12 bg-black flex items-center justify-center rounded-none transform -rotate-3">
                <FileText className="text-white w-6 h-6" />
              </div>
              <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
                NF-E <span className="text-red-600">ISA'S</span>
              </h1>
            </motion.div>
          </div>

          <div className="flex gap-4">
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-30">Status do Sistema</p>
              <p className="text-xs font-bold text-green-600 flex items-center justify-end gap-1">
                <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse" /> ONLINE
              </p>
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5 space-y-8">
            <section className="border-4 border-black p-8 bg-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-600 transform translate-x-8 -translate-y-8 rotate-45 group-hover:scale-110 transition-transform" />
              
              <h2 className="text-2xl font-black uppercase mb-6 flex items-center gap-2">
                <FileUp className="w-6 h-6" /> Importar
              </h2>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-4 border-dashed border-black/10 p-10 text-center cursor-pointer hover:border-red-600 hover:bg-red-50 transition-all duration-300 group/drop"
              >
                <Archive className="mx-auto w-16 h-16 mb-4 text-black group-hover/drop:text-red-600 transition-colors" />
                <p className="font-black text-lg uppercase leading-tight">
                  Arraste PDFs, Imagens <br /> ou arquivos <span className="text-red-600">ZIP</span>
                </p>
                <p className="text-[10px] font-bold uppercase opacity-40 mt-4 tracking-widest">
                  Processamento em lote suportado
                </p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple 
                  accept=".pdf,.zip,.jpg,.jpeg,.png,.webp" 
                  className="hidden" 
                />
              </div>

              {isExtractingZip && (
                <div className="mt-4 flex items-center justify-center gap-2 text-red-600 font-bold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs uppercase">Extraindo conteúdo do ZIP...</span>
                </div>
              )}

              {files.length > 0 && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-black pb-2">
                    <p className="text-xs font-black uppercase tracking-widest">Fila de Processamento ({files.length})</p>
                    <button 
                      onClick={clearAllFiles}
                      className="text-[10px] font-black uppercase text-red-600 hover:underline"
                    >
                      Limpar Tudo
                    </button>
                  </div>
                  
                  <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    <AnimatePresence>
                      {files.map((file, idx) => (
                        <motion.div 
                          key={`${file.name}-${idx}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="flex items-center justify-between p-3 bg-black text-white"
                        >
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <FileText className="w-4 h-4 flex-shrink-0 text-red-600" />
                            <span className="text-[10px] font-bold uppercase truncate">{file.name}</span>
                          </div>
                          <button 
                            onClick={() => removeFile(idx)}
                            className="p-1 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  
                  <button 
                    onClick={startProcessing}
                    disabled={isLoading}
                    className="w-full bg-red-600 text-white py-5 font-black uppercase tracking-[0.2em] hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Processando...</span>
                      </>
                    ) : (
                      <span>Iniciar Extração</span>
                    )}
                  </button>
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-7">
            <section className="border-4 border-black p-8 bg-black text-white min-h-[400px] flex flex-col shadow-[12px_12px_0px_0px_rgba(220,38,38,1)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
                <h2 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-3">
                  <span className="w-3 h-8 bg-red-600 inline-block" /> Resultados
                </h2>
                
                {results.length > 0 && (
                  <div className="flex gap-2">
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white text-black px-4 py-2 hover:bg-red-600 hover:text-white transition-colors"
                    >
                      {copySuccess ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copySuccess ? 'Copiado' : 'HTML'}</span>
                    </button>
                    <button 
                      onClick={exportToExcel}
                      className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-red-600 text-white px-4 py-2 hover:bg-white hover:text-black transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Excel</span>
                    </button>
                  </div>
                )}
              </div>

              {results.length === 0 && !isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center opacity-20 text-center py-20">
                  <FileText className="w-24 h-24 mb-6" />
                  <p className="font-black uppercase tracking-[0.3em]">Aguardando Processamento</p>
                </div>
              )}

              {isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center py-20">
                  <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-6" />
                  <p className="font-black uppercase tracking-[0.2em] animate-pulse">Analisando Documentos...</p>
                </div>
              )}

              <div className="flex-1 space-y-8 overflow-y-auto pr-4 custom-scrollbar-white">
                {results.map((res, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="border-l-4 border-red-600 pl-6 py-2"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-black text-xs uppercase tracking-widest opacity-50 flex items-center gap-2">
                        <FileText className="w-3 h-3" /> {res.sourceFileName}
                      </h3>
                    </div>

                    {res.razaoSocial && res.razaoSocial !== "Não identificada" && (
                      <div className="mb-2">
                        <p className="text-[10px] font-black uppercase text-red-600 tracking-widest mb-1">Razão Social</p>
                        <p className="text-sm font-bold bg-white text-black px-3 py-1 inline-block border-l-4 border-black">{res.razaoSocial}</p>
                      </div>
                    )}

                    {res.natureza && res.natureza !== "Não identificada" && (
                      <div className="mb-4">
                        <p className="text-[10px] font-black uppercase text-red-600 tracking-widest mb-1">Natureza da Operação</p>
                        <p className="text-sm font-bold bg-white text-black px-3 py-1 inline-block border-l-4 border-black">{res.natureza}</p>
                      </div>
                    )}
                    
                    {res.error ? (
                      <div className="flex items-center gap-2 text-red-500 font-bold text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>{res.error}</span>
                      </div>
                    ) : res.key && res.key !== "Nenhuma chave encontrada" ? (
                      <div className="grid gap-3">
                        <p className="text-[10px] font-black uppercase text-red-600 tracking-widest">Chave Encontrada</p>
                        <div className="bg-white text-black font-black p-4 text-sm md:text-base break-all font-mono border-b-4 border-red-600">
                          {res.key}
                        </div>
                      </div>
                    ) : (
                      <div className="text-red-600 font-black uppercase text-sm italic">
                        Nenhuma chave encontrada
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </section>
          </div>
        </main>

        <footer className="mt-24 pt-12 border-t-4 border-black flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-red-600" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em]">
              NF-E ISA'S SYSTEM v3.0
            </p>
          </div>
          <p className="text-[10px] font-bold uppercase opacity-30">
            Powered by Google Gemini AI • 2026
          </p>
        </footer>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f0f0f0;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #000;
        }
        
        .custom-scrollbar-white::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar-white::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .custom-scrollbar-white::-webkit-scrollbar-thumb {
          background: #dc2626;
        }
      `}</style>
    </div>
  );
}
