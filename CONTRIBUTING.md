# Contributing to CCO-MCP

Thank you for your interest in contributing to CCO-MCP! We welcome contributions from the community.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/cco-mcp.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Commit your changes: `git commit -m "feat: add amazing feature"`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Open a Pull Request

## Development Setup

```bash
# Install required tools
just brew

# Setup project dependencies
just setup

# Run both backend and UI
just dev-all

# Run tests
just test

# Run linter
just lint

# Format code
just format

# Build everything
just build-all
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, missing semicolons, etc)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Code Style

- TypeScript for all new code
- Use Prettier for formatting (runs automatically on commit)
- Follow existing patterns in the codebase
- Add types for all function parameters and return values

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Include both unit and integration tests where appropriate

## Pull Request Process

1. Update the README.md if needed
2. Ensure all tests pass
3. Update documentation for API changes
4. Get at least one code review approval
5. Squash commits if requested

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Questions?

Feel free to open an issue for any questions about contributing.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.