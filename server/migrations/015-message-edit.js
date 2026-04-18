export const migration = {
  version: 15,
  up({ db, hasColumn }) {
    if (!hasColumn("chat_messages", "edited_at")) {
      db.run(`
        ALTER TABLE chat_messages
        ADD COLUMN edited_at DATETIME
      `);
    }
  },
};