// This file is intentionally left blank. 
// The main content for this route has been moved to /owner/payments/report/page.tsx.
// You can add a history or overview page here in the future if needed.

import { redirect } from 'next/navigation';

/**
 * Redirects from `/owner/payments` to `/owner/dashboard`
 * as there is no index page for the payments section for owners.
 * The main actions are in sub-routes.
 */
export default function OwnerPaymentsRootPage() {
  redirect('/owner/dashboard');
}
