function registerMemberRoutes(app, deps) {
  const {
    debugLog,
    emitChatEvent,
    requireSession,
    findChatById,
    findUserById,
    isMember,
    listChatMembers,
    getChatMemberRole,
    setChatMemberRole,
    removeChatMember,
    markGroupMemberRemoved,
    clearGroupMemberRemoved,
  } = deps;

  const normalizeRole = (value) => String(value || "").trim().toLowerCase();

  const isManageableChatType = (chat) => {
    const type = String(chat?.type || "").toLowerCase();
    return type === "group" || type === "channel";
  };

  const canViewMembers = (actorRole) => {
    const role = normalizeRole(actorRole);
    return role === "owner" || role === "admin" || role === "member";
  };

  const canChangeRole = ({ actorRole, targetRole, nextRole, actorUserId, targetUserId }) => {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);
    const next = normalizeRole(nextRole);

    if (!["admin", "member"].includes(next)) return false;
    if (!actorUserId || !targetUserId) return false;
    if (actorUserId === targetUserId) return false;

    if (actor === "owner") {
      if (target === "owner") return false;
      return true;
    }

    if (actor === "admin") {
      if (target !== "member") return false;
      if (next !== "member" && next !== "admin") return false;
      return true;
    }

    return false;
  };

  const canRemoveMember = ({ actorRole, targetRole, actorUserId, targetUserId }) => {
    const actor = normalizeRole(actorRole);
    const target = normalizeRole(targetRole);

    if (!actorUserId || !targetUserId) return false;
    if (actorUserId === targetUserId) return false;

    if (actor === "owner") {
      if (target === "owner") return false;
      return true;
    }

    if (actor === "admin") {
      return target === "member";
    }

    return false;
  };

  app.get("/api/chats/:chatId/members", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params.chatId || 0);
    if (!chatId) {
      return res.status(400).json({ error: "Valid chat id is required." });
    }

    const actor = findUserById(Number(session.id || 0));
    if (!actor) {
      return res.status(404).json({ error: "Authenticated user not found." });
    }

    const chat = findChatById(chatId);
    if (!chat || !isManageableChatType(chat)) {
      return res.status(404).json({ error: "Group or channel not found." });
    }

    if (!isMember(chatId, actor.id)) {
      return res.status(403).json({ error: "You are not a member of this chat." });
    }

    const actorRole = getChatMemberRole(chatId, actor.id);
    if (!canViewMembers(actorRole)) {
      return res.status(403).json({ error: "You do not have permission to view members." });
    }

    const members = listChatMembers(chatId).map((member) => ({
      id: Number(member.id),
      username: member.username || "",
      nickname: member.nickname || "",
      avatar_url: member.avatar_url || null,
      color: member.color || null,
      status: member.status || "offline",
      role: normalizeRole(member.role || "member"),
    }));

    debugLog?.("api:members:list", {
      chatId,
      actorUserId: Number(actor.id),
      actorRole: normalizeRole(actorRole),
      count: members.length,
    });

    return res.json({
      ok: true,
      chat: {
        id: Number(chat.id),
        type: String(chat.type || ""),
        name: chat.name || "",
      },
      members,
    });
  });

  app.post("/api/chats/:chatId/members/:userId/role", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params.chatId || 0);
    const targetUserId = Number(req.params.userId || 0);
    const nextRole = normalizeRole(req.body?.role);

    if (!chatId || !targetUserId || !nextRole) {
      return res.status(400).json({ error: "Chat id, user id, and role are required." });
    }

    if (!["admin", "member"].includes(nextRole)) {
      return res.status(400).json({ error: "Role must be either admin or member." });
    }

    const actor = findUserById(Number(session.id || 0));
    if (!actor) {
      return res.status(404).json({ error: "Authenticated user not found." });
    }

    const chat = findChatById(chatId);
    if (!chat || !isManageableChatType(chat)) {
      return res.status(404).json({ error: "Group or channel not found." });
    }

    if (!isMember(chatId, actor.id)) {
      return res.status(403).json({ error: "You are not a member of this chat." });
    }

    if (!isMember(chatId, targetUserId)) {
      return res.status(404).json({ error: "Target member not found in this chat." });
    }

    const targetUser = findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found." });
    }

    const actorRole = getChatMemberRole(chatId, actor.id);
    const targetRole = getChatMemberRole(chatId, targetUserId);

    if (
      !canChangeRole({
        actorRole,
        targetRole,
        nextRole,
        actorUserId: Number(actor.id),
        targetUserId,
      })
    ) {
      return res.status(403).json({ error: "You do not have permission to change this role." });
    }

    if (normalizeRole(targetRole) === nextRole) {
      return res.json({
        ok: true,
        member: {
          id: Number(targetUser.id),
          username: targetUser.username || "",
          nickname: targetUser.nickname || "",
          role: nextRole,
        },
      });
    }

    setChatMemberRole(chatId, targetUserId, nextRole);

    emitChatEvent?.(chatId, {
      type: "chat_member_role_updated",
      chatId,
      userId: Number(targetUser.id),
      username: targetUser.username || "",
      nickname: targetUser.nickname || "",
      role: nextRole,
      updatedByUserId: Number(actor.id),
      updatedByUsername: actor.username || "",
    });

    debugLog?.("api:members:role", {
      chatId,
      actorUserId: Number(actor.id),
      actorRole: normalizeRole(actorRole),
      targetUserId: Number(targetUser.id),
      targetRoleBefore: normalizeRole(targetRole),
      targetRoleAfter: nextRole,
    });

    return res.json({
      ok: true,
      member: {
        id: Number(targetUser.id),
        username: targetUser.username || "",
        nickname: targetUser.nickname || "",
        role: nextRole,
      },
    });
  });

  app.post("/api/chats/:chatId/members/:userId/remove", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params.chatId || 0);
    const targetUserId = Number(req.params.userId || 0);

    if (!chatId || !targetUserId) {
      return res.status(400).json({ error: "Chat id and user id are required." });
    }

    const actor = findUserById(Number(session.id || 0));
    if (!actor) {
      return res.status(404).json({ error: "Authenticated user not found." });
    }

    const chat = findChatById(chatId);
    if (!chat || !isManageableChatType(chat)) {
      return res.status(404).json({ error: "Group or channel not found." });
    }

    if (!isMember(chatId, actor.id)) {
      return res.status(403).json({ error: "You are not a member of this chat." });
    }

    if (!isMember(chatId, targetUserId)) {
      return res.status(404).json({ error: "Target member not found in this chat." });
    }

    const targetUser = findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found." });
    }

    const actorRole = getChatMemberRole(chatId, actor.id);
    const targetRole = getChatMemberRole(chatId, targetUserId);

    if (
      !canRemoveMember({
        actorRole,
        targetRole,
        actorUserId: Number(actor.id),
        targetUserId,
      })
    ) {
      return res.status(403).json({ error: "You do not have permission to remove this member." });
    }

    removeChatMember(chatId, targetUserId);
    markGroupMemberRemoved?.(chatId, targetUserId, Number(actor.id));

    emitChatEvent?.(chatId, {
      type: "chat_member_removed",
      chatId,
      userId: Number(targetUser.id),
      username: targetUser.username || "",
      nickname: targetUser.nickname || "",
      removedByUserId: Number(actor.id),
      removedByUsername: actor.username || "",
    });

    debugLog?.("api:members:remove", {
      chatId,
      actorUserId: Number(actor.id),
      actorRole: normalizeRole(actorRole),
      targetUserId: Number(targetUser.id),
      targetRole: normalizeRole(targetRole),
    });

    return res.json({
      ok: true,
      removedUserId: Number(targetUser.id),
    });
  });

  app.post("/api/chats/:chatId/members/:userId/rejoin-clear", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params.chatId || 0);
    const targetUserId = Number(req.params.userId || 0);

    if (!chatId || !targetUserId) {
      return res.status(400).json({ error: "Chat id and user id are required." });
    }

    const actor = findUserById(Number(session.id || 0));
    if (!actor) {
      return res.status(404).json({ error: "Authenticated user not found." });
    }

    const actorRole = getChatMemberRole(chatId, actor.id);
    if (normalizeRole(actorRole) !== "owner") {
      return res.status(403).json({ error: "Only owner can clear removed-member state." });
    }

    clearGroupMemberRemoved?.(chatId, targetUserId);

    return res.json({ ok: true });
  });
}

export { registerMemberRoutes };