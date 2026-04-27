# Contributing to HelixAgent

Thank you for your interest in contributing to HelixAgent! This document provides guidelines and instructions for contributing.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Reporting Issues](#reporting-issues)

---

## 🤝 Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow. Please be respectful and constructive in all interactions.

### Our Standards

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

---

## 🎯 Getting Started

### Prerequisites

- Node.js 18+ or Bun 1.0+
- TypeScript 5.0+
- Git

### Fork the Repository

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone git@github.com:skyhorse-x/crabclaw.git
   cd crabclaw
   ```

3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/skyhorse-x/crabclaw.git
   ```

---

## 🔧 Development Setup

### Install Dependencies

```bash
bun install
```

### Configure Environment

1. Copy the environment file:
   ```bash
   cp server/.env.example server/.env
   ```

2. Edit `server/.env` with your configuration

### Run Development Server

```bash
neu run
```

---

## ✏️ Making Changes

### Create a Branch

Create a branch for your changes:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix-name
```

### Keep Your Branch Updated

Regularly pull from the upstream repository:

```bash
git fetch upstream
git rebase upstream/main
```

### Make Your Changes

Make your changes to the codebase. Ensure you:

- Follow the existing code style
- Write clean, well-documented code
- Add tests for new functionality
- Update documentation as needed

---

## 📤 Submitting Changes

### Commit Your Changes

Write clear, concise commit messages:

```
feat: add new MCP server integration

- Added support for filesystem MCP server
- Updated tool registry to handle new server
- Added integration tests
```

### Push Your Changes

Push your branch to your fork:

```bash
git push origin feature/your-feature-name
```

### Create a Pull Request

1. Go to the original repository on GitHub
2. Click "New Pull Request"
3. Select your branch
4. Fill in the PR template:
   - **Title**: Clear, descriptive title
   - **Description**: Explain what and why
   - **Screenshots**: If UI changes
   - **Testing**: Describe how you tested

### PR Review Process

- Maintainers will review your PR
- Address any feedback or requested changes
- Once approved, your PR will be merged

---

## 📏 Coding Standards

### TypeScript

- Use strict TypeScript mode
- Avoid `any` type when possible
- Use interfaces for object shapes
- Export types explicitly

### Vue Components

- Use Composition API with `<script setup>`
- Props should be typed
- Use computed properties for derived data
- Follow Vue 3 best practices

### Error Handling

- Always handle errors with try-catch
- Provide meaningful error messages
- Log errors appropriately
- Return proper error responses from APIs

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `userName`, `isActive` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Functions | camelCase | `getUserData()` |
| Classes | PascalCase | `UserService` |
| Interfaces | PascalCase | `UserProfile` |
| Files | kebab-case | `user-service.ts` |

---

## 🧪 Testing

### Run Tests

```bash
bun test
```

### Write Tests

- Write tests for all new functionality
- Maintain test coverage
- Use descriptive test names

```typescript
describe('UserService', () => {
  it('should create a new user', async () => {
    const user = await userService.create({
      name: 'Test User',
      email: 'test@example.com'
    });
    expect(user.id).toBeDefined();
  });
});
```

---

## 🐛 Reporting Issues

### Before Creating an Issue

- Search existing issues first
- Verify the issue with the latest version
- Check if it works in a clean environment

### Creating an Issue

Use the [issue template](./.github/ISSUE_TEMPLATE/) and include:

- HelixAgent version
- Operating system
- Node.js/Bun version
- Clear steps to reproduce
- Expected vs actual behavior
- Relevant logs or screenshots

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## 🙏 Thank You!

Your contributions make the open-source community an amazing place to learn, inspire, and create. Thank you for your time and effort!

---

## 🔗 Links

- [Project Repository](https://github.com/skyhorse-x/crabclaw)
- [Issue Tracker](https://github.com/skyhorse-x/crabclaw/issues)
- [Discussions](https://github.com/skyhorse-x/crabclaw/discussions)

---

[简体中文](./CONTRIBUTING_zh.md) | English
