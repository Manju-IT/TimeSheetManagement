import {
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";

function TimeEntryList({
  entries,
  onDelete,
}) {
  if (!entries.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <h3 className="font-semibold text-slate-800">
          No entries yet today
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          Log your first task to start tracking your
          work.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className={`p-5 ${
            index !== entries.length - 1
              ? "border-b border-slate-200"
              : ""
          }`}
        >
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                  {entry.project}
                </span>

                <span className="text-sm font-semibold text-slate-800">
                  {entry.task}
                </span>
              </div>

              <p className="text-sm leading-6 text-slate-600">
                {entry.description}
              </p>

              {entry.codeLinks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.codeLinks.map(
                    (link, linkIndex) => (
                      <span
                        key={linkIndex}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                      >
                        <ExternalLink size={12} />
                        {link}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="flex items-start gap-5">
              <span className="whitespace-nowrap text-sm font-bold text-slate-900">
                {entry.duration}
              </span>

              <div className="flex gap-1">
                <button className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                  <Pencil size={16} />
                </button>

                <button
                  onClick={() =>
                    onDelete(entry.id)
                  }
                  className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default TimeEntryList;