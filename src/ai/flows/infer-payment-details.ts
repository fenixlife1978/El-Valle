'use server';
/**
 * @fileOverview An AI agent for inferring payment details from natural language.
 *
 * - inferPaymentDetails - A function that interprets user text to fill out a payment form.
 * - InferPaymentDetailsInput - The input type for the inferPaymentDetails function.
 * - InferPaymentDetailsOutput - The return type for the inferPaymentDetails function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { format } from 'date-fns';

const venezuelanBanks = [
    'banesco', 'mercantil', 'provincial', 'bdv', 'bnc', 'tesoro', 'otro'
] as const;
const paymentMethods = ['movil', 'transferencia', 'efectivo_bs', 'efectivo_usd'] as const;

// We define a strict output schema. The AI will do its best to conform to this.
const InferPaymentDetailsOutputSchema = z.object({
  totalAmount: z.number().describe('The numeric total amount of the payment.'),
  paymentDate: z.string().describe(`The date of the payment in 'yyyy-MM-dd' format. Today's date is ${format(new Date(), 'yyyy-MM-dd')}.`),
  paymentMethod: z.enum(paymentMethods).describe('The payment method used.'),
  bank: z.enum(venezuelanBanks).describe('The source bank of the payment.'),
  reference: z.string().describe('The payment reference number, containing only digits.'),
});
export type InferPaymentDetailsOutput = z.infer<typeof InferPaymentDetailsOutputSchema>;

const InferPaymentDetailsInputSchema = z.object({
  text: z.string().describe('The user-provided text describing the payment.'),
});
export type InferPaymentDetailsInput = z.infer<typeof InferPaymentDetailsInputSchema>;


export async function inferPaymentDetails(input: InferPaymentDetailsInput): Promise<InferPaymentDetailsOutput> {
  return inferPaymentDetailsFlow(input);
}


const prompt = ai.definePrompt({
  name: 'inferPaymentDetailsPrompt',
  input: {schema: InferPaymentDetailsInputSchema},
  output: {schema: InferPaymentDetailsOutputSchema},
  prompt: `You are an expert financial assistant for a condominium management app in Venezuela. Your task is to analyze a user's text description of a payment and accurately extract the key details into a structured format.

The user will provide text that might be informal or contain abbreviations. You must interpret it correctly.

Key Information to Extract:
- Amount: The total amount paid in Bolivars (Bs.). Extract only the number.
- Date: The date the payment was made. If the user says "hoy" (today), "ayer" (yesterday), or provides a date, convert it to 'yyyy-MM-dd' format. Today is ${format(new Date(), 'yyyy-MM-dd')}.
- Method: Determine if it was a 'movil' (Pago Móvil), 'transferencia' (Transferencia), 'efectivo_bs' (Efectivo Bs.), or 'efectivo_usd' (Efectivo USD).
- Bank: Identify the bank. Common banks are Banesco, Mercantil, Provincial, Banco de Venezuela (BDV), BNC, Tesoro. If you cannot identify a specific bank, use 'otro'.
- Reference: Extract the reference number. It should be a string of digits.

Analyze the following text and return the structured data.

User's Text: {{{text}}}
`,
});

const inferPaymentDetailsFlow = ai.defineFlow(
  {
    name: 'inferPaymentDetailsFlow',
    inputSchema: InferPaymentDetailsInputSchema,
    outputSchema: InferPaymentDetailsOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) {
      throw new Error('AI failed to infer payment details.');
    }
    // Sanitize reference to ensure it only contains digits
    output.reference = output.reference.replace(/\D/g, '');
    return output;
  }
);
