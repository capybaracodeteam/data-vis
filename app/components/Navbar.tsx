import Link from "next/link";
import SearchBar from "@/app/components/SearchBar";

export default function Navbar() {
  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/todo"
            className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            TODO
          </Link>
        </div>
        <SearchBar />
      </div>
    </nav>
  );
}
