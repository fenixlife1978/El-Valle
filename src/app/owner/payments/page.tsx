import { redirect } from 'next/navigation';

/**
 * Redirects from `/owner/payments` to `/owner/payments/report`
 * as this is the primary action for the owner.
 */
export default function OwnerPaymentsRootPage() {
  redirect('/owner/payments/report');
}
