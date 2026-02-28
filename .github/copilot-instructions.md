# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.5.7
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

---

## 📑 Table of Contents

1. [Project Context](#project-context)
2. [Code Quality & Standards](#code-quality--standards)
   - [Code Style Guidelines](#code-style-guidelines)
   - [ESLint Configuration](#eslint-configuration)
3. [Testing](#testing)
   - [Unit Testing](#unit-testing)
   - [Integration Testing](#integration-testing)
   - [API Testing with Credentials](#api-testing-with-credentials)
4. [Development Best Practices](#development-best-practices)
   - [Dependency Management](#dependency-management)
   - [HTTP Client Libraries](#http-client-libraries)
   - [Error Handling](#error-handling)
5. [Admin UI Configuration](#admin-ui-configuration)
   - [JSON-Config Setup](#json-config-setup)
   - [Translation Management](#translation-management)
6. [Documentation](#documentation)
   - [README Updates](#readme-updates)
   - [Changelog Management](#changelog-management)
7. [CI/CD & GitHub Actions](#cicd--github-actions)
   - [Workflow Configuration](#workflow-configuration)
   - [Testing Integration](#testing-integration)
8. [LG TV RS232 Development Guidelines](#lg-tv-rs232-development-guidelines)
9. [Security Guidelines](#security-guidelines)

---

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

### LG TV RS232 Adapter Specific Context

This adapter controls LG TV devices through RS232 serial communication using an Ethernet-to-Serial gateway. Key characteristics:

- **Primary Function**: Control LG TVs via RS232 commands over TCP/IP network connection
- **Target Hardware**: LG TV models with RS232 support (starting from LD750 series)
- **Gateway Requirement**: Arduino-compatible RS232-to-Ethernet converter running ArduinoSerialToEthernet firmware
- **Communication Protocol**: TCP socket connection to gateway, which translates to RS232 serial commands
- **Command Structure**: Uses predefined command set stored in `admin/commands.json`
- **Connection Details**: Default TCP connection to `127.0.0.1:23` (configurable via adapter settings)
- **State Management**: Creates `info.connection` state to track TV connection status

#### Hardware Architecture
```
ioBroker Adapter ↔ TCP/IP Network ↔ Arduino Gateway (W5100/W5500 + RS232-TTL) ↔ LG TV RS232 Port
```

#### Key Dependencies and Configuration
- **Core Framework**: `@iobroker/adapter-core` for base adapter functionality
- **Network Communication**: Built-in Node.js `net` module for TCP socket connections
- **Configuration**: Host IP and port settings for the Arduino gateway
- **Command Database**: JSON-based command definitions for LG TV control

---

## Code Quality & Standards

### Code Style Guidelines

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**Timer and Resource Cleanup Example:**
```javascript
private connectionTimer?: NodeJS.Timeout;

async onReady() {
  this.connectionTimer = setInterval(() => this.checkConnection(), 30000);
}

onUnload(callback) {
  try {
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    callback();
  } catch (e) {
    callback();
  }
}
```

### ESLint Configuration

**CRITICAL:** ESLint validation must run FIRST in your CI/CD pipeline, before any other tests. This "lint-first" approach catches code quality issues early.

#### Setup
```bash
npm install --save-dev eslint @iobroker/eslint-config
```

#### Configuration (.eslintrc.json)
```json
{
  "extends": "@iobroker/eslint-config",
  "rules": {
    // Add project-specific rule overrides here if needed
  }
}
```

#### Package.json Scripts
```json
{
  "scripts": {
    "lint": "eslint --max-warnings 0 .",
    "lint:fix": "eslint . --fix"
  }
}
```

#### Best Practices
1. ✅ Run ESLint before committing — fix ALL warnings, not just errors
2. ✅ Use `lint:fix` for auto-fixable issues
3. ✅ Don't disable rules without documentation
4. ✅ Lint all relevant files (main code, tests, build scripts)
5. ✅ Keep `@iobroker/eslint-config` up to date
6. ✅ **ESLint warnings are treated as errors in CI** (`--max-warnings 0`). The `lint` script above already includes this flag — run `npm run lint` to match CI behavior locally

#### Common Issues
- **Unused variables**: Remove or prefix with underscore (`_variable`)
- **Missing semicolons**: Run `npm run lint:fix`
- **Indentation**: Use 4 spaces (ioBroker standard)
- **console.log**: Replace with `adapter.log.debug()` or remove

---

## Testing

### Unit Testing

- Use Jest as the primary testing framework
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files

**Example Structure:**
```javascript
describe('AdapterName', () => {
  let adapter;
  
  beforeEach(() => {
    // Setup test adapter instance
  });
  
  test('should initialize correctly', () => {
    // Test adapter initialization
  });
});
```

### Integration Testing

**CRITICAL:** Use the official `@iobroker/testing` framework. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation:** https://github.com/ioBroker/testing

#### Framework Structure

**✅ Correct Pattern:**
```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        // Get adapter object
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) return reject(new Error('Adapter object not found'));

                        // Configure adapter
                        Object.assign(obj.native, {
                            host: '127.0.0.1',
                            port: 23,
                        });

                        harness.objects.setObject(obj._id, obj);
                        
                        // Start and wait
                        await harness.startAdapterAndWait();
                        await new Promise(resolve => setTimeout(resolve, 15000));

                        // Verify states
                        const stateIds = await harness.dbConnection.getStateIDs('lgtv-rs.0.*');
                        
                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
                            reject(new Error('Adapter did not create any states'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(40000);
        });
    }
});
```

#### Testing Success AND Failure Scenarios

**IMPORTANT:** For every "it works" test, implement corresponding "it fails gracefully" tests.

**LG TV RS232 Failure Scenario Examples:**
```javascript
it('should handle connection failure gracefully', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            console.log('🔍 Step 1: Fetching adapter object...');
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.lgtv-rs.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));
            console.log('✅ Step 1.5: Adapter object loaded');

            console.log('🔍 Step 2: Updating adapter config with invalid host...');
            Object.assign(obj.native, {
                host: '192.168.255.255', // Non-existent host to test failure
                port: 23
            });

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    console.log('✅ Step 2.5: Adapter object updated');
                    res(undefined);
                });
            });

            console.log('🔍 Step 3: Starting adapter...');
            await harness.startAdapterAndWait();
            console.log('✅ Step 4: Adapter started');

            console.log('⏳ Step 5: Waiting 20 seconds for connection attempt...');
            await new Promise((res) => setTimeout(res, 20000));

            console.log('🔍 Step 6: Checking connection state...');
            const connectionState = await new Promise((res, rej) => {
                harness.states.getState('lgtv-rs.0.info.connection', (err, state) => {
                    if (err) return rej(err);
                    res(state);
                });
            });

            if (connectionState && connectionState.val === false) {
                console.log('✅ Adapter correctly reports disconnected state');
                resolve(true);
            } else {
                console.log('❌ Adapter did not handle connection failure properly');
                return reject(new Error('Expected connection state to be false'));
            }

            await harness.stopAdapter();
            console.log('🛑 Adapter stopped');
        } catch (error) {
            reject(error);
        }
    });
}).timeout(40000);

// Example: Testing missing required configuration
it('should handle missing host configuration properly', function () {
    return new Promise(async (resolve, reject) => {
        try {
            harness = getHarness();
            
            const obj = await new Promise((res, rej) => {
                harness.objects.getObject('system.adapter.lgtv-rs.0', (err, o) => {
                    if (err) return rej(err);
                    res(o);
                });
            });
            
            if (!obj) return reject(new Error('Adapter object not found'));

            // Remove required configuration to test failure handling
            delete obj.native.host;

            await new Promise((res, rej) => {
                harness.objects.setObject(obj._id, obj, (err) => {
                    if (err) return rej(err);
                    res(undefined);
                });
            });

            await harness.startAdapterAndWait();
            await new Promise((res) => setTimeout(res, 10000));

            const stateIds = await harness.dbConnection.getStateIDs('lgtv-rs.0.*');

            if (stateIds.length === 0) {
                console.log('✅ Adapter properly handled missing configuration - no invalid states created');
                resolve(true);
            } else {
                const connectionState = await new Promise((res, rej) => {
                    harness.states.getState('lgtv-rs.0.info.connection', (err, state) => {
                        if (err) return rej(err);
                        res(state);
                    });
                });
                
                if (connectionState && connectionState.val === false) {
                    console.log('✅ Adapter created connection state but marked as disconnected due to config error');
                    resolve(true);
                } else {
                    reject(new Error('Adapter should not create valid connection without host configuration'));
                }
            }

            await harness.stopAdapter();
        } catch (error) {
            reject(error);
        }
    });
}).timeout(40000);
```

#### LG TV RS232 Network Connection Tests

For this adapter, add specific tests for:

```javascript
it('should handle network timeout properly', function () {
    // Test connection timeout scenarios
});

it('should reconnect after network interruption', function () {
    // Test automatic reconnection logic
});

it('should validate command format before sending', function () {
    // Test command validation for RS232 protocol
});
```

#### Key Rules

1. ✅ Use `@iobroker/testing` framework
2. ✅ Configure via `harness.objects.setObject()`
3. ✅ Start via `harness.startAdapterAndWait()`
4. ✅ Verify states via `harness.states.getState()`
5. ✅ Allow proper timeouts for async operations
6. ❌ NEVER test API URLs directly
7. ❌ NEVER bypass the harness system

#### Workflow Dependencies

Integration tests should run ONLY after lint and adapter tests pass:

```yaml
integration-tests:
  needs: [check-and-lint, adapter-tests]
  runs-on: ubuntu-22.04
```

### API Testing with Credentials

For adapters connecting to external APIs requiring authentication:

#### Password Encryption for Integration Tests

```javascript
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    if (!systemConfig?.native?.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    return result;
}
```

#### Demo Credentials Testing Pattern

- Use provider demo credentials when available (e.g., `demo@api-provider.com` / `demo`)
- Create separate test file: `test/integration-demo.js`
- Add npm script: `"test:integration-demo": "mocha test/integration-demo --exit"`
- Implement clear success/failure criteria

**Example Implementation:**
```javascript
it("Should connect to API with demo credentials", async () => {
    const encryptedPassword = await encryptPassword(harness, "demo_password");
    
    await harness.changeAdapterConfig("your-adapter", {
        native: {
            username: "demo@provider.com",
            password: encryptedPassword,
        }
    });

    await harness.startAdapter();
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
    
    if (connectionState?.val === true) {
        console.log("✅ SUCCESS: API connection established");
        return true;
    } else {
        throw new Error("API Test Failed: Expected API connection to be established with demo credentials. Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.).");
    }
}).timeout(120000);
```

---

## Development Best Practices

### Dependency Management

- Always use `npm` for dependency management
- Use `npm ci` for installing existing dependencies (respects package-lock.json)
- Use `npm install` only when adding or updating dependencies
- Keep dependencies minimal and focused
- Only update dependencies in separate Pull Requests

**When modifying package.json:**
1. Run `npm install` to sync package-lock.json
2. Commit both package.json and package-lock.json together

**Best Practices:**
- Prefer built-in Node.js modules when possible
- Use `@iobroker/adapter-core` for adapter base functionality
- Avoid deprecated packages
- Document specific version requirements

### HTTP Client Libraries

- **Preferred:** Use native `fetch` API (Node.js 20+ required)
- **Avoid:** `axios` unless specific features are required

**Example with fetch:**
```javascript
try {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  this.log.error(`API request failed: ${error.message}`);
}
```

**Other Recommendations:**
- **Logging:** Use adapter built-in logging (`this.log.*`)
- **Scheduling:** Use adapter built-in timers and intervals
- **File operations:** Use Node.js `fs/promises`
- **Configuration:** Use adapter config system

### Error Handling

- Always catch and log errors appropriately
- Use adapter log levels (error, warn, info, debug)
- Provide meaningful, user-friendly error messages
- Handle network failures gracefully
- Implement retry mechanisms where appropriate
- Always clean up timers, intervals, and resources in `unload()` method

**Example:**
```javascript
try {
  await this.connectToDevice();
} catch (error) {
  this.log.error(`Failed to connect to device: ${error.message}`);
  this.setState('info.connection', false, true);
  // Implement retry logic if needed
}
```

---

## Admin UI Configuration

### JSON-Config Setup

Use JSON-Config format for modern ioBroker admin interfaces.

**Example Structure:**
```json
{
  "type": "panel",
  "items": {
    "host": {
      "type": "text",
      "label": "Host address",
      "help": "IP address or hostname of the device"
    }
  }
}
```

**Guidelines:**
- ✅ Use consistent naming conventions
- ✅ Provide sensible default values
- ✅ Include validation for required fields
- ✅ Add tooltips for complex options
- ✅ Ensure translations for all supported languages (minimum English and German)
- ✅ Write end-user friendly labels, avoid technical jargon

### Translation Management

**CRITICAL:** Translation files must stay synchronized with `admin/jsonConfig.json`. Orphaned keys or missing translations cause UI issues and PR review delays.

#### Overview
- **Location:** `admin/i18n/{lang}/translations.json` for 11 languages (de, en, es, fr, it, nl, pl, pt, ru, uk, zh-cn)
- **Source of truth:** `admin/jsonConfig.json` - all `label` and `help` properties must have translations
- **Command:** `npm run translate` - auto-generates translations but does NOT remove orphaned keys
- **Formatting:** English uses tabs, other languages use 4 spaces

#### Critical Rules
1. ✅ Keys must match exactly with jsonConfig.json
2. ✅ No orphaned keys in translation files
3. ✅ All translations must be in native language (no English fallbacks)
4. ✅ Keys must be sorted alphabetically

#### Workflow for Translation Updates

**When modifying admin/jsonConfig.json:**

1. Make your changes to labels/help texts
2. Run automatic translation: `npm run translate`
3. Run validation: `node scripts/validate-translations.js`
4. Remove orphaned keys manually from all translation files
5. Add missing translations in native languages
6. Run: `npm run lint && npm run test`

#### Add Validation to package.json

```json
{
  "scripts": {
    "translate": "translate-adapter",
    "validate:translations": "node scripts/validate-translations.js",
    "pretest": "npm run lint && npm run validate:translations"
  }
}
```

#### Translation Checklist

Before committing changes to admin UI or translations:
1. ✅ Validation script shows "All keys match!" for all 11 languages
2. ✅ No orphaned keys in any translation file
3. ✅ All translations in native language
4. ✅ Keys alphabetically sorted
5. ✅ `npm run lint` passes
6. ✅ `npm run test` passes
7. ✅ Admin UI displays correctly

---

## Documentation

### README Updates

#### Required Sections
1. **Installation** - Clear npm/ioBroker admin installation steps
2. **Configuration** - Detailed configuration options with examples
3. **Usage** - Practical examples and use cases
4. **Changelog** - Version history (use "## **WORK IN PROGRESS**" for ongoing changes)
5. **License** - License information (typically MIT for ioBroker adapters)
6. **Support** - Links to issues, discussions, community support

#### Documentation Standards
- Use clear, concise language
- Include code examples for configuration
- Add screenshots for admin interface when applicable
- Maintain multilingual support (minimum English and German)
- Always reference issues in commits and PRs (e.g., "fixes #xx")

#### Mandatory README Updates for PRs

For **every PR or new feature**, always add a user-friendly entry to README.md:

- Add entries under `## **WORK IN PROGRESS**` section
- Use format: `* (author) **TYPE**: Description of user-visible change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements), **TESTING** (test additions), **CI/CD** (automation)
- Focus on user impact, not technical details

**Example:**
```markdown
## **WORK IN PROGRESS**

* (DutchmanNL) **FIXED**: Adapter now properly validates login credentials (fixes #25)
* (DutchmanNL) **NEW**: Added device discovery to simplify initial setup
```

### Changelog Management

Follow the [AlCalzone release-script](https://github.com/AlCalzone/release-script) standard.

#### Format Requirements

```markdown
# Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ## **WORK IN PROGRESS**
-->

## **WORK IN PROGRESS**

- (author) **NEW**: Added new feature X
- (author) **FIXED**: Fixed bug Y (fixes #25)

## v0.1.0 (2023-01-01)
Initial release
```

#### Workflow Process
- **During Development:** All changes go under `## **WORK IN PROGRESS**`
- **For Every PR:** Add user-facing changes to WORK IN PROGRESS section
- **Before Merge:** Version number and date added when merging to main
- **Release Process:** Release-script automatically converts placeholder to actual version

#### Change Entry Format
- Format: `- (author) **TYPE**: User-friendly description`
- Types: **NEW**, **FIXED**, **ENHANCED**
- Focus on user impact, not technical implementation
- Reference issues: "fixes #XX" or "solves #XX"

---

## CI/CD & GitHub Actions

### Workflow Configuration

#### GitHub Actions Best Practices

**Must use ioBroker official testing actions:**
- `ioBroker/testing-action-check@v1` for lint and package validation
- `ioBroker/testing-action-adapter@v1` for adapter tests
- `ioBroker/testing-action-deploy@v1` for automated releases with Trusted Publishing (OIDC)

**Configuration:**
- **Node.js versions:** Test on 20.x, 22.x, 24.x
- **Platform:** Use ubuntu-22.04
- **Automated releases:** Deploy to npm on version tags (requires NPM Trusted Publishing)
- **Monitoring:** Include Sentry release tracking for error monitoring

#### Critical: Lint-First Validation Workflow

**ALWAYS run ESLint checks BEFORE other tests.** Benefits:
- Catches code quality issues immediately
- Prevents wasting CI resources on tests that would fail due to linting errors
- Provides faster feedback to developers
- Enforces consistent code quality

**Workflow Dependency Configuration:**
```yaml
jobs:
  check-and-lint:
    # Runs ESLint and package validation
    # Uses: ioBroker/testing-action-check@v1
    
  adapter-tests:
    needs: [check-and-lint]  # Wait for linting to pass
    # Run adapter unit tests
    
  integration-tests:
    needs: [check-and-lint, adapter-tests]  # Wait for both
    # Run integration tests
```

**Key Points:**
- The `check-and-lint` job has NO dependencies - runs first
- ALL other test jobs MUST list `check-and-lint` in their `needs` array
- If linting fails, no other tests run, saving time
- Fix all ESLint errors before proceeding

### Testing Integration

#### API Testing in CI/CD

For adapters with external API dependencies:

```yaml
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

#### Testing Best Practices
- Run credential tests separately from main test suite
- Don't make credential tests required for deployment
- Provide clear failure messages for API issues
- Use appropriate timeouts for external calls (120+ seconds)

#### Package.json Integration
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

---

## LG TV RS232 Development Guidelines

### Test File Structure

Organize test files in the following structure:
```
test/
├── mocharc.custom.json         # Mocha configuration
├── integration.js              # Integration tests using @iobroker/testing
├── unit/                      # Unit tests
│   ├── adapter.test.js        # Main adapter functionality
│   └── helpers.test.js        # Helper functions
└── fixtures/                  # Test data files
    └── sample-commands.json    # Sample RS232 commands for testing
```

### Code Structure

#### Main Adapter File (`main.js`)
- Initialize with proper error handling for network connections
- Implement connection state tracking
- Handle RS232 command sending and response parsing
- Provide proper cleanup in `unload()` method

```javascript
class LgtvRs extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'lgtv-rs' });
        this.connected = false;
        this.client = null;
    }

    async onReady() {
        // Validate configuration
        if (!this.config.host) {
            this.log.error('No host configured');
            return;
        }
        
        // Initialize connection
        await this.connectToGateway();
    }

    async connectToGateway() {
        // TCP connection logic with error handling
    }

    onUnload(callback) {
        try {
            if (this.client) {
                this.client.destroy();
            }
            callback();
        } catch (e) {
            callback();
        }
    }
}
```

#### Configuration Validation

Always validate adapter configuration:
```javascript
validateConfig() {
    if (!this.config.host || this.config.host.trim() === '') {
        this.log.error('Host configuration is required');
        return false;
    }
    
    if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
        this.log.error('Valid port configuration is required (1-65535)');
        return false;
    }
    
    return true;
}
```

### State Management

#### Connection Status
Always maintain connection state:
```javascript
this.setStateAsync('info.connection', { val: connected, ack: true });
```

#### Command States
Create states for TV control commands based on `admin/commands.json`:
```javascript
async createCommandStates() {
    const commands = require('./admin/commands.json');
    for (const command of commands) {
        await this.setObjectNotExistsAsync(`commands.${command.id}`, {
            type: 'state',
            common: {
                name: command.name,
                type: 'boolean',
                role: 'button',
                read: false,
                write: true
            },
            native: {
                command: command.code
            }
        });
    }
}
```

### RS232 Communication Patterns

#### Command Structure
LG TV RS232 commands typically follow this pattern:
```
[Command][Space][Set_ID][Space][Data][Carriage Return]
```

Example implementation:
```javascript
sendCommand(command, setId = '01', data = '') {
    const cmdString = `${command} ${setId} ${data}\r`;
    if (this.client && this.connected) {
        this.client.write(cmdString);
        this.log.debug(`Sent command: ${cmdString.trim()}`);
    } else {
        this.log.warn('Cannot send command - not connected to gateway');
    }
}
```

### Logging Best Practices

Use appropriate log levels:
```javascript
this.log.error('Critical errors that prevent adapter from working');
this.log.warn('Important warnings about configuration or connectivity');
this.log.info('General adapter status and major operations');
this.log.debug('Detailed debugging information including commands sent/received');
```

### Performance Considerations

#### Connection Management
- Implement connection pooling for multiple TV control
- Use keep-alive mechanisms to prevent connection drops
- Handle reconnection with exponential backoff

#### Command Queuing
For multiple rapid commands:
```javascript
class CommandQueue {
    constructor(adapter) {
        this.adapter = adapter;
        this.queue = [];
        this.processing = false;
    }
    
    async addCommand(command, setId, data) {
        this.queue.push({ command, setId, data });
        if (!this.processing) {
            await this.processQueue();
        }
    }
    
    async processQueue() {
        this.processing = true;
        while (this.queue.length > 0) {
            const cmd = this.queue.shift();
            await this.adapter.sendCommand(cmd.command, cmd.setId, cmd.data);
            await new Promise(resolve => setTimeout(resolve, 100)); // Delay between commands
        }
        this.processing = false;
    }
}
```

---

## Security Guidelines

### Network Security
- Validate all incoming data from the gateway
- Implement proper timeout handling to prevent hanging connections
- Use secure network practices when configuring gateway connections

### Configuration Security
- Validate all user inputs in adapter configuration
- Sanitize command inputs to prevent injection attacks
- Log security-relevant events appropriately

### Access Control
- Document required network access for the gateway
- Provide guidance on firewall configuration
- Implement proper error messages without exposing sensitive system information

### Code Comments
Focus comments on:
- RS232 protocol specifics and command explanations
- Gateway communication patterns
- Error handling and recovery strategies
- Configuration requirements and validation logic

### Change Log Maintenance
Document all changes affecting:
- Command protocol modifications
- Gateway compatibility updates
- New supported TV models
- Breaking configuration changes
