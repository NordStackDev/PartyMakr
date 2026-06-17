import { Loader } from "@/components/loader";

export default function AdminLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader label="Indlæser…" />
    </div>
  );
}
