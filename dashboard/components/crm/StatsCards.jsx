"use client";

import { useEffect } from "react";
import { useState } from "react";
import { getStats } from "@/lib/crmApi";

export default function StatsCards({ refreshKey }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getStats()
      .then((data) => !cancelled && setStats(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) {
    return <div className="text-red-500 text-sm">Stats error: {error}</div>;
  }
  if (!stats) {
    return <div className="text-gray-500 text-sm">Loading stats...</div>;
  }

  const cards = [
    { label: "Total leads", value: stats.total },
    { label: "New today", value: stats.today },
    { label: "Qualified", value: stats.byStatus.qualified },
    { label: "Converted", value: stats.byStatus.converted },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white rounded-lg shadow p-4 border-gray-100"
        >
          <div className="text-sm text-gray-500">{c.label}</div>
          <div className="text-3xl font-bold text-gray-900 mt-1">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
