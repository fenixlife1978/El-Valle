
import { redirect } from 'next/navigation';

// The root page of the application now redirects to the welcome screen,
// which serves as the main entry point.
export default function RootPage() {
  redirect('/welcome');
}
