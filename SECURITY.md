# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 5.0.x   | :white_check_mark: |
| < 5.0   | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within crabclaw, please follow these steps:

### Do NOT

- Do NOT create a public GitHub issue for the vulnerability
- Do NOT attempt to exploit the vulnerability yourself
- Do NOT share vulnerability details with others

### DO

1. **Email the maintainer directly**:
   - Send an email to the project maintainer
   - Include a detailed description of the vulnerability
   - Provide steps to reproduce the issue
   - If possible, suggest a fix

2. **Wait for acknowledgment**:
   - Allow 48-72 hours for initial response
   - The maintainer will confirm receipt and begin investigation

3. **Coordinate disclosure**:
   - Work with the maintainer on disclosure timeline
   - Provide any additional information requested

---

## Security Best Practices

When using crabclaw, please follow these security best practices:

### API Keys

- Never commit API keys to version control
- Use environment variables for sensitive credentials
- Rotate API keys regularly
- Use read-only API keys when possible

### Authentication

- Enable authentication for all endpoints
- Use strong, unique passwords
- Implement proper session management
- Enable multi-factor authentication when available

### Data Protection

- Encrypt sensitive data at rest
- Use secure connections (HTTPS/WSS) for all communications
- Implement proper access controls
- Regularly backup important data

### Network Security

- Limit exposure of services to necessary networks
- Use firewalls appropriately
- Monitor for unusual activity
- Keep systems updated with security patches

---

## Configuration

### Environment Variables

Ensure these security-related environment variables are properly configured:

```env
# Server Security
PORT=3000
HOST=localhost

# Authentication
AUTH_ENABLED=true
SESSION_SECRET=your-secure-session-secret

# Database
DB_PATH=./data.db

# Encryption
ENCRYPTION_KEY=your-encryption-key
```

### Security Configuration File

For advanced security settings, refer to [SECURITY_CONFIG_GUIDE.md](docs/SECURITY_CONFIG_GUIDE.md).

---

## Updates

Security updates will be released as patch versions. We recommend:

- Watching the GitHub repository for releases
- Subscribing to security notifications
- Regularly updating to the latest version

---

## Contact

For security-related inquiries, please contact:

- **GitHub Issues**: [Security Advisory](https://github.com/skyhorse-x/crabclaw/security/advisories/new)
- **Repository**: [skyhorse-x/crabclaw](https://github.com/skyhorse-x/crabclaw)

---

## Acknowledgments

We appreciate the efforts of security researchers who help improve crabclaw's security. If you report a vulnerability, you will be acknowledged (unless you prefer to remain anonymous).

---

## Vulnerability Disclosure Policy

1. **Acknowledgment**: Within 48-72 hours, we will acknowledge receipt of your report
2. **Assessment**: We will assess the vulnerability and determine severity
3. **Fix Development**: We will develop a fix for the vulnerability
4. **Coordinated Disclosure**: We will coordinate disclosure with you
5. **Public Release**: Fix and disclosure details will be released publicly

---

Last updated: 2024
