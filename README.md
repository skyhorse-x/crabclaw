# HelixAgent - Professional Desktop AI Agent Platform

<div align="center">

![Version](https://img.shields.io/badge/version-5.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

**Professional Desktop AI Agent Platform | Tool System | Task Planning | Memory System | Skill Orchestration | Multi-Agent Collaboration**

[English](README.md) | [简体中文](README_zh.md)

</div>

---

## 📖 Table of Contents

- [Introduction](#introduction)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Development](#development)
- [Deployment](#deployment)
- [FAQ](#faq)

---

## 📖 Introduction

### Project Background

**HelixAgent** is a professional-grade desktop AI Agent platform designed to provide developers and users with a fully-featured, extensible AI Agent development framework. The platform implements a modern layered architecture and integrates core capabilities including MCP (Model Context Protocol), intelligent task planning, unified tool system, memory system, skill orchestration, and multi-agent collaboration.

### Design Goals

1. **Modular Architecture** - Highly decoupled for easy extension and maintenance
2. **Standardized Protocols** - MCP protocol support for tool interoperability
3. **AI-Native** - Designed for AI-driven tool selection and task planning
4. **Desktop Integration** - Native desktop application with cross-platform deployment
5. **Production-Ready** - Complete error handling, logging, monitoring and alerting

### Core Problems Solved

| Problem | HelixAgent Solution |
|---------|-------------------|
| Fragmented tool calling | Unified tool registry with MCP protocol standardization |
| Complex task planning | Intelligent task decomposition with automatic dependency management |
| Difficult memory management | Dual-mode memory system with short-term + long-term layered management |
| Multi-agent collaboration | Complete multi-agent coordination mechanism |
| Insufficient continuous learning | Experience graph + reflection mechanism for continuous optimization |

---

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| 🧠 **Intelligent Task Planning** | Automatically decompose complex tasks into executable steps with dependency management and optimized ordering |
| 🔧 **Unified Tool System** | 8+ built-in tools, MCP tool adapter, AI-driven autonomous tool selection |
| 💾 **Dual-Mode Memory System** | Short-term conversation context + long-term persistent memory with semantic search |
| 🎯 **Skill Orchestration** | JSON-defined reusable skills with step orchestration execution and hot loading |
| ⚡ **Task Queue** | Concurrency control, priority scheduling, retry mechanism, timeout handling |
| 📊 **State Tracking** | Complete Agent lifecycle management with 11 state types |
| 🔌 **MCP Integration** | Standard Model Context Protocol support with 11 built-in servers |
| 🤖 **Multi-Agent Collaboration** | Subtask decomposition, parallel execution, result aggregation |
| 📈 **Deep Learning Reflection** | Experience summarization, causal analysis, strategy optimization |
| 🔗 **Bridge System** | Cross-language invocation, system command execution |
| 🌐 **WebSocket Communication** | Real-time communication, progress push, event subscription |
| 📦 **Plugin System** | Modular architecture with hot-swap support |

---

## 🏗️ Architecture

### Design Principles

1. **Layered Responsibility** - Each layer focuses on its own responsibilities
2. **Dependency Inversion** - High-level modules don't depend on low-level modules
3. **Interface Segregation** - Use small, focused interfaces
4. **Open-Closed Principle** - Open for extension, closed for modification

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          HelixAgent Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Presentation Layer                              │   │
│  │  ┌────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Vue 3 + Element Plus                         │ │   │
│  │  │  ChatView | AgentsView | TasksView | SkillsView | SettingsView  │ │   │
│  │  └────────────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       Service Layer                                  │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
│  │  │Agent Service │ │Task Service  │ │Skill Service │ │LLM Service │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Core Layer                                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
│  │  │Task Planner  │ │Tool Registry│ │Memory Manager│ │Bridge Svc  │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Learning Layer                                 │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
│  │  │Experience    │ │Pattern       │ │Strategy      │ │Reflection  │  │   │
│  │  │Graph         │ │Library       │ │Optimizer     │ │Mechanism   │  │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
crabclaw/
├── frontend/                 # Vue 3 Frontend Application
│   ├── src/
│   │   ├── components/       # Reusable Vue components
│   │   ├── views/            # Page views
│   │   ├── composables/      # Vue composables
│   │   ├── router/            # Vue Router config
│   │   ├── i18n/              # Internationalization
│   │   └── utils/             # Utility functions
│   └── index.html
├── server/                   # Node.js Backend Service
│   ├── agents/               # Agent implementations
│   ├── core/                 # Core server functionality
│   ├── handlers/             # Request handlers
│   ├── learning/             # Learning and reflection
│   ├── llm/                  # LLM providers and gateway
│   ├── memory/               # Memory management
│   ├── routes/               # API routes
│   ├── services/             # Business services
│   ├── skills/               # Skill system
│   └── tools/                # Tool implementations
├── docs/                     # Documentation
│   ├── guides/               # User guides
│   ├── technical/            # Technical documentation
│   ├── reports/              # Project reports
│   └── research/             # Research and analysis
├── data/                     # Data files
└── bin/                      # Executable binaries
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ / Bun 1.0+
- TypeScript 5.0+
- Neutralinojs CLI (for desktop builds)

### Installation

```bash
# Clone the repository
git clone https://github.com/qingfeng2055/HelixAgent.git
cd HelixAgent

# Install dependencies
bun install

# Start development server
bun run dev
```

### Configuration

1. Copy `.env.example` to `.env`
2. Configure your LLM provider API keys
3. Start the server with `bun run dev`

---

## 🔧 Configuration

### LLM Configuration

Configure your LLM provider in `server/.env`:

```env
OPENAI_API_KEY=your-api-key
ANTHROPIC_API_KEY=your-api-key
OLLAMA_BASE_URL=http://localhost:11434
```

### MCP Servers

MCP server configurations are located in `server/mcp-config.json`.

---

## 📖 Usage Guide

### Chat Interface

The main chat interface supports:
- Natural language conversation
- File operations
- Code generation and review
- Task delegation

### Agent Management

Create and manage multiple AI agents with different capabilities:
- System Agent - Central coordinator
- MCP Agent - Tool execution
- Intelligent Agent - AI-driven decision making

### Skill Marketplace

Browse and install skills from the marketplace or create your own using JSON definitions.

---

## 📡 API Reference

### Chat API

```http
POST /api/chat
Content-Type: application/json

{
  "message": "Your message here",
  "agentId": "agent-1",
  "context": {}
}
```

### Agent API

```http
GET /api/agents - List all agents
POST /api/agents - Create new agent
GET /api/agents/:id - Get agent details
DELETE /api/agents/:id - Delete agent
```

### Task API

```http
GET /api/tasks - List all tasks
POST /api/tasks - Create new task
GET /api/tasks/:id - Get task details
PUT /api/tasks/:id - Update task
```

---

## 🔨 Development

### Project Setup

```bash
# Install dev dependencies
bun install

# Run type checking
bun run typecheck

# Run linter
bun run lint

# Run tests
bun test
```

### Build

```bash
# Build frontend
cd frontend && bun run build

# Build backend
bun run build:server

# Build desktop app
bun run build:desktop
```

---

## 📦 Deployment

### Desktop Application

Use Neutralinojs to build cross-platform desktop applications:

```bash
bun run build:desktop
```

Executables will be generated in the `dist/` directory.

### Server Deployment

Deploy the backend server to your preferred platform:

```bash
bun run build:server
node dist/server/index.js
```

---

## 🔒 Security

Please refer to [SECURITY_CONFIG_GUIDE.md](docs/SECURITY_CONFIG_GUIDE.md) for security configuration details.

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🔗 Links

- [GitHub Repository](https://github.com/qingfeng2055/HelixAgent)
- [MCP Protocol Documentation](https://modelcontextprotocol.io)
- [Neutralinojs Documentation](https://neutralino.js.org)
- [Bun Runtime Documentation](https://bun.sh)

---

[简体中文](README_zh.md) | English
