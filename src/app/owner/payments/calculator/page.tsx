
import { redirect } from 'next/navigation';

export default function OwnerPaymentsCalculatorRedirectPage() {
  redirect('/owner/payments?tab=calculator');
}
