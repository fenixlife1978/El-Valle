'use server';
/**
 * @fileOverview A community updates AI agent.
 *
 * - getCommunityUpdates - A function that handles the community updates process.
 * - GetCommunityUpdatesInput - The input type for the getCommunityUpdates function.
 * - GetCommunityUpdatesOutput - The return type for the getCommunityUpdates function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GetCommunityUpdatesInputSchema = z.object({
  userProfile: z
    .string()
    .describe('The user profile, including role, unit number, and name.'),
  paymentHistory: z
    .string()
    .describe('The user payment history, including dates, amounts, and status.'),
  allUpdates: z.string().describe('A list of all community updates.'),
});
export type GetCommunityUpdatesInput = z.infer<typeof GetCommunityUpdatesInputSchema>;

const GetCommunityUpdatesOutputSchema = z.object({
  updates: z
    .array(z.string())
    .length(3)
    .describe('The top 3 most relevant community updates for the user.'),
});
export type GetCommunityUpdatesOutput = z.infer<typeof GetCommunityUpdatesOutputSchema>;

export async function getCommunityUpdates(
  input: GetCommunityUpdatesInput
): Promise<GetCommunityUpdatesOutput> {
  return getCommunityUpdatesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'getCommunityUpdatesPrompt',
  input: {schema: GetCommunityUpdatesInputSchema},
  output: {schema: GetCommunityUpdatesOutputSchema},
  prompt: `You are an AI that provides community updates to users.

You will receive a user profile, their payment history, and a list of all community updates.

Based on this information, you will determine the top 3 most relevant community updates for the user.

User Profile: {{{userProfile}}}
Payment History: {{{paymentHistory}}}
All Updates: {{{allUpdates}}}

Top 3 Updates:`,
});

const getCommunityUpdatesFlow = ai.defineFlow(
  {
    name: 'getCommunityUpdatesFlow',
    inputSchema: GetCommunityUpdatesInputSchema,
    outputSchema: GetCommunityUpdatesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
