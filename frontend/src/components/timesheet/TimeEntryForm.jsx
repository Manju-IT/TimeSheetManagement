import { useState } from "react";

import {
  Link2,
  Plus,
  X,
} from "lucide-react";

function TimeEntryForm({
  onClose,
  onSave,
}) {
  const projects = [
    {
      id: 1,
      name: "Apollo",
      source: "GitHub",
    },
    {
      id: 2,
      name: "Timesheet App",
      source: "GitHub",
    },
    {
      id: 3,
      name: "Internal",
      source: "Manual",
    },
  ];

  const tasks = [
    {
      id: 1,
      projectId: 1,
      title: "#142 Fix auth redirect",
    },
    {
      id: 2,
      projectId: 1,
      title: "#150 Review PR",
    },
    {
      id: 3,
      projectId: 2,
      title: "#25 Build Today page",
    },
  ];

  const [projectId, setProjectId] =
    useState("");

  const [taskId, setTaskId] =
    useState("");

  const [manualTask, setManualTask] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [duration, setDuration] =
    useState(60);

  const [billable, setBillable] =
    useState(true);

  const [updateGithub, setUpdateGithub] =
    useState(true);

  const [codeLinks, setCodeLinks] =
    useState([""]);

  const filteredTasks = tasks.filter(
    (task) =>
      task.projectId === Number(projectId)
  );

  function changeProject(event) {
    setProjectId(event.target.value);
    setTaskId("");
  }

  function changeLink(index, value) {
    setCodeLinks((current) =>
      current.map((link, currentIndex) =>
        currentIndex === index
          ? value
          : link
      )
    );
  }

  function addLink() {
    setCodeLinks((current) => [
      ...current,
      "",
    ]);
  }

  function removeLink(index) {
    setCodeLinks((current) =>
      current.filter(
        (_, currentIndex) =>
          currentIndex !== index
      )
    );
  }

  function handleSubmit(event) {
    event.preventDefault();

    const data = {
      projectId,
      taskId:
        taskId === "manual"
          ? null
          : taskId,
      manualTask:
        taskId === "manual"
          ? manualTask
          : null,
      description,
      durationMinutes: duration,
      billable,
      updateGithub,
      codeLinks:
        codeLinks.filter(Boolean),
    };

    console.log(data);

    onSave?.(data);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40">
      <div className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Add Time Entry
            </h2>

            <p className="text-sm text-slate-500">
              Log the work you completed.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 p-6"
        >
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Project *
            </label>

            <select
              required
              value={projectId}
              onChange={changeProject}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">
                Select project
              </option>

              {projects.map((project) => (
                <option
                  key={project.id}
                  value={project.id}
                >
                  {project.name} · {project.source}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Task
            </label>

            <select
              value={taskId}
              disabled={!projectId}
              onChange={(event) =>
                setTaskId(event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"
            >
              <option value="">
                Select task
              </option>

              {filteredTasks.map((task) => (
                <option
                  key={task.id}
                  value={task.id}
                >
                  {task.title}
                </option>
              ))}

              <option value="manual">
                Task not listed — enter manually
              </option>
            </select>
          </div>

          {taskId === "manual" && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Task title *
              </label>

              <input
                required
                value={manualTask}
                onChange={(event) =>
                  setManualTask(
                    event.target.value
                  )
                }
                placeholder="Enter task title"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          )}

          <div>
            <div className="mb-2 flex justify-between">
              <label className="text-sm font-semibold text-slate-700">
                Description *
              </label>

              <span className="text-xs text-slate-400">
                {description.length}/500
              </span>
            </div>

            <textarea
              required
              rows={5}
              maxLength={500}
              value={description}
              onChange={(event) =>
                setDescription(
                  event.target.value
                )
              }
              placeholder="Describe what you worked on..."
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Code links
            </label>

            <div className="space-y-2">
              {codeLinks.map(
                (link, index) => (
                  <div
                    key={index}
                    className="flex gap-2"
                  >
                    <div className="relative flex-1">
                      <Link2
                        size={16}
                        className="absolute left-3 top-3 text-slate-400"
                      />

                      <input
                        type="url"
                        value={link}
                        onChange={(event) =>
                          changeLink(
                            index,
                            event.target.value
                          )
                        }
                        placeholder="https://github.com/..."
                        className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    {codeLinks.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          removeLink(index)
                        }
                        className="rounded-lg border border-slate-200 px-3 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )
              )}
            </div>

            <button
              type="button"
              onClick={addLink}
              className="mt-3 flex items-center gap-1 text-sm font-semibold text-indigo-600"
            >
              <Plus size={15} />
              Add another link
            </button>
          </div>

          <div>
            <label className="mb-3 block text-sm font-semibold text-slate-700">
              Duration
            </label>

            <div className="flex flex-wrap gap-2">
              {[15, 30, 60, 120].map(
                (minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() =>
                      setDuration(minutes)
                    }
                    className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                      duration === minutes
                        ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {minutes < 60
                      ? `${minutes}m`
                      : `${minutes / 60}h`}
                  </button>
                )
              )}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                Billable
              </p>

              <p className="text-xs text-slate-500">
                Count this time as billable work.
              </p>
            </div>

            <input
              type="checkbox"
              checked={billable}
              onChange={(event) =>
                setBillable(
                  event.target.checked
                )
              }
              className="h-4 w-4 accent-indigo-600"
            />
          </label>

          {taskId &&
            taskId !== "manual" && (
              <label className="flex items-start gap-3 rounded-lg bg-indigo-50 p-4">
                <input
                  type="checkbox"
                  checked={updateGithub}
                  onChange={(event) =>
                    setUpdateGithub(
                      event.target.checked
                    )
                  }
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />

                <div>
                  <p className="text-sm font-semibold text-indigo-900">
                    Also update task description
                    in GitHub
                  </p>

                  <p className="mt-1 text-xs text-indigo-700">
                    Last synced 5 minutes ago
                  </p>
                </div>
              </label>
            )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Save Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TimeEntryForm;