
import { redirect } from 'next/navigation';

export default function OwnerPaymentsReportRedirectPage() {
  redirect('/owner/payments?tab=report');
}
