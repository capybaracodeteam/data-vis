export default function Loading() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto animate-pulse">
        <div className="mb-8">
          <div className="h-7 w-52 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-44 rounded bg-gray-200" />
        </div>
        <div className="flex flex-col gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-1 h-5 w-36 rounded bg-gray-200" />
              <div className="mb-8 h-4 w-44 rounded bg-gray-200" />
              <div className="h-64 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
