/** Locale-owned HTML implementation name and iframe status text. */
export const zh = {
  title: 'HTML',
  frame: 'HTML 文檔預覽',
  loading: '正在準備 HTML 預覽…',
  failed: '無法預覽這份 HTML 文檔。',
} satisfies Record<string, string>

/** HTML renderer dictionary keys. */
export type HtmlPreviewKey = keyof typeof zh

/** English dictionary with the same keys as the Chinese dictionary. */
export const en = {
  title: 'HTML',
  frame: 'HTML document preview',
  loading: 'Preparing HTML preview…',
  failed: 'This HTML document could not be previewed.',
} satisfies Record<HtmlPreviewKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** HTML preview selection and status text. */
    documentHtml: HtmlPreviewKey
  }
}
