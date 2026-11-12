<!-- TODO AUTHORSHIP: owner must confirm. LICENSE says "Harsh Patil", other files say "darkphoenix2208". These must be reconciled by the repository owner before publication. -->

# Credits

## Author

**darkphoenix2208**  
Email: darkphoenix.2208@gmail.com

## Project

**Rein** - A deterministic mandate gate for AI agents processing PayPal refunds

Built for the **Build What's Next with PayPal and AI** hackathon 2026

## Technologies Used

### PayPal & Payments
- **PayPal REST API** - Payments v2, Orders, Refunds, Disputes
- **PayPal Webhooks** - Signature verification and event handling
- PayPal sandbox environment for testing

### Backend
- **Node.js 22.18+** - Runtime with native TypeScript support
- **TypeScript 5.9** - Type-safe development
- **Express 5** - Web server and API framework
- **SQLite** - Database with dual driver support (better-sqlite3, node:sqlite)
- **MCP SDK** - Model Context Protocol integration

### Frontend
- **React 19** - UI framework
- **Vite 8** - Build tool and dev server
- **AG Grid Community** - Data grid for ledger visualization
- **Inter Font** - Modern typography (@fontsource/inter)
- **IBM Plex Mono** - Monospace font for code

### Testing
- **Node Test Runner** - Built-in test framework
- **Playwright** - E2E browser testing
- **TypeScript** - Type checking

### Design
- **PayPal-inspired Colors** - Navy, blue, and gold palette
- **Responsive Design** - Mobile-first approach
- **Accessibility** - WCAG AA compliance goals

## Features Implemented

### Core Features (darkphoenix2208)
- Attack lab with 8 adversarial test vectors
- Webhook signature verification
- Price-match computation
- Item-scoped refund system
- Hash-chained audit ledger
- Concurrent refund handling
- PayPal-branded UI redesign

### Test Coverage
- 392 passing tests on both SQLite drivers (better-sqlite3 and node:sqlite)
- Attack lab tests (8 adversarial vectors)
- Webhook security tests
- Price-match tests
- Checkpoint verification tests
- Velocity tracking tests
- Mandate backtesting tests

## Acknowledgments

- **PayPal** for the hackathon opportunity and sandbox API access
- **Anthropic** for Claude AI development assistance
- **Node.js Team** for native TypeScript support in v22.18+
- **React Team** for React 19
- **AG Grid** for the community edition data grid

## License

MIT License - See LICENSE file for details

Copyright (c) 2026 darkphoenix2208

---

**All code, documentation, and implementation by darkphoenix2208**
