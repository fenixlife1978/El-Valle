
import { redirect } from 'next/navigation';

/**
 * Redirects from `/admin/payments` to `/admin/payments/verify`
 * as there is no index page for the payments section.
 */
export default function AdminPaymentsRootPage() {
  redirect('/admin/payments/verify');
}
