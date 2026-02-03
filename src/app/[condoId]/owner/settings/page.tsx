'use client';

import { redirect } from 'next/navigation';

export default function OwnerSettingsRedirectPage({ params }: { params: { condoId: string } }) {
  redirect(`/${params.condoId}/owner/dashboard`);
  return null;
}
