
import { redirect } from 'next/navigation';

export default function OwnerPaymentsReportRedirectPage({ params }: { params: { condoId: string } }) {
  redirect(`/${params.condoId}/owner/payments`);
}
