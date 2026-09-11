/** Copy owned by the PDF renderer. */
export const zh = {
  title: 'PDF',
  pageImage: 'PDF 第 {page} 頁',
  loading: '正在打開 PDF…',
  rendering: '正在繪制頁面…',
  failed: '無法顯示 PDF：{message}',
  password: '此 PDF 需要密碼，暫不支持預覽。',
  workerFailed: 'PDF 渲染進程無法繼續，請重試。',
  unsupported: 'PDF 預覽需要完整文件內容。',
  retry: '重試',
} satisfies Record<string, string>

/** PDF translation keys shared by both dictionaries. */
export type PdfLocaleKey = keyof typeof zh

/** English PDF-renderer dictionary. */
export const en = {
  title: 'PDF',
  pageImage: 'PDF page {page}',
  loading: 'Opening PDF…',
  rendering: 'Rendering page…',
  failed: 'Cannot display PDF: {message}',
  password: 'This PDF requires a password; password-protected previews are not supported.',
  workerFailed: 'The PDF rendering process could not continue. Please retry.',
  unsupported: 'PDF preview requires the complete file contents.',
  retry: 'Retry',
} satisfies Record<PdfLocaleKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** PDF page, loading, and failure messages. */
    sidebarPdf: PdfLocaleKey
  }
}
