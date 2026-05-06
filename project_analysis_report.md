# Project Report: AI-Powered Test Automation Tool

## 1. Project Overview & Aim
The **AI-Powered Test Automation Tool** is a next-generation software testing platform designed to simplify the test automation process. Its primary aim is to bridge the gap between manual and automated testing by allowing users to define test scenarios in **natural language** rather than writing complex code.

### Core Objectives:
- **Simplify Automation**: Enable non-technical users or busy QA engineers to create automated tests without writing Playwright or Selenium scripts.
- **AI-Driven Decision Making**: Use computer vision (Claude Vision) to "see" the application like a human and make intelligent decisions on what to click or fill.
- **Self-Healing Tests**: Since the AI analyzes the visual state, tests are less prone to breaking due to minor HTML structure changes that typically break traditional selector-based tests.
- **Comprehensive Logging**: Automatically record every step, screenshot, and AI reasoning for audit and debugging purposes.

---

## 2. Key Functionalities
- **Natural Language Parsing**: Translates user commands like *"Log in and add a product to the cart"* into actionable browser steps.
- **Visual Browser Control**: Uses Playwright to drive a real browser, capturing screenshots at every interaction.
- **Vision-Based Analysis**: Each screenshot is sent to **Claude Sonnet 3.5**, which analyzes the UI and returns the next logical step in a structured JSON format.
- **Persistent Storage**: All test data (test definitions, run history, individual steps, screenshots) is stored in a PostgreSQL database.
- **Real-time Feedback**: The backend tracks test progress, duration, and success rates, providing detailed error messages if a step fails.

---

## 3. Technical Architecture
The project follows a modern multi-tier architecture:

- **Frontend (React)**: *(Under Development)* A web-based dashboard for users to write tests, view run histories, and analyze statistics.
- **Backend (Node.js & Express)**: The engine that orchestrates the test execution, manages API requests, and handles integration with external AI services.
- **Database (PostgreSQL & Prisma)**: A relational database used for storing persistent metadata. Prisma is used as the ORM to manage schema and queries.
- **AI Integration**: Uses the `@anthropic-ai/sdk` to communicate with Claude's vision-capable models.
- **Automation Engine**: Uses `Playwright` for cross-browser testing and screenshot capture.

---

## 4. Environment Configuration (`.env`)
To run this project locally, you need a `.env` file in the `backend/` directory. Based on the source code, here are the required variables:

```env
# Server Configuration
PORT=3001

# Database Configuration (PostgreSQL)
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
DATABASE_URL="postgresql://username:password@localhost:5432/ai_test_db"

# AI Service Configuration (Anthropic)
# Get your key from https://console.anthropic.com/
CLAUDE_API_KEY="your_anthropic_api_key_here"
```

### Note on Configuration:
- **`DATABASE_URL`**: This is critical for Prisma to connect to your PostgreSQL instance. Make sure the database exists before running `npx prisma db push`.
- **`CLAUDE_API_KEY`**: The `aiService.js` specifically looks for this key to authenticate with Anthropic.
- **`PORT`**: Optional; the server defaults to `3001` if not provided.

---

## 5. Project Roadmap (Current Status)
- [x] **Phase 1-2**: Playwright setup and Database (Prisma) integration.
- [x] **Phase 3**: Backend API and AI Service (Claude) integration.
- [x] **Phase 3C**: Full AI-Browser feedback loop.
- [ ] **Phase 4**: Prompt Versioning and Optimization.
- [ ] **Phase 5**: Frontend Dashboard development.
- [ ] **Phase 6**: Dockerization and Sandbox environments.
