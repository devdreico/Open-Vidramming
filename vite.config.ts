import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const llmProxy = (target: string) => ({
  target,
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api\/llm\/[^/]+/, ''),
});

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/llm/openai': llmProxy('https://api.openai.com'),
      '/api/llm/anthropic': llmProxy('https://api.anthropic.com'),
      '/api/llm/gemini': llmProxy('https://generativelanguage.googleapis.com'),
      '/api/llm/deepseek': llmProxy('https://api.deepseek.com'),
      '/api/llm/xai': llmProxy('https://api.x.ai'),
      '/api/llm/mistral': llmProxy('https://api.mistral.ai'),
      '/api/llm/cohere': llmProxy('https://api.cohere.com'),
      '/api/llm/groq': llmProxy('https://api.groq.com'),
      '/api/llm/together': llmProxy('https://api.together.xyz'),
      '/api/llm/fireworks': llmProxy('https://api.fireworks.ai'),
      '/api/llm/perplexity': llmProxy('https://api.perplexity.ai'),
      '/api/llm/openrouter': llmProxy('https://openrouter.ai'),
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 900,
  },
});
