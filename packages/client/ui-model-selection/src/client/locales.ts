/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` intentionally matches `trigger.fallback` but remains a
 * separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'command.label': '模型',
  'command.description': '選擇本會話使用的模型',
  'option.loadError': '目錄加載失敗：{message}',
  'option.deepseekV4Flash.description': '快速、高效且經濟；適合目標明確、常規或并行任務。',
  'option.deepseekV4Pro.description': '更強的自主編碼、知識與復雜推理能力；適合復雜或質量優先的任務，但成本更高。',
  'trigger.fallback': '選擇模型',
  'trigger.loading': '正在加載模型…',
  'trigger.selectAria': '選擇模型',
  'trigger.aria': '選擇模型，當前 {model}',
  'trigger.ariaEffort': '選擇模型，當前 {model}，推理等級 {effort}',
  'menu.aria': '模型與推理等級',
  'menu.model': '模型',
  'menu.effort': '推理等級',
  'effort.providerDefault': 'Default',
  'status.loading': '正在刷新模型列表…',
  'error.action': '模型操作失敗：{message}',
  'action.reload': '重新加載',
  'warning.groupLoad': '{name} 加載失敗：{message}',
  'empty.models': '沒有可用的模型。',
  'blocked.composer': '當前模型不可用，請先選擇模型',
  'empty.efforts': '當前模型未提供推理等級。',
} satisfies Record<string, string>

/** The model namespace key union. */
export type ModelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'command.label': 'Model',
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'option.deepseekV4Flash.description': 'Fast, efficient, and economical; suited to focused, routine, or parallel tasks.',
  'option.deepseekV4Pro.description': 'Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at higher cost.',
  'trigger.fallback': 'Select model',
  'trigger.loading': 'Loading models…',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'menu.aria': 'Model and reasoning effort',
  'menu.model': 'Model',
  'menu.effort': 'Effort',
  'effort.providerDefault': 'Default',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'action.reload': 'Reload',
  'warning.groupLoad': '{name} failed to load: {message}',
  'empty.models': 'No models available.',
  'blocked.composer': 'This model is unavailable — select one to continue',
  'empty.efforts': 'This model provides no reasoning effort levels.',
} satisfies Record<ModelKey, string>
