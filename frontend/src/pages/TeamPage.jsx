import { useEffect, useState } from "react";

import Header from "../components/common/Header";
import EmptyState from "../components/common/EmptyState";
import { teamService } from "../services/teamService";

function TeamPage() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    teamService.getManaged().then((result) => {
      setTeams(result);
      if (result[0]) setSelectedTeam(result[0].id);
    }).catch((requestError) => setError(requestError.message));
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    teamService.getMembers(selectedTeam).then(setMembers).catch((requestError) => setError(requestError.message));
  }, [selectedTeam]);

  return (
    <div className="mx-auto max-w-7xl p-5 md:p-8">
      <Header
        title="Team Attendance"
        subtitle="Monitor today's team activity"
      >
        <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Select a managed team</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </Header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!selectedTeam ? <EmptyState title="No managed team selected" description="Choose a team to load its members." /> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1000px] w-full">
          <thead className="bg-slate-50">
            <tr>
              {["Member", "Email", "Role", "Joined"].map((heading) => (
                <th
                  key={heading}
                  className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                      {member.full_name?.charAt(0) || "U"}
                    </div>

                    <span className="font-semibold text-slate-800">
                      {member.full_name}
                    </span>
                  </div>
                </td>

                <td className="px-5 py-4">
                  <span className="text-sm text-slate-600">{member.email}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="text-sm text-slate-600">{member.is_manager ? "Manager" : "Member"}</span>
                </td>
                <td className="px-5 py-4 text-sm text-slate-500">{new Date(member.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      }
    </div>
  );
}

export default TeamPage;