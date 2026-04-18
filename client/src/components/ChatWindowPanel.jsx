import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Close,
  Ghost,
  LoaderCircle,
} from "../icons/lucide.js";

import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";

/* ✅ فقط یک import درست */
import { GroupMembersModal } from "./chat/GroupMembersModal.jsx";

import {
  FocusedMediaModal,
  MessageComposer,
  MessageItem,
  MessageTimeline,
  useFocusedMedia,
  useFloatingDayChip,
} from "./chat/index.js";

export default function ChatWindowPanel(props) {
  const {
    mobileTab,
    activeChatId,
    closeChat,
    activeHeaderPeer,
    activeFallbackTitle,
    peerStatusLabel,
    isGroupChat,
    isChannelChat,
    groupAvatarColor,
    groupAvatarUrl,
    chatScrollRef,
    messages,
    user,
    formatTime,
    unreadMarkerId,
    handleSend,
    userScrolledUp,
    unreadInChat,
    onJumpToLatest,
    isConnected,
    isDark,
    insecureConnection,
    pendingUploadFiles,
    pendingUploadType,
    pendingVoiceMessage,
    uploadError,
    activeUploadProgress,
    onMessageInput,
    onUploadFilesSelected,
    onRemovePendingUpload,
    onClearPendingUploads,
    replyTarget,
    onClearReply,
    onReplyToMessage,
    onDeleteMessage,
    onEditMessage,
    onOpenHeaderProfile,
    onOpenMessageSenderProfile,
    onOpenMention,
    mentionRefreshToken,
    fileUploadEnabled,
    fileUploadInProgress,
    showComposer,
    headerClickable,
    headerAvatarIcon,
    headerAvatarColor,
  } = props;

  /* ✅ فقط یک state */
  const [showMembersModal, setShowMembersModal] = useState(false);

  const [isDesktop] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : false
  );

  const activePeerColor =
    activeHeaderPeer?.color || headerAvatarColor || groupAvatarColor || "#10b981";

  const activePeerInitials = getAvatarInitials(activeFallbackTitle || "S");

  const canOpenHeaderProfile =
    headerClickable && typeof onOpenHeaderProfile === "function";

  const messageFilesProps = {
    isDesktop,
  };

  const renderMessageItem = (msg, options = {}) => (
    <MessageItem
      msg={msg}
      isFirstInGroup={options.isFirstInGroup}
      user={user}
      formatTime={formatTime}
      unreadMarkerId={unreadMarkerId}
      messageFilesProps={messageFilesProps}
      isDesktop={isDesktop}
      onReply={onReplyToMessage}
      onDelete={onDeleteMessage}
      onEdit={onEditMessage}
      isGroupChat={isGroupChat}
      isChannelChat={isChannelChat}
      chatName={activeFallbackTitle}
      chatColor={groupAvatarColor}
      onOpenSenderProfile={onOpenMessageSenderProfile}
      onOpenMention={onOpenMention}
      mentionRefreshToken={mentionRefreshToken}
    />
  );

  return (
    <section className="flex h-full flex-col bg-white dark:bg-slate-900">

      {/* ================= HEADER ================= */}
      {activeChatId && (
        <>
          <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700">

            {/* BACK */}
            <button onClick={closeChat}>
              <ArrowLeft size={20} />
            </button>

            {/* TITLE */}
            <div className="flex flex-col items-center">
              <span className="font-semibold">
                {activeFallbackTitle}
              </span>

              <span className="text-xs text-gray-500">
                {peerStatusLabel}
              </span>
            </div>

            {/* RIGHT SIDE */}
            <div className="flex items-center gap-2">

              {/* ✅ Members button FIXED */}
              {(isGroupChat || isChannelChat) && (
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="text-xs px-3 py-1 rounded-lg border"
                >
                  Members
                </button>
              )}

              {/* AVATAR */}
              {headerAvatarIcon ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={getAvatarStyle(activePeerColor)}
                >
                  {headerAvatarIcon}
                </div>
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={getAvatarStyle(activePeerColor)}
                >
                  {activePeerInitials}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ================= CHAT ================= */}
      <div className="flex-1 overflow-y-auto">
        <MessageTimeline
          messages={messages}
          renderMessageItem={renderMessageItem}
          chatScrollRef={chatScrollRef}
        />
      </div>

      {/* ================= COMPOSER ================= */}
      {showComposer && (
        <MessageComposer
          handleSend={handleSend}
          replyTarget={replyTarget}
          onClearReply={onClearReply}
          pendingUploadFiles={pendingUploadFiles}
          pendingUploadType={pendingUploadType}
          pendingVoiceMessage={pendingVoiceMessage}
          onUploadFilesSelected={onUploadFilesSelected}
          onRemovePendingUpload={onRemovePendingUpload}
          onClearPendingUploads={onClearPendingUploads}
          uploadError={uploadError}
          activeUploadProgress={activeUploadProgress}
          onMessageInput={onMessageInput}
          fileUploadEnabled={fileUploadEnabled}
          uploadBusy={fileUploadInProgress}
        />
      )}

      {/* ================= SCROLL BUTTON ================= */}
      {activeChatId && userScrolledUp && (
        <button
          onClick={onJumpToLatest}
          className="fixed bottom-6 right-6 bg-emerald-500 text-white p-3 rounded-full"
        >
          <ArrowDown size={18} />
        </button>
      )}

      {/* ================= MEDIA MODAL ================= */}
      <FocusedMediaModal />

      {/* ================= ✅ MEMBERS MODAL ================= */}
      {showMembersModal && (
        <GroupMembersModal
          chatId={activeChatId}
          currentUser={user}
          chatTitle={activeFallbackTitle}
          onClose={() => setShowMembersModal(false)}
          onMembersChanged={(data) => {
          console.log("members updated", data);
}}
        />
      )}
    </section>
  );
}