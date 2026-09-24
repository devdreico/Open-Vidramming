export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderDef {
  id: string;
  label: string;
  keyHint: string;
  protocol: 'openai' | 'anthropic' | 'gemini' | 'cohere';
  chatPath: string;
  modelsPath: string;
  /** GET models catalog; null = no soportado */
  supportsModelList: boolean;
  models: ProviderModel[];
  defaultModel: string;
  /** base64 images in messages */
  supportsVision: boolean;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    keyHint: 'sk-...',
    protocol: 'openai',
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'gpt-4o-mini',
    supportsVision: true,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    keyHint: 'sk-ant-...',
    protocol: 'anthropic',
    chatPath: '/v1/messages',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'claude-sonnet-4-20250514',
    supportsVision: true,
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyHint: 'AIza...',
    protocol: 'gemini',
    chatPath: '',
    modelsPath: '/v1beta/models',
    supportsModelList: true,
    defaultModel: 'gemini-2.0-flash',
    supportsVision: true,
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    keyHint: 'sk-...',
    protocol: 'openai',
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'deepseek-chat',
    supportsVision: false,
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    ],
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    keyHint: 'xai-...',
    protocol: 'openai',
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'grok-3-mini',
    supportsVision: true,
    models: [
      { id: 'grok-3-mini', label: 'Grok 3 Mini' },
      { id: 'grok-3', label: 'Grok 3' },
      { id: 'grok-4-fast', label: 'Grok 4 Fast' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    keyHint: '...',
    protocol: 'openai',
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'mistral-small-latest',
    supportsVision: true,
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small' },
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'codestral-latest', label: 'Codestral' },
    ],
  },
  {
    id: 'cohere',
    label: 'Cohere',
    keyHint: '...',
    protocol: 'cohere',
    chatPath: '/v2/chat',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'command-r-plus',
    supportsVision: false,
    models: [
      { id: 'command-r-plus', label: 'Command R+' },
      { id: 'command-r', label: 'Command R' },
      { id: 'command-a-03-2025', label: 'Command A' },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    keyHint: 'gsk_...',
    protocol: 'openai',
    chatPath: '/openai/v1/chat/completions',
    modelsPath: '/openai/v1/models',
    supportsModelList: true,
    defaultModel: 'llama-3.3-70b-versatile',
    supportsVision: true,
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    ],
  },
  {
    id: 'together',
    label: 'Together AI',
    keyHint: '...',
    protocol: 'openai',
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    supportsVision: false,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-turbo', label: 'Qwen 2.5 72B' },
    ],
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    keyHint: 'fw_...',
    protocol: 'openai',
    chatPath: '/v1/chat/completions',
    modelsPath: '/v1/models',
    supportsModelList: true,
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    supportsVision: false,
    models: [
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B' },
      { id: 'accounts/fireworks/models/deepseek-v3', label: 'DeepSeek V3' },
    ],
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    keyHint: 'pplx-...',
    protocol: 'openai',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    supportsModelList: false,
    defaultModel: 'sonar',
    supportsVision: false,
    models: [
      { id: 'sonar', label: 'Sonar' },
      { id: 'sonar-pro', label: 'Sonar Pro' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyHint: 'sk-or-...',
    protocol: 'openai',
    chatPath: '/api/v1/chat/completions',
    modelsPath: '/api/v1/models',
    supportsModelList: true,
    defaultModel: 'openai/gpt-4o-mini',
    supportsVision: true,
    models: [
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
      { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
    ],
  },
];

export function providerById(id: string): ProviderDef {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Proveedor desconocido: ${id}`);
  return p;
}
