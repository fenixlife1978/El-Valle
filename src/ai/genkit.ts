import { genkit } from 'genkit';

// Usamos una declaración de tipo "any" para que el compilador no busque las declaraciones de tipo inexistentes
const googleAI: any = (require('@genkit-ai/google-genai') as any).googleAI;

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.0-flash',
});
