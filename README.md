# Songbird-X


# Songbird-X

Songbird-X is an advanced self-hosted messaging platform for private teams, communities, and organizations. It is based on the original Songbird project, but extended with a more modern UI, richer messaging workflows, improved media handling, and a stronger foundation for group and channel management.

## What is new in Songbird-X

Songbird-X is not just a rename of Songbird. This version adds and improves several major areas of the project.

### Advanced messaging
- Message reply system with jump-to-message navigation
- Inline message editing
- Message deletion controls
- Desktop double-click reply
- Mobile swipe-to-reply interaction
- Unread message divider
- Better message status handling

### Mentions system
- Smart `@username` detection
- Clickable mentions
- Mention validation and refresh flow
- Active and invalid mention states
- Mention-aware message rendering

### Media and uploads
- Multi-file uploads
- Image and video preview before send
- Voice message recording
- Upload progress indicator
- Temporary file retention support
- Focused media modal
- Video metadata and preview improvements
- Better mobile media handling

### Modern chat UI
- Improved message grouping
- Floating day indicator
- Smooth jump and flash highlight for replies
- RTL/LTR-aware composer and message rendering
- Better mobile gestures
- Cleaner chat layout and interaction flow

### Group and channel management foundation
- Role-aware member model
- Owner / admin / member structure
- Members management modal
- Promote member to admin
- Demote admin to member
- Remove member
- Permission-aware UI behavior

### Realtime-ready architecture
- SSE-based event stream integration
- Better chat refresh behavior
- Media cache handling
- Scroll-state aware chat timeline

## Core features

- Direct messages
- Groups
- Channels
- Realtime messaging
- File sharing
- Voice messages
- Message reply / edit / delete
- User mentions
- Group member management foundation
- Self-hosted deployment
- Docker support
- Nginx reverse proxy support


Requirements
Ubuntu 22.04+ or another Debian-based distribution
Node.js 24+
npm 11+
Nginx
FFmpeg



Deployment notes

Songbird-X is designed to run behind Nginx in production. The installer can be adapted for:

direct IP deployment
domain-based deployment
npm mirror usage
Node.js mirror usage
offline or semi-offline installation bundles
Migration from Songbird

Songbird-X can be deployed as a clean install or migrated from an older Songbird installation. A safe migration path should preserve:

environment variables
database files
uploaded media
systemd service configuration
reverse proxy configuration
Roadmap direction

Songbird-X is being extended toward a more complete self-hosted communication platform. Planned and in-progress directions include:

stronger permissions model
richer admin tooling
improved member management
installer improvements
offline deployment bundles
mirror-friendly installation flow
production hardening



## Project structure

```text
Songbird-X/
├── client/              # Frontend application
├── server/              # Backend API and realtime logic
├── scripts/             # Deployment and helper scripts
├── .env.example         # Environment template
├── Dockerfile
├── docker-compose.yaml
├── package.json
└── README.md




