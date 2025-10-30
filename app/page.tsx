import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Manage Your IDFA Tickets</h1>
        <p className="text-xl text-idfa-gray-600 max-w-2xl mx-auto">
          Upload your ticket PDFs and easily access all your screenings and QR codes in one place.
        </p>
      </div>

      <div className="flex justify-center gap-4 mb-12">
        <Link
          href="/screenings"
          className="px-6 py-3 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors"
        >
          View Screenings
        </Link>
        <Link
          href="/upload"
          className="px-6 py-3 border border-idfa-black text-idfa-black font-medium rounded hover:bg-idfa-gray-50 transition-colors"
        >
          Upload Tickets
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mt-16">
        <div className="text-center">
          <div className="text-4xl mb-4">📄</div>
          <h2 className="text-xl font-semibold mb-2">Upload PDFs</h2>
          <p className="text-idfa-gray-600">
            Upload single or multi-page PDF tickets. The app automatically extracts all relevant information.
          </p>
        </div>
        <div className="text-center">
          <div className="text-4xl mb-4">🎬</div>
          <h2 className="text-xl font-semibold mb-2">Organize Screenings</h2>
          <p className="text-idfa-gray-600">
            View all your screenings in an organized list, grouped by film and screening time.
          </p>
        </div>
        <div className="text-center">
          <div className="text-4xl mb-4">📱</div>
          <h2 className="text-xl font-semibold mb-2">Quick Access</h2>
          <p className="text-idfa-gray-600">
            Access QR codes instantly for easy entry at the festival venues.
          </p>
        </div>
      </div>
    </div>
  );
}

