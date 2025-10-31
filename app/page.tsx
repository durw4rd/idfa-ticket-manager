import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await getServerSession(authOptions);

  // Redirect to screenings if authenticated, otherwise redirect to login
  if (session) {
    redirect('/screenings');
  } else {
    redirect('/login');
  }
}
