import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Close,
  LoaderCircle,
  Search,
  ShieldCheck,
  Trash,
  User,
} from "../../icons/lucide.js";
import { getAvatarStyle } from "../../utils/avatarColor.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import {
  getChatMembers,
  removeChatMemberRequest,
  updateChatMemberRole,
} from "../../api/chatApi.js";

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function roleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === "owner") return "Owner";
  if (normalized === "admin") return "Admin";
  return "Member";
}

function roleBadgeClass(role) {
  const normalized = normalizeRole(role);
  if (normalized === "owner") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300";
  }
  if (normalized === "admin") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300";
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
}

function roleIcon(role) {
  const normalized = normalizeRole(role);
  if (normalized === "owner") {
    return <span className="text-[11px] leading-none">👑</span>;
  }
  if (normalized === "admin") return <ShieldCheck size={12} />;
  return <User size={12} />;
}

function canManageTarget(currentUserId, currentUserRole, targetUserId, targetRole) {
  const actorRole = normalizeRole(currentUserRole);
  const memberRole = normalizeRole(targetRole);

  if (!currentUserId || !targetUserId) return false;
  if (Number(currentUserId) === Number(targetUserId)) return false;

  if (actorRole === "owner") {
    return memberRole !== "owner";
  }

  if (actorRole === "admin") {
    return memberRole === "member";
  }

  return false;
}

function canPromote(currentUserId, currentUserRole, targetUserId, targetRole) {
  return (
    canManageTarget(currentUserId, currentUserRole, targetUserId, targetRole) &&
    normalizeRole(targetRole) === "member"
  );
}

function canDemote(currentUserId, currentUserRole, targetUserId, targetRole) {
  return (
    canManageTarget(currentUserId, currentUserRole, targetUserId, targetRole) &&
    normalizeRole(targetRole) === "admin"
  );
}

function canRemove(currentUserId, currentUserRole, targetUserId, targetRole) {
  return canManageTarget(currentUserId, currentUserRole, targetUserId, targetRole);
}

export function GroupMembersModal({
  chatId,
  currentUser,
  chatTitle = "Members",
  onClose,
  onMembersChanged,
}) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [actionUserId, setActionUserId] = useState(null);

  const currentUserId = Number(currentUser?.id || 0);

  const currentMember = useMemo(() => {
    return members.find((member) => Number(member.id) === currentUserId) || null;
  }, [members, currentUserId]);

  const currentUserRole = normalizeRole(currentMember?.role || "member");

  const loadMembers = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    setError("");

    try {
      const res = await getChatMembers(chatId);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to load members.");
      }

      setMembers(Array.isArray(data?.members) ? data.members : []);
    } catch (err) {
      setError(String(err?.message || "Unable to load members."));
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredMembers = useMemo(() => {
    const safeQuery = String(query || "").trim().toLowerCase();

    const items = [...members].sort((a, b) => {
      const rank = { owner: 0, admin: 1, member: 2 };
      const aRank = rank[normalizeRole(a.role)] ?? 9;
      const bRank = rank[normalizeRole(b.role)] ?? 9;
      if (aRank !== bRank) return aRank - bRank;
      return String(a.username || "").localeCompare(String(b.username || ""));
    });

    if (!safeQuery) return items;

    return items.filter((member) => {
      const username = String(member.username || "").toLowerCase();
      const nickname = String(member.nickname || "").toLowerCase();
      return username.includes(safeQuery) || nickname.includes(safeQuery);
    });
  }, [members, query]);

  const runRoleUpdate = async (member, nextRole) => {
    const targetUserId = Number(member?.id || 0);
    if (!chatId || !targetUserId) return;

    try {
      setActionUserId(targetUserId);
      setError("");

      const res = await updateChatMemberRole({
        chatId,
        userId: targetUserId,
        role: nextRole,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update role.");
      }

      setMembers((prev) =>
        prev.map((item) =>
          Number(item.id) === targetUserId ? { ...item, role: nextRole } : item,
        ),
      );

      onMembersChanged?.({
        type: "role_updated",
        userId: targetUserId,
        role: nextRole,
      });
    } catch (err) {
      setError(String(err?.message || "Unable to update role."));
    } finally {
      setActionUserId(null);
    }
  };

  const runRemoveMember = async (member) => {
    const targetUserId = Number(member?.id || 0);
    if (!chatId || !targetUserId) return;

    const confirmed = window.confirm(
      `Remove ${member?.nickname || member?.username || "this member"} from this chat?`,
    );
    if (!confirmed) return;

    try {
      setActionUserId(targetUserId);
      setError("");

      const res = await removeChatMemberRequest({
        chatId,
        userId: targetUserId,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to remove member.");
      }

      setMembers((prev) =>
        prev.filter((item) => Number(item.id) !== targetUserId),
      );

      onMembersChanged?.({
        type: "member_removed",
        userId: targetUserId,
      });
    } catch (err) {
      setError(String(err?.message || "Unable to remove member."));
    } finally {
      setActionUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-800 dark:text-white">
              {chatTitle}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            aria-label="Close members modal"
          >
            <Close size={18} />
          </button>
        </div>

        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <Search size={16} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search members..."
              className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
            />
          </div>

          {error ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
              Loading members...
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-slate-400">
              No members found.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                const memberId = Number(member.id);
                const memberRole = normalizeRole(member.role);
                const busy = Number(actionUserId) === memberId;

                return (
                  <div
                    key={memberId}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3 dark:border-white/10"
                  >
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.nickname || member.username || "User"}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
                        style={getAvatarStyle(member.color || "#10b981")}
                      >
                        {getAvatarInitials(member.nickname || member.username || "U")}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800 dark:text-white">
                        {member.nickname || member.username || "Unknown"}
                        {memberId === currentUserId ? (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            (You)
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        @{member.username || "unknown"}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${roleBadgeClass(memberRole)}`}
                    >
                      {roleIcon(memberRole)}
                      {roleLabel(memberRole)}
                    </span>

                    <div className="flex items-center gap-2">
                      {canPromote(currentUserId, currentUserRole, memberId, memberRole) ? (
                        <button
                          type="button"
                          onClick={() => runRoleUpdate(member, "admin")}
                          disabled={busy}
                          className="rounded-xl border border-sky-200 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-50 disabled:opacity-60 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-500/10"
                        >
                          {busy ? "..." : "Promote"}
                        </button>
                      ) : null}

                      {canDemote(currentUserId, currentUserRole, memberId, memberRole) ? (
                        <button
                          type="button"
                          onClick={() => runRoleUpdate(member, "member")}
                          disabled={busy}
                          className="rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                        >
                          {busy ? "..." : "Demote"}
                        </button>
                      ) : null}

                      {canRemove(currentUserId, currentUserRole, memberId, memberRole) ? (
                        <button
                          type="button"
                          onClick={() => runRemoveMember(member)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <Trash size={12} />
                          {busy ? "..." : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}