"use client";

import LeadDetail from "@/components/crm/LeadDetail";
import LeadsTable from "@/components/crm/LeadsTable";
import StatsCards from "@/components/crm/StatsCards";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { listLeads } from "@/lib/crmApi";
import { useCallback, useEffect, useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export default function CrmPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("mine");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const currentUser = useCurrentUser();

  const fetchLeads = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      let assignedTo;
      if (filter === "mine") assignedTo = "me";
      else if (filter === "unassigned") assignedTo = "unassigned";

      const data = await listLeads({ search, status, assignedTo });
      setLeads(data.leads || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, filter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => setRefreshKey((key) => key + 1), 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Leads
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          WhatsApp lead capture and conversation handoff.
        </p>
      </div>

      {currentUser?.role === "admin" && <StatsCards refreshKey={refreshKey} />}

      <div className="mt-6 flex flex-col gap-3 md:flex-row">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, phone, or email"
          aria-label="Search leads"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="Filter by assignment"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm"
        >
          <option value="mine">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {currentUser?.role === "admin" && (
            <option value="all">All leads</option>
          )}
        </select>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="rounded-lg bg-white py-12 text-center text-sm text-slate-500 shadow">
            Loading leads...
          </div>
        ) : (
          <LeadsTable
            leads={leads}
            onSelect={(lead) => setSelectedId(lead.id)}
            currentUser={currentUser}
          />
        )}
      </div>

      <LeadDetail
        leadId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => setRefreshKey((key) => key + 1)}
        currentUser={currentUser}
      />
    </main>
  );
}
