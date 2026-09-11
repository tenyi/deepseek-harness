/** Locale-owned image renderer labels and status text. */
export const zh = {
  title: '圖片',
  preview: '圖片預覽：{name}',
  loading: '正在打開圖片…',
  failed: '無法顯示這張圖片。',
  unsupported: '圖片預覽需要完整文件內容。',
} satisfies Record<string, string>

/** Image renderer dictionary keys. */
export type ImagePreviewKey = keyof typeof zh

/** English dictionary with the same keys as the Chinese dictionary. */
export const en = {
  title: 'Image',
  preview: 'Image preview: {name}',
  loading: 'Opening image…',
  failed: 'This image could not be displayed.',
  unsupported: 'Image preview requires the complete file contents.',
} satisfies Record<ImagePreviewKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Image preview selection, accessible name, and status text. */
    sidebarImage: ImagePreviewKey
  }
}
