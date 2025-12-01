import { redirect } from 'next/navigation';

/**
 * The root page of the application.
 *
 * This component's sole purpose is to redirect the user to the `/welcome`
 * page, which serves as the main entry point for role selection or login.
 * All subsequent authentication and routing logic is handled by the `AuthGuard`
 * in the root layout.
 */
export default function RootPage() {
  redirect('/welcome');
}
