"use client";

// client/src/components/LeadDetail.js
import { useEffect, useState } from "react";
import { api, claimLead, getLead, reassignLead, updateLead } from "@/lib/crmApi";

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"];

export default function LeadDetail({
  leadId,
  onClose,
  onUpdated,
  currentUser,
}) {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);

  // Timer effect - runs while loading is true
  useEffect(() => {
    let intervalId = null;

    if (loading) {
      setLoadingTime(0);
      intervalId = setInterval(() => {
        setLoadingTime((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loading]);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
    setLead(null);
    setLoading(true);
    setError(null);

    const startedAt = Date.now();
    console.log(
      `[${new Date().toLocaleTimeString()}] Fetching lead with ID:`,
      leadId,
    );

    getLead(leadId)
      .then((data) => {
        console.log(
          `[${new Date().toLocaleTimeString()}] Lead data received:`,
          data,
        );
        if (!cancelled) {
          // ✅ Extract lead from the response
          const leadData = data.lead || data;
          setLead({
            ...leadData,
            messages: leadData.messages || [],
          });
        }
      })
      .catch((err) => {
        console.error(
          `[${new Date().toLocaleTimeString()}] Error fetching lead:`,
          err,
        );
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          console.log(
            `[${new Date().toLocaleTimeString()}] Loading finished after ${(
              (Date.now() - startedAt) /
              1000
            ).toFixed(1)} seconds`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  // Load users for admin reassign dropdown
  useEffect(() => {
    if (currentUser?.role === "admin") {
      api("/users")
        .then((data) => setUsers(data.users || []))
        .catch(console.error);
    }
  }, [currentUser]);

  // Close on Escape key
  useEffect(() => {
    if (!leadId) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leadId, onClose]);

  // Change status
  async function changeStatus(newStatus) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateLead(leadId, { status: newStatus });
      setLead((prev) => ({
        ...prev,
        ...updated,
        messages: updated.messages || prev?.messages || [],
      }));
      onUpdated?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  // Claim lead (for agents)
  async function handleClaim() {
    setSaving(true);
    setError(null);
    try {
      const updated = await claimLead(leadId);
      setLead((prev) => ({
        ...prev,
        ...updated,
        messages: updated.messages || prev?.messages || [],
      }));
      onUpdated?.();
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReassign(newOwnerId) {
    setSaving(true);
    setError(null);
    try {
      const ownerId = newOwnerId === "" ? null : newOwnerId;
      const updated = await reassignLead(leadId, ownerId);

      // Find the name of the assigned user from your 'users' state
      const assignedUser = users.find((u) => u.id === ownerId);

      setLead((prev) => ({
        ...prev,
        ...updated,
        assigned_to: ownerId,
        assigned_to_name: assignedUser ? assignedUser.name : "Unassigned",
      }));

      onUpdated?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!leadId) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-full max-w-lg bg-white shadow-xl p-6 overflow-y-auto">
        <div className="flex items-start justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {loading ? (
              <span className="text-gray-400 animate-pulse">
                Loading... ({loadingTime}s)
              </span>
            ) : (
              lead?.name || "No name"
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-8 space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded w-full animate-pulse"></div>
            <div className="text-xs text-gray-400 mt-2">
              Loading data... ({loadingTime}s elapsed)
            </div>
          </div>
        ) : (
          lead && (
            <>
              <div className="mt-4 space-y-1 text-sm">
                <div>
                  <span className="text-gray-500">Phone:</span>{" "}
                  {lead.wa_phone || "-"}
                </div>
                <div>
                  <span className="text-gray-500">Email:</span>{" "}
                  {lead.email || "-"}
                </div>
                <div>
                  <span className="text-gray-500">Inquiry:</span>{" "}
                  {lead.inquiry_type || "-"}
                </div>
                <div>
                  <span className="text-gray-500">Created:</span>{" "}
                  {lead.created_at
                    ? new Date(lead.created_at).toLocaleString()
                    : "-"}
                </div>
                <div>
                  <span className="text-gray-500">Assigned to:</span>{" "}
                  {lead.assigned_to_name ? (
                    lead.assigned_to_name
                  ) : (
                    <span className="text-gray-400 italic">Unassigned</span>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm text-gray-500 mb-1">Status</div>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      disabled={saving || lead.status === s}
                      onClick={() => changeStatus(s)}
                      className={
                        "px-3 py-1 rounded-full text-xs font-medium border transition-colors " +
                        (lead.status === s
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50")
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Claim Button - only show if unassigned */}
              {!lead.assigned_to && currentUser?.role !== "admin" && (
                <div className="mt-4">
                  <button
                    onClick={handleClaim}
                    disabled={saving}
                    className="inline-block bg-black text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Claiming..." : "Claim lead"}
                  </button>
                </div>
              )}

              {/* Admin Reassign Dropdown */}
              {currentUser?.role === "admin" && (
                <div className="mt-4">
                  <div className="text-sm text-gray-500 mb-1">Reassign to</div>
                  <select
                    value={lead.assigned_to || ""}
                    onChange={(e) => handleReassign(e.target.value || null)}
                    disabled={saving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* WhatsApp Link */}
              <div className="mt-6">
                {lead.wa_phone ? (
                  <a
                    href={`https://wa.me/${lead.wa_phone.replace(/^\+/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    Reply via WhatsApp
                  </a>
                ) : (
                  <span className="inline-block bg-gray-400 text-white text-sm px-4 py-2 rounded-lg cursor-not-allowed">
                    No phone number
                  </span>
                )}
              </div>

              {/* Conversation History */}
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Conversation
                </h3>
                <div className="space-y-2">
                  {lead.messages && lead.messages.length > 0 ? (
                    lead.messages.map((m) => (
                      <div
                        key={m.id}
                        className={
                          "rounded-lg px-3 py-2 text-sm max-w-[85%] " +
                          (m.direction === "inbound"
                            ? "bg-gray-100 text-gray-900"
                            : "bg-blue-600 text-white ml-auto")
                        }
                      >
                        <div>{m.body}</div>
                        <div
                          className={
                            "text-[10px] mt-1 " +
                            (m.direction === "inbound"
                              ? "text-gray-500"
                              : "text-blue-100")
                          }
                        >
                          {m.created_at
                            ? new Date(m.created_at).toLocaleString()
                            : ""}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 text-sm">No messages yet</div>
                  )}
                </div>
              </div>
            </>
          )
        )}
      </aside>
    </div>
  );
}
