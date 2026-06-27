export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="h-7 w-52 rounded bg-gray-200 animate-pulse" />
          <div className="mt-2 h-4 w-56 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="h-10 border-b bg-gray-50" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 border-b px-4 py-4">
              <div className="h-3.5 w-20 rounded bg-gray-100 animate-pulse" />
              <div className="h-3.5 w-36 rounded bg-gray-100 animate-pulse" />
              <div className="h-3.5 w-28 rounded bg-gray-100 animate-pulse" />
              <div className="h-3.5 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="h-5 w-10 rounded bg-gray-100 animate-pulse" />
              <div className="ml-auto h-3.5 w-16 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
