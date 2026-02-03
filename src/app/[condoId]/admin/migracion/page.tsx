'use client';

import { redirect } from 'next/navigation';

export default function MigrationPage({ params }: { params: { condoId: string } }) {
  redirect(`/${params.condoId}/admin/dashboard`);
  return null;
}
